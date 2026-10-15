import type { QueryResult } from '@insightflow/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ToolCall } from './model';
import {
  executeClarify,
  executePropose,
  executeQuery,
  sanitiseClarification,
  toolDefinitions,
  type ToolContext,
} from './tools';

const call = (name: string, args: unknown): ToolCall => ({ id: 'c1', name, arguments: JSON.stringify(args) });

function result(
  rows: QueryResult['rows'],
  totals: QueryResult['totals'],
  label = 'Last 30 days',
): QueryResult {
  return {
    columns: [
      { key: 'payment_method', label: 'Payment Method', role: 'attribute' },
      { key: 'return_rate', label: 'Return Rate', role: 'measure', format: 'percent', decimals: 1 },
    ],
    rows,
    totals,
    meta: {
      range: { from: '2026-09-16', to: '2026-10-15', label },
      grain: null,
      truncated: false,
      empty: false,
      queryMs: 5,
      cached: false,
    },
  };
}

function ctx(runQuery = vi.fn()): ToolContext {
  return {
    runQuery,
    dashboardFilter: { preset: 'last_30_days' },
    now: new Date('2026-10-15T06:30:00Z'),
    dataRange: { from: '2024-10-16', to: '2026-10-15' },
    attributeValues: { region: ['North', 'South', 'West', 'East'], payment_method: ['UPI', 'Card', 'COD'] },
  };
}

describe('tool definitions', () => {
  it('declares the three tools with object parameters and catalog enums', () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(['propose_visualization', 'query_data', 'ask_clarification']);
    for (const d of defs) expect(d.parameters.type).toBe('object');
    expect(JSON.stringify(defs[0])).toContain('"revenue"');
  });
});

describe('propose_visualization', () => {
  it('emits a validated preview and remembers it for refinements', () => {
    const state = { openPreviewId: null as string | null };
    const first = executePropose(
      call('propose_visualization', { type: 'bar', measures: ['revenue'], attribute: { key: 'city' } }),
      ctx(),
      state,
    );
    expect(first.events[0]).toMatchObject({
      type: 'preview',
      replaces: false,
      config: { title: 'Revenue by City' },
    });
    const id = (first.events[0] as { previewId: string }).previewId;
    const second = executePropose(
      call('propose_visualization', {
        type: 'donut',
        measures: ['revenue'],
        attribute: { key: 'city' },
        replacesPreview: true,
      }),
      ctx(),
      state,
    );
    expect(second.events[0]).toMatchObject({
      type: 'preview',
      previewId: id,
      replaces: true,
      config: { type: 'donut' },
    });
  });

  it('never emits invalid proposals and explains why', () => {
    const state = { openPreviewId: null };
    const cases = [
      { type: 'donut', measures: ['aov'], attribute: { key: 'region' } }, // ratio donut
      { type: 'bar', measures: ['made_up'], attribute: { key: 'region' } }, // unknown key
      {
        type: 'bar',
        measures: ['revenue'],
        attribute: { key: 'region' },
        filter: { attribute: 'region', values: ['Southern'] },
      },
      {
        type: 'kpi',
        measures: ['revenue'],
        dateRange: { mode: 'custom', from: '2020-01-01', to: '2020-01-31' },
      },
    ];
    for (const args of cases) {
      const out = executePropose(call('propose_visualization', args), ctx(), state);
      expect(out.events).toEqual([]);
      expect(out.invalidProposal).toBe(true);
      expect(out.result).toMatch(/^ERROR/);
    }
    expect(
      executePropose({ id: 'x', name: 'propose_visualization', arguments: '{oops' }, ctx(), state)
        .invalidProposal,
    ).toBe(true);
  });
});

