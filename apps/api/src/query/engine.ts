/**
 * Runs a widget query: validate → resolve dates → build SQL from the catalog → post-process.
 * See ARCHITECTURE §6.4.
 */
import type { DB } from '@insightflow/db';
import {
  DONUT_MAX_SLICES,
  DateFilterSchema,
  OTHER_LABEL,
  QueryConfigSchema,
  autoGrain,
  effectiveDateFilter,
  getAttribute,
  getMeasure,
  previousRange,
  resolveDateFilter,
  usedFields,
  type AttributeRef,
  type DateFilter,
  type DateGrain,
  type DateRange,
  type MeasureKey,
  type QueryConfig,
  type QueryResult,
  type ResultColumn,
  type ResultRow,
} from '@insightflow/shared';
import { z, type ZodError } from 'zod';
import { AppError } from '../errors';
import { buildQuery, type GroupKey, type RawRow } from './buildSql';
import { GRAIN_COLUMN, dateBuckets } from './buckets';
import { TtlCache } from './cache';

export const QueryRequestSchema = z.object({
  config: z.unknown(),
  dashboardDateFilter: DateFilterSchema.default({ preset: 'last_30_days' }),
});

const MAX_GROUP_ROWS = 1000;

/** Converts schema errors into API errors (unknown keys get their own code). */
export function configError(err: ZodError): AppError {
  const issue = err.issues[0];
  const path = issue?.path ?? [];
  if (issue && (issue.code === 'invalid_value' || issue.code === 'invalid_union') && path.at(-1) === 'key') {
    return new AppError(400, 'UNKNOWN_FIELD', `Unknown field at ${path.join('.')}`);
  }
  const where = path.length && issue?.code !== 'custom' ? ` (${path.join('.')})` : '';
  return new AppError(400, 'INVALID_CONFIG', `${issue?.message ?? 'Invalid widget settings'}${where}`);
}

interface Plan {
  config: QueryConfig;
  measures: MeasureKey[];
  attributes: AttributeRef[];
  groups: (GroupKey & { grain: DateGrain | null })[];
  dateGroup: string | null;
  grain: DateGrain | null;
  range: ReturnType<typeof resolveDateFilter>;
  previous: DateRange | null;
  previousRows: boolean;
  sort: { alias: string; dir: 'asc' | 'desc' } | null;
  limit: number | null;
}

export function planQuery(config: QueryConfig, dashboardFilter: DateFilter, now: Date): Plan {
  const { measures: used, attributes } = usedFields(config);
  const measures = [
    ...new Set([...used, ...(config.options.secondaryMeasure ? [config.options.secondaryMeasure] : [])]),
  ];
  const filter = effectiveDateFilter(config.options.dateRange, dashboardFilter);
  const range = resolveDateFilter(filter, now);
  const isKpi = config.type === 'kpi';

  let grain: DateGrain | null = null;
  // KPIs are grouped by date so the same statement also returns the sparkline series.
  const groupAttrs: AttributeRef[] = isKpi ? [{ key: 'order_date', grain: 'auto' }] : attributes;
  const groups = groupAttrs.map((a) => {
    const def = getAttribute(a.key);
    if (def.kind !== 'date') return { alias: a.key, column: def.column, grain: null };
    const g: DateGrain = !a.grain || a.grain === 'auto' ? autoGrain(range) : a.grain;
    grain = g;
    return { alias: a.key, column: GRAIN_COLUMN[g], grain: g };
  });
  const dateGroup = groups.find((g) => g.grain)?.alias ?? null;

  const wantsCompare = config.options.compare && (isKpi || config.type === 'line');
  const previous = wantsCompare ? previousRange(filter, range) : null;

  const sortable = new Set<string>([...measures, ...groups.map((g) => g.alias)]);
  let sort: Plan['sort'] = null;
  if (dateGroup && groups.length === 1) sort = { alias: dateGroup, dir: 'asc' };
  else if (config.options.sort && sortable.has(config.options.sort.by))
    sort = { alias: config.options.sort.by, dir: config.options.sort.dir };
  else if (groups.length && measures[0]) sort = { alias: measures[0], dir: 'desc' };

  let limit: number | null = null;
  if (!isKpi && config.type !== 'donut' && !(dateGroup && groups.length === 1)) {
    limit = config.options.limit ?? null;
  }

  return {
    config,
    measures,
    attributes,
    groups,
    dateGroup,
    grain,
    range,
    previous,
    previousRows: Boolean(previous && config.type === 'line'),
    sort,
    limit,
  };
}

function pick(row: RawRow, keys: string[]): ResultRow {
  const out: ResultRow = {};
  for (const k of keys) out[k] = (row[k] ?? null) as string | number | null;
  return out;
}

function emptyMeasures(measures: MeasureKey[]): Record<string, number | null> {
  return Object.fromEntries(measures.map((m) => [m, getMeasure(m).aggregation === 'ratio' ? null : 0]));
}

/** Adds zero rows for dates with no orders so lines don't skip days. */
export function gapFill(
  rows: ResultRow[],
  dateKey: string,
  buckets: string[],
  measures: MeasureKey[],
): ResultRow[] {
  const byDate = new Map(rows.map((r) => [r[dateKey] as string, r]));
  return buckets.map((b) => byDate.get(b) ?? { [dateKey]: b, ...emptyMeasures(measures) });
}

/** Top N−1 slices plus "Other" (sum of the rest) when there are more than N values. */
export function bucketOther(
  rows: ResultRow[],
  groupKey: string,
  measure: string,
  maxSlices = DONUT_MAX_SLICES,
): ResultRow[] {
  const sorted = [...rows].sort((a, b) => Number(b[measure] ?? 0) - Number(a[measure] ?? 0));
  if (sorted.length <= maxSlices) return sorted;
  const top = sorted.slice(0, maxSlices - 1);
  const rest = sorted.slice(maxSlices - 1).reduce((sum, r) => sum + Number(r[measure] ?? 0), 0);
  return [...top, { [groupKey]: OTHER_LABEL, [measure]: rest }];
}

