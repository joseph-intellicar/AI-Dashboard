import { describe, expect, it } from 'vitest';
import {
  describeQuery,
  proposalToConfig,
  ProposeArgsSchema,
  queryArgsToChart,
  queryArgsToTableConfig,
  QueryDataArgsSchema,
  type ProposeArgsInput,
} from './ai';
import { validateForBuilder } from './widgetConfig';

const propose = (args: ProposeArgsInput) => proposalToConfig(ProposeArgsSchema.parse(args));

describe('proposalToConfig', () => {
  it('builds a valid bar chart with builder defaults and an auto title', () => {
    const r = propose({
      type: 'bar',
      measures: ['revenue'],
      attribute: { key: 'city' },
      dateRange: { mode: 'custom', from: '2026-10-02', to: '2026-10-15' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateForBuilder(r.config).valid).toBe(true);
    expect(r.config.title).toBe('Revenue by City');
    expect(r.config.options.sort).toEqual({ by: 'revenue', dir: 'desc' });
    expect(r.config.options.limit).toBe(10);
    expect(r.config.options.dateRange).toEqual({ mode: 'custom', from: '2026-10-02', to: '2026-10-15' });
  });

  it('rejects slot-rule violations with builder messages', () => {
    const donut = propose({ type: 'donut', measures: ['aov'], attribute: { key: 'region' } });
    expect(donut).toEqual({
      ok: false,
      problems: [expect.stringMatching(/Donut needs a measure that adds up/)],
    });
    const line = propose({ type: 'line', measures: ['revenue'], attribute: { key: 'category' } });
    expect(line.ok).toBe(false);
    const kpi = propose({ type: 'kpi', measures: [] });
    expect(kpi).toMatchObject({ ok: false, problems: ['Pick a measure to continue'] });
    const incompatible = propose({ type: 'bar', measures: ['revenue'], attribute: { key: 'return_reason' } });
    expect(incompatible.ok).toBe(false);
  });

  it('rejects unknown catalog keys at parse time', () => {
    expect(ProposeArgsSchema.safeParse({ type: 'bar', measures: ['profit_margin_x'] }).success).toBe(false);
    expect(ProposeArgsSchema.safeParse({ type: 'pie', measures: ['revenue'] }).success).toBe(false);
  });

  it('keeps a custom title, defaults KPI compare on and caps donut slices', () => {
    const kpi = propose({ type: 'kpi', measures: ['orders'], title: 'Orders this month' });
    expect(kpi).toMatchObject({ ok: true, config: { title: 'Orders this month', titleIsCustom: true } });
    if (kpi.ok) expect(kpi.config.options.compare).toBe(true);
    const donut = propose({ type: 'donut', measures: ['revenue'], attribute: { key: 'channel' } });
    if (donut.ok) expect(donut.config.options.limit).toBe(6);
  });

  it('builds tables from columns', () => {
    const r = propose({
      type: 'table',
      columns: [
        { kind: 'attribute', key: 'product' },
        { kind: 'measure', key: 'units_sold' },
      ],
      limit: 10,
    });
    expect(r.ok && r.config.fields.columns?.map((c) => c.key)).toEqual(['product', 'units_sold']);
    expect(propose({ type: 'table', columns: [{ kind: 'measure', key: 'nope' }] }).ok).toBe(false);
  });
});

describe('query_data conversions', () => {
  const args = QueryDataArgsSchema.parse({
    measures: ['return_rate'],
    attributes: [{ key: 'payment_method' }],
    dateRange: { mode: 'preset', preset: 'last_12_months' },
  });

  it('runs as a table config', () => {
    const t = queryArgsToTableConfig(args);
    expect(t.fields.columns?.map((c) => c.key)).toEqual(['payment_method', 'return_rate']);
  });

  it('turns into the builder-suggested chart', () => {
    const r = queryArgsToChart(args);
    expect(r).toMatchObject({ ok: true, config: { type: 'bar', title: 'Return Rate by Payment Method' } });
    const trend = queryArgsToChart(
      QueryDataArgsSchema.parse({
        measures: ['revenue'],
        attributes: [{ key: 'order_date', grain: 'month' }],
      }),
    );
    expect(trend).toMatchObject({ ok: true, config: { type: 'line' } });
    const total = queryArgsToChart(QueryDataArgsSchema.parse({ measures: ['orders'] }));
    expect(total).toMatchObject({ ok: true, config: { type: 'kpi' } });
  });

  it('describes the query', () => {
    expect(describeQuery({ ...args, filter: { attribute: 'region', op: 'in', values: ['South'] } })).toBe(
      'Return Rate · by Payment Method · Region: South',
    );
  });
});