describe('query_data', () => {
  it('runs the engine with a table config and returns formatted rows and a source', async () => {
    const runQuery = vi.fn().mockResolvedValue(
      result(
        [
          { payment_method: 'COD', return_rate: 0.1234 },
          { payment_method: 'UPI', return_rate: 0.05 },
        ],
        { return_rate: 0.08 },
      ),
    );
    const out = await executeQuery(
      call('query_data', {
        measures: ['return_rate'],
        attributes: [{ key: 'payment_method' }],
        dateRange: { mode: 'preset', preset: 'last_30_days' },
      }),
      ctx(runQuery),
    );
    const sent = runQuery.mock.calls[0]![0];
    expect(sent.config.type).toBe('table');
    expect(sent.config.fields.columns.map((c: { key: string }) => c.key)).toEqual([
      'payment_method',
      'return_rate',
    ]);
    expect(sent.config.options.sort).toEqual({ by: 'return_rate', dir: 'desc' });
    const payload = JSON.parse(out.result);
    expect(payload.rows[0]).toEqual({ 'Payment Method': 'COD', 'Return Rate': '12.3%' });
    expect(payload.totals).toEqual({ 'Return Rate': '8.0%' });
    expect(out.source?.label).toBe(
      'Return Rate · by Payment Method · Last 30 days (16 Sep 2026 – 15 Oct 2026)',
    );
  });

  it('adds the previous period and change when compare is set', async () => {
    const runQuery = vi
      .fn()
      .mockResolvedValueOnce(result([{ payment_method: 'COD', return_rate: 0.12 }], { return_rate: 0.12 }))
      .mockResolvedValueOnce(
        result([{ payment_method: 'COD', return_rate: 0.1 }], { return_rate: 0.1 }, 'Custom'),
      );
    const out = await executeQuery(
      call('query_data', {
        measures: ['return_rate'],
        attributes: [{ key: 'payment_method' }],
        compare: true,
      }),
      ctx(runQuery),
    );
    expect(runQuery.mock.calls[1]![0].config.options.dateRange).toEqual({
      mode: 'custom',
      from: '2026-08-17',
      to: '2026-09-15',
    });
    const payload = JSON.parse(out.result);
    expect(payload.rows[0]['Return Rate change']).toBe('↑ 20.0%');
    expect(payload.totalChange).toEqual({ 'Return Rate': '↑ 20.0%' });
  });

  it('returns totals when there is no breakdown', async () => {
    const runQuery = vi.fn().mockResolvedValue({
      ...result([], { revenue: 1414712.5 }),
      columns: [{ key: 'revenue', label: 'Revenue', role: 'measure', format: 'currency' }],
    });
    const out = await executeQuery(call('query_data', { measures: ['revenue'] }), ctx(runQuery));
    expect(JSON.parse(out.result)).toEqual({
      period: 'Last 30 days (16 Sep 2026 – 15 Oct 2026)',
      totals: { Revenue: '₹14,14,713' },
    });
  });

  it('rejects unknown filter values without querying', async () => {
    const runQuery = vi.fn();
    const out = await executeQuery(
      call('query_data', {
        measures: ['revenue'],
        filter: { attribute: 'payment_method', values: ['Bitcoin'] },
      }),
      ctx(runQuery),
    );
    expect(out.result).toMatch(/has no value "Bitcoin"/);
    expect(runQuery).not.toHaveBeenCalled();
  });
});

describe('ask_clarification', () => {
  it('keeps only catalog options and caps questions', () => {
    const qs = sanitiseClarification({
      questions: [
        {
          question: 'What do you mean by sales?',
          options: [
            { label: 'Revenue', value: 'revenue', kind: 'measure', recommended: true },
            { label: 'Orders', value: 'orders', kind: 'measure' },
            { label: 'Profit after ads', value: 'ad_profit', kind: 'measure' },
          ],
        },
        {
          question: 'Broken down by?',
          options: [
            { label: 'Category', value: 'category', kind: 'attribute' },
            { label: 'No breakdown', value: 'none', kind: 'attribute' },
          ],
        },
        {
          question: 'Third?',
          options: [
            { label: 'Bar', value: 'bar', kind: 'type' },
            { label: 'Line', value: 'line', kind: 'type' },
          ],
        },
      ],
    });
    expect(qs).toHaveLength(2);
    expect(qs[0]!.options.map((o) => o.value)).toEqual(['revenue', 'orders']);
    expect(qs[0]!.recommended).toBe(0);
  });

  it('ends the turn when valid, and asks the model to use defaults when not', () => {
    const ok = executeClarify(
      call('ask_clarification', {
        questions: [
          {
            question: 'Which?',
            options: [
              { label: 'Revenue', value: 'revenue', kind: 'measure' },
              { label: 'Orders', value: 'orders', kind: 'measure' },
            ],
          },
        ],
      }),
    );
    expect(ok.endTurn).toBe(true);
    expect(ok.events[0]?.type).toBe('clarification');
    const bad = executeClarify(
      call('ask_clarification', {
        questions: [{ question: 'x', options: [{ label: 'a', value: 'zz', kind: 'measure' }] }],
      }),
    );
    expect(bad.endTurn).toBeUndefined();
    expect(bad.result).toMatch(/^ERROR/);
  });
});