function sortRows(rows: ResultRow[], sort: Plan['sort']): ResultRow[] {
  if (!sort) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.alias];
    const y = b[sort.alias];
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'en-IN') * dir;
  });
}

function columnsFor(plan: Plan): ResultColumn[] {
  const measureCol = (key: string): ResultColumn => {
    const m = getMeasure(key);
    return {
      key,
      label: m.label,
      role: 'measure',
      format: m.format,
      ...(m.decimals ? { decimals: m.decimals } : {}),
    };
  };
  const attrCol = (key: string): ResultColumn => ({ key, label: getAttribute(key).label, role: 'attribute' });

  if (plan.config.type === 'kpi') return plan.measures.map(measureCol);
  if (plan.config.type === 'table') {
    return (plan.config.fields.columns ?? []).map((c) =>
      c.kind === 'measure' ? measureCol(c.key) : attrCol(c.key),
    );
  }
  return [...plan.groups.map((g) => attrCol(g.alias)), ...plan.measures.map(measureCol)];
}

export function shapeResult(plan: Plan, raw: RawRow[], queryMs: number): QueryResult {
  const groupKeys = plan.groups.map((g) => g.alias);
  const keys = [...groupKeys, ...plan.measures];
  const totalsRow = raw.find((r) => r.period === 'current' && r.is_total === 1);
  const prevTotalsRow = raw.find((r) => r.period === 'previous' && r.is_total === 1);

  let rows = raw.filter((r) => r.period === 'current' && r.is_total === 0).map((r) => pick(r, keys));
  rows = sortRows(rows, plan.sort);

  let truncated = false;
  if (plan.limit && rows.length > plan.limit) {
    truncated = true;
    rows = rows.slice(0, plan.limit);
  }

  let previousRows: ResultRow[] | undefined;
  if (plan.dateGroup && plan.groups.length === 1 && plan.grain) {
    rows = gapFill(rows, plan.dateGroup, dateBuckets(plan.range, plan.grain), plan.measures);
    if (plan.previousRows && plan.previous) {
      const prev = raw.filter((r) => r.period === 'previous' && r.is_total === 0).map((r) => pick(r, keys));
      previousRows = gapFill(prev, plan.dateGroup, dateBuckets(plan.previous, plan.grain), plan.measures);
    }
  }

  if (plan.config.type === 'donut' && groupKeys[0] && plan.measures[0]) {
    const max = Math.min(plan.config.options.limit ?? DONUT_MAX_SLICES, DONUT_MAX_SLICES);
    rows = bucketOther(rows, groupKeys[0], plan.measures[0], max);
  }

  const totals = totalsRow
    ? (pick(totalsRow, plan.measures) as Record<string, number | null>)
    : emptyMeasures(plan.measures);
  const result: QueryResult = {
    columns: columnsFor(plan),
    rows,
    totals,
    meta: {
      range: { from: plan.range.from, to: plan.range.to, label: plan.range.label },
      grain: plan.grain,
      truncated,
      empty: !totalsRow,
      queryMs,
      cached: false,
    },
  };
  if (plan.previous) {
    result.meta.previousRange = plan.previous;
    result.previous = {
      totals: prevTotalsRow
        ? (pick(prevTotalsRow, plan.measures) as Record<string, number | null>)
        : emptyMeasures(plan.measures),
      ...(previousRows ? { rows: previousRows } : {}),
    };
    // No orders at all in the previous period → nothing to compare against.
    if (!prevTotalsRow) result.previous.totals = Object.fromEntries(plan.measures.map((m) => [m, null]));
  }
  return result;
}

export interface QueryEngineOptions {
  now?: () => Date;
  cache?: TtlCache<QueryResult>;
}

export function createQueryEngine(
  db: DB,
  { now = () => new Date(), cache = new TtlCache<QueryResult>() }: QueryEngineOptions = {},
) {
  return async function runQuery(body: unknown): Promise<QueryResult> {
    const request = QueryRequestSchema.parse(body);
    const parsed = QueryConfigSchema.safeParse(request.config);
    if (!parsed.success) throw configError(parsed.error);

    const plan = planQuery(parsed.data, request.dashboardDateFilter, now());
    const filter = parsed.data.options.filter;
    const sqlPlan = {
      measures: plan.measures,
      groups: plan.groups,
      filter: filter
        ? { column: getAttribute(filter.attribute).column, op: filter.op, values: filter.values }
        : null,
      current: plan.range,
      previous: plan.previous,
      previousRows: plan.previousRows,
      sort: plan.dateGroup && plan.groups.length === 1 ? null : plan.sort,
      limit: plan.limit ? plan.limit + 1 : plan.config.type === 'donut' ? null : MAX_GROUP_ROWS,
    };

    const cacheKey = JSON.stringify([sqlPlan, plan.config.type, plan.config.options.limit]);
    const hit = cache.get(cacheKey);
    if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };

    const started = performance.now();
    let raw: RawRow[];
    try {
      raw = (
        await buildQuery({ ...sqlPlan, current: { from: plan.range.from, to: plan.range.to } }).execute(db)
      ).rows;
    } catch (err) {
      if (/timeout/i.test((err as Error).message)) {
        throw new AppError(504, 'QUERY_TIMEOUT', 'The query took too long — try a shorter date range');
      }
      throw err;
    }
    const result = shapeResult(plan, raw, Math.round(performance.now() - started));
    cache.set(cacheKey, result);
    return result;
  };
}
