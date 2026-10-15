import { describe, expect, it } from 'vitest';
import { ModelError, ToolCallAssembler, withFallback, type ChatModel, type ModelEvent } from './model';
import { scriptedModel, text } from './testing';

async function collect(model: ChatModel): Promise<ModelEvent[]> {
  const events: ModelEvent[] = [];
  for await (const e of model.stream({ messages: [], tools: [] })) events.push(e);
  return events;
}

function failing(after: ModelEvent[], error: ModelError): ChatModel {
  return {
    name: 'primary',
    async *stream() {
      yield* after;
      throw error;
    },
  };
}

describe('withFallback', () => {
  it('uses the fallback when the primary fails before any output', async () => {
    const fallback = scriptedModel([[text('from fallback')]]);
    const model = withFallback(failing([], new ModelError('down', 'unavailable', 503)), fallback);
    expect(await collect(model)).toEqual([text('from fallback')]);
    expect(fallback.requests).toHaveLength(1);
  });

  it('also falls back on a timeout', async () => {
    const fallback = scriptedModel([[text('ok')]]);
    const model = withFallback(failing([], new ModelError('slow', 'timeout')), fallback);
    expect(await collect(model)).toEqual([text('ok')]);
  });

  it('does not fall back after output was streamed', async () => {
    const fallback = scriptedModel([[text('never')]]);
    const model = withFallback(
      failing([text('partial')], new ModelError('down', 'unavailable', 500)),
      fallback,
    );
    await expect(collect(model)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fallback.requests).toHaveLength(0);
  });

  it('does not fall back on rate limits or rejected requests', async () => {
    for (const err of [new ModelError('busy', 'rate_limited', 429), new ModelError('bad', 'rejected', 400)]) {
      const fallback = scriptedModel([[text('never')]]);
      await expect(collect(withFallback(failing([], err), fallback))).rejects.toBe(err);
      expect(fallback.requests).toHaveLength(0);
    }
  });
});

describe('ToolCallAssembler', () => {
  it('joins fragments by index and keeps order', () => {
    const a = new ToolCallAssembler();
    a.add({ index: 1, id: 'b', function: { name: 'query_data', arguments: '{"x"' } });
    a.add({ index: 0, id: 'a', function: { name: 'propose_', arguments: '{' } });
    a.add({ index: 0, function: { name: 'visualization', arguments: '}' } });
    a.add({ index: 1, function: { arguments: ':1}' } });
    expect(a.calls()).toEqual([
      { id: 'a', name: 'propose_visualization', arguments: '{}' },
      { id: 'b', name: 'query_data', arguments: '{"x":1}' },
    ]);
  });
});
