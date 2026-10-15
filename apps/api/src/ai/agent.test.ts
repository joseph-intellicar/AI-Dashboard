import { AiChatRequestSchema, type AiEvent } from '@insightflow/shared';
import { describe, expect, it, vi } from 'vitest';
import { MAX_PROPOSAL_RETRIES, runTurn, type TurnInput } from './agent';
import { ChatRateLimiter } from './rateLimit';
import { toModelHistory } from './routes';
import { call, scriptedModel, text } from './testing';
import { toolDefinitions } from './tools';

const bar = { type: 'bar', measures: ['revenue'], attribute: { key: 'city' } };

function setup(rounds: Parameters<typeof scriptedModel>[0], extra: Partial<TurnInput> = {}) {
  const events: AiEvent[] = [];
  const model = scriptedModel(rounds);
  const input: TurnInput = {
    model,
    system: 'SYSTEM',
    history: [{ role: 'user', content: 'Show revenue by city' }],
    tools: toolDefinitions(),
    toolCtx: {
      runQuery: vi.fn(),
      dashboardFilter: { preset: 'last_30_days' },
      now: new Date('2026-10-15T06:30:00Z'),
      dataRange: { from: '2024-10-16', to: '2026-10-15' },
      attributeValues: {},
    },
    state: { openPreviewId: null },
    emit: (e) => events.push(e),
    ...extra,
  };
  return { events, model, input };
}

describe('runTurn', () => {
  it('streams text, runs a proposal and finishes when the model stops calling tools', async () => {
    const { events, model, input } = setup([
      [call('propose_visualization', bar)],
      [text('Here is revenue by city.')],
    ]);
    const summary = await runTurn(input);
    expect(events[0]).toEqual({ type: 'status', text: 'Building the chart…' });
    expect(events.map((e) => e.type)).toEqual(['status', 'preview', 'text', 'done']);
    expect(summary.toolCalls).toEqual(['propose_visualization']);
    // The second model call sees the tool result.
    const sent = model.requests[1]!.messages;
    expect(sent[0]).toEqual({ role: 'system', content: 'SYSTEM' });
    expect(sent.at(-1)).toMatchObject({ role: 'tool', content: expect.stringMatching(/^OK: preview/) });
  });

  it('never emits an invalid proposal, and stops retrying after the limit', async () => {
    const bad = { type: 'donut', measures: ['aov'], attribute: { key: 'region' } };
    const rounds = Array.from({ length: MAX_PROPOSAL_RETRIES + 1 }, () => [
      call('propose_visualization', bad),
    ]);
    const { events, model, input } = setup([...rounds, [text('Sorry, I could not build that.')]]);
    await runTurn(input);
    expect(events.some((e) => e.type === 'preview')).toBe(false);
    const lastTool = model.requests.at(-1)!.messages.at(-1)!;
    expect(String(lastTool.content)).toMatch(/Do NOT try again/);
  });

  it('ends the turn after a clarification', async () => {
    const { events, model, input } = setup([
      [
        text('Which one?'),
        call('ask_clarification', {
          questions: [
            {
              question: 'What do you mean by sales?',
              options: [
                { label: 'Revenue', value: 'revenue', kind: 'measure', recommended: true },
                { label: 'Orders', value: 'orders', kind: 'measure' },
              ],
            },
          ],
        }),
      ],
    ]);
    await runTurn(input);
    expect(model.requests).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(['text', 'clarification', 'done']);
  });

  it('caps tool rounds and says so', async () => {
    const forever = Array.from({ length: 10 }, () => [call('propose_visualization', bar)]);
    const { events, model, input } = setup(forever, { maxRounds: 3 });
    await runTurn(input);
    expect(model.requests).toHaveLength(3);
    const said = events
      .filter((e) => e.type === 'text')
      .map((e) => (e as { delta: string }).delta)
      .join('');
    expect(said).toMatch(/couldn't finish/);
  });

  it('reports sources from data queries before done', async () => {
    const runQuery = vi.fn().mockResolvedValue({
      columns: [{ key: 'orders', label: 'Orders', role: 'measure', format: 'number' }],
      rows: [{ orders: 120 }],
      totals: { orders: 120 },
      meta: {
        range: { from: '2026-09-16', to: '2026-10-15', label: 'Last 30 days' },
        grain: null,
        truncated: false,
        empty: false,
        queryMs: 1,
        cached: false,
      },
    });
    const { events, input } = setup([
      [call('query_data', { measures: ['orders'] })],
      [text('You had 120 orders.')],
    ]);
    input.toolCtx.runQuery = runQuery;
    await runTurn(input);
    expect(events.map((e) => e.type)).toEqual(['status', 'text', 'sources', 'done']);
  });

  it('stops quietly when aborted', async () => {
    const controller = new AbortController();
    const { events, input } = setup([
      () => {
        controller.abort();
        return [text('partial')];
      },
    ]);
    const summary = await runTurn({ ...input, signal: controller.signal });
    expect(summary.aborted).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });
});

describe('ChatRateLimiter', () => {
  it('allows 20 per minute and 200 per IST day per user', () => {
    const limiter = new ChatRateLimiter(20, 200);
    const t0 = Date.parse('2026-10-15T06:00:00Z');
    for (let i = 0; i < 20; i++) expect(limiter.take('a', t0 + i)).toBeNull();
    expect(limiter.take('a', t0 + 100)).toBe('minute');
    expect(limiter.take('b', t0 + 100)).toBeNull();
    expect(limiter.take('a', t0 + 61_000)).toBeNull();
    const day = new ChatRateLimiter(1000, 3);
    for (let i = 0; i < 3; i++) day.take('a', t0 + i * 1000);
    expect(day.take('a', t0 + 5000)).toBe('day');
    expect(day.take('a', Date.parse('2026-10-15T19:00:00Z'))).toBeNull(); // next IST day
  });
});

describe('toModelHistory', () => {
  it('summarises previews and drops a leading assistant welcome', () => {
    const body = AiChatRequestSchema.parse({
      messages: [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Revenue by city' },
        {
          role: 'assistant',
          content: 'Here you go.',
          previews: [{ previewId: 'p_1', title: 'Revenue by City', type: 'bar' }],
        },
        { role: 'user', content: 'make it a donut' },
      ],
    });
    expect(toModelHistory(body.messages)).toEqual([
      { role: 'user', content: 'Revenue by city' },
      { role: 'assistant', content: 'Here you go.\n[Previews shown: p_1 "Revenue by City" (bar)]' },
      { role: 'user', content: 'make it a donut' },
    ]);
  });
});
