import { QueryConfigSchema, type QueryConfig } from '@insightflow/shared';
import { describe, expect, it } from 'vitest';
import { dummyDb } from '../testing';
import { bucketStart, dateBuckets } from './buckets';
import { buildQuery } from './buildSql';
import { TtlCache } from './cache';
import { bucketOther, configError, createQueryEngine, gapFill, planQuery, shapeResult } from './engine';

const NOW = new Date('2026-10-15T04:30:00Z');
const LAST_30 = { preset: 'last_30_days' } as const;

function cfg(input: unknown): QueryConfig {
  return QueryConfigSchema.parse(input);
}

const bar = cfg({
  type: 'bar',
  fields: { measures: [{ key: 'revenue' }], attributes: [{ key: 'category' }] },
  options: {
    sort: { by: 'revenue', dir: 'desc' },
    limit: 5,
    filter: { attribute: 'region', op: 'in', values: ["South'; DROP TABLE orders;--"] },
  },
});

describe('buildQuery', () => {
  it('binds every value as a parameter and only uses catalog identifiers', () => {
    const plan = planQuery(bar, LAST_30, NOW);
    const compiled = buildQuery({
      measures: plan.measures,
      groups: plan.groups,
      filter: { column: 'region', op: 'in', values: ["South'; DROP TABLE orders;--"] },
      current: plan.range,
      sort: plan.sort,
      limit: 6,
    }).compile(dummyDb());
    expect(compiled.sql).not.toContain('DROP TABLE');
    expect(compiled.parameters).toContain("South'; DROP TABLE orders;--");
    expect(compiled.parameters).toEqual(expect.arrayContaining(['2026-09-16', '2026-10-15', 6]));
    expect(compiled.sql).toMatch(/GROUPING SETS \(\(period, "category"\), \(period\)\)/);
    expect(compiled.sql).toMatch(/"region"::text IN \(\$\d+\)/);
    expect(compiled.sql).toMatch(/ORDER BY "revenue" DESC NULLS LAST LIMIT \$\d+/);
  });

  it('rejects identifiers that are not plain keys', () => {
    expect(() =>
      buildQuery({
        measures: ['revenue'],
        groups: [{ alias: 'x; drop', column: 'city' }],
        current: { from: '2026-01-01', to: '2026-01-31' },
      }),
    ).toThrow(/Unsafe identifier/);
  });

  it('includes the previous period and a repeat-rate CTE when needed', () => {
    const compiled = buildQuery({
      measures: ['repeat_rate'],
      groups: [],
      current: { from: '2026-09-16', to: '2026-10-15' },
      previous: { from: '2026-08-17', to: '2026-09-15' },
    }).compile(dummyDb());
    expect(compiled.sql).toContain('rep AS');
    expect(compiled.parameters).toEqual(expect.arrayContaining(['2026-08-17', '2026-09-15']));
  });
});

describe('planQuery', () => {
  it('uses daily buckets up to 90 days and monthly beyond', () => {
    const line = cfg({
      type: 'line',
      fields: { measures: [{ key: 'revenue' }], attributes: [{ key: 'order_date', grain: 'auto' }] },
      options: {},
    });
    expect(planQuery(line, LAST_30, NOW).groups[0]).toMatchObject({ column: 'order_date', grain: 'day' });
    expect(planQuery(line, { preset: 'last_12_months' }, NOW).groups[0]).toMatchObject({
      column: 'order_month',
      grain: 'month',
    });
  });

  it('uses the widget’s own range instead of the dashboard filter', () => {
    const own = cfg({
      type: 'kpi',
      fields: { measures: [{ key: 'revenue' }] },
      options: { dateRange: { mode: 'preset', preset: 'yesterday' }, compare: true },
    });
    const plan = planQuery(own, LAST_30, NOW);
    expect(plan.range).toMatchObject({ from: '2026-10-14', to: '2026-10-14' });
    expect(plan.previous).toEqual({ from: '2026-10-13', to: '2026-10-13' });
  });

  it('adds the KPI secondary measure', () => {
    const k = cfg({
      type: 'kpi',
      fields: { measures: [{ key: 'gross_profit' }] },
      options: { secondaryMeasure: 'margin_pct' },
    });
    expect(planQuery(k, LAST_30, NOW).measures).toEqual(['gross_profit', 'margin_pct']);
  });
});

describe('post-processing', () => {
  it('fills missing dates with zeros (and ratios with null)', () => {
    const rows = gapFill(
      [{ order_date: '2026-10-02', revenue: 5, aov: 2 }],
      'order_date',
      ['2026-10-01', '2026-10-02', '2026-10-03'],
      ['revenue', 'aov'],
    );
    expect(rows).toEqual([
      { order_date: '2026-10-01', revenue: 0, aov: null },
      { order_date: '2026-10-02', revenue: 5, aov: 2 },
      { order_date: '2026-10-03', revenue: 0, aov: null },
    ]);
  });

  it('groups the smallest slices into Other', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((city, i) => ({ city, revenue: 100 - i * 10 }));
    const out = bucketOther(rows, 'city', 'revenue', 6);
    expect(out).toHaveLength(6);
    expect(out.at(-1)).toEqual({ city: 'Other', revenue: 50 + 40 + 30 });
    expect(bucketOther(rows.slice(0, 4), 'city', 'revenue')).toHaveLength(4);
  });

  it('applies the limit, marks truncation and reports totals', () => {
    const plan = planQuery(cfg({ ...bar, options: { ...bar.options, filter: null } }), LAST_30, NOW);
    const raw = [
      ...['Decor', 'Bath', 'Kitchen', 'Storage', 'Bedding', 'Lighting'].map((category, i) => ({
        period: 'current' as const,
        is_total: 0,
        category,
        revenue: 600 - i * 100,
      })),
      { period: 'current' as const, is_total: 1, category: null, revenue: 2100 },
    ];
    const result = shapeResult(plan, raw, 12);
    expect(result.rows.map((r) => r.category)).toEqual(['Decor', 'Bath', 'Kitchen', 'Storage', 'Bedding']);
    expect(result.meta.truncated).toBe(true);
    expect(result.totals).toEqual({ revenue: 2100 });
    expect(result.columns.map((c) => c.key)).toEqual(['category', 'revenue']);
  });

  it('returns null previous totals when the previous period has no data', () => {
    const k = cfg({ type: 'kpi', fields: { measures: [{ key: 'revenue' }] }, options: { compare: true } });
    const result = shapeResult(
      planQuery(k, LAST_30, NOW),
      [{ period: 'current', is_total: 1, revenue: 10 }],
      1,
    );
    expect(result.previous?.totals).toEqual({ revenue: null });
    expect(result.meta.previousRange).toEqual({ from: '2026-08-17', to: '2026-09-15' });
  });
});

describe('buckets', () => {
  it('starts weeks on Monday and quarters on the first month', () => {
    expect(bucketStart('2026-10-15', 'week')).toBe('2026-10-12');
    expect(bucketStart('2026-11-20', 'quarter')).toBe('2026-10-01');
    expect(dateBuckets({ from: '2025-10-16', to: '2026-10-15' }, 'month')).toHaveLength(13);
    expect(dateBuckets({ from: '2026-09-16', to: '2026-10-15' }, 'day')).toHaveLength(30);
  });
});

describe('errors and caching', () => {
  it('maps unknown keys and slot rule failures', () => {
    const unknown = QueryConfigSchema.safeParse({
      type: 'kpi',
      fields: { measures: [{ key: 'nope' }] },
      options: {},
    });
    expect(configError(unknown.error!)).toMatchObject({ status: 400, code: 'UNKNOWN_FIELD' });
    const noDate = QueryConfigSchema.safeParse({
      type: 'line',
      fields: { measures: [{ key: 'revenue' }], attributes: [] },
      options: {},
    });
    expect(configError(noDate.error!)).toMatchObject({
      code: 'INVALID_CONFIG',
      message: 'Line chart needs a date attribute',
    });
  });

  it('serves repeated queries from cache', async () => {
    const run = createQueryEngine(dummyDb(), { now: () => NOW, cache: new TtlCache() });
    const body = { config: { type: 'kpi', fields: { measures: [{ key: 'revenue' }] }, options: {} } };
    expect((await run(body)).meta.cached).toBe(false);
    expect((await run(body)).meta.cached).toBe(true);
  });

  it('expires cache entries', () => {
    let t = 0;
    const cache = new TtlCache<number>(1000, 10, () => t);
    cache.set('a', 1);
    t = 999;
    expect(cache.get('a')).toBe(1);
    t = 1001;
    expect(cache.get('a')).toBeUndefined();
  });
});
