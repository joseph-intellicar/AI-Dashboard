/**
 * Builds the single SQL statement behind a widget query.
 *
 *   base       filtered order lines (current + optional previous period), with group keys
 *   per_order  one row per period × group × order (line sums, order fields)
 *   agg        measures per group and per period total (GROUPING SETS)
 *   rep        repeat-customer rate per group and per total (only when requested)
 *   final      current groups (sorted, limited) + totals [+ previous groups for line comparisons]
 *
 * Only catalog-controlled identifiers reach the SQL text; every value is a bound parameter.
 */
import type { DateRange, MeasureKey } from '@insightflow/shared';
import { sql, type RawBuilder } from 'kysely';
import { MEASURE_SQL, REPEAT_RATE } from './sqlCatalog';

export interface GroupKey {
  /** Output alias — the catalog attribute key. */
  alias: string;
  /** Reporting-view column (already grain-resolved for dates). */
  column: string;
}

export interface QueryPlan {
  measures: MeasureKey[];
  groups: GroupKey[];
  filter?: { column: string; op: 'in' | 'not_in'; values: string[] } | null;
  current: DateRange;
  previous?: DateRange | null;
  /** Return previous-period group rows too (line comparison). */
  previousRows?: boolean;
  sort?: { alias: string; dir: 'asc' | 'desc' } | null;
  /** Applied to current-period group rows only. */
  limit?: number | null;
}

export interface RawRow {
  period: 'current' | 'previous';
  is_total: number;
  [alias: string]: unknown;
}

const KEY = /^[a-z][a-z0-9_]*$/;

function assertIdentifier(name: string): string {
  if (!KEY.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return name;
}

export function buildQuery(plan: QueryPlan): RawBuilder<RawRow> {
  const groups = plan.groups.map((g) => ({
    alias: assertIdentifier(g.alias),
    column: assertIdentifier(g.column),
  }));
  const measures = plan.measures.map(assertIdentifier) as MeasureKey[];
  const g = groups.map((x) => sql.ref(x.alias));
  const withRepeat = measures.includes(REPEAT_RATE);

  // ---------- base ----------
  const { current, previous } = plan;
  const inCurrent = sql`order_date BETWEEN ${current.from}::date AND ${current.to}::date`;
  const inPrevious = previous
    ? sql`order_date BETWEEN ${previous.from}::date AND ${previous.to}::date`
    : null;
  const where: RawBuilder<unknown>[] = [inPrevious ? sql`(${inCurrent} OR ${inPrevious})` : inCurrent];
  for (const grp of groups) where.push(sql`${sql.ref(grp.column)} IS NOT NULL`);
  if (plan.filter && plan.filter.values.length) {
    const col = sql.ref(assertIdentifier(plan.filter.column));
    const list = sql.join(plan.filter.values.map((v) => sql`${v}`));
    where.push(plan.filter.op === 'in' ? sql`${col}::text IN (${list})` : sql`${col}::text NOT IN (${list})`);
  }
  const groupSelect = groups.map((grp) => sql`${sql.ref(grp.column)}::text AS ${sql.id(grp.alias)}`);

  const base = sql`
    SELECT
      CASE WHEN ${inCurrent} THEN 'current' ELSE 'previous' END AS period,
      ${sql.join([...groupSelect, sql`order_id`], sql`, `)},
      customer_id, is_valid, order_status, customer_type, delivery_days,
      line_net, line_gross, line_discount, line_profit, quantity
    FROM v_order_lines
    WHERE ${sql.join(where, sql` AND `)}`;

  const perOrderKeys = sql.join([sql`period`, ...g, sql`order_id`, sql`customer_id`], sql`, `);
  const perOrder = sql`
    SELECT ${perOrderKeys},
      bool_and(is_valid) AS is_valid,
      max(order_status) AS order_status,
      max(customer_type) AS customer_type,
      max(delivery_days) AS delivery_days,
      sum(line_net) AS net, sum(line_gross) AS gross, sum(line_discount) AS discount,
      sum(line_profit) AS profit, sum(quantity) AS units
    FROM base
    GROUP BY ${perOrderKeys}`;

  // ---------- agg ----------
  const measureSelect = measures
    .filter((m) => m !== REPEAT_RATE)
    .map((m) => sql`${MEASURE_SQL[m as Exclude<MeasureKey, 'repeat_rate'>]} AS ${sql.id(m)}`);
  const isTotal = groups.length ? sql`GROUPING(${g[0]!})` : sql`1`;
  const groupBy = groups.length
    ? sql`GROUPING SETS ((${sql.join([sql`period`, ...g], sql`, `)}), (period))`
    : sql`period`;
  const agg = sql`
    SELECT period, ${isTotal} AS is_total
      ${groups.length ? sql`, ${sql.join(g, sql`, `)}` : sql``}
      ${measureSelect.length ? sql`, ${sql.join(measureSelect, sql`, `)}` : sql``}
    FROM per_order
    GROUP BY ${groupBy}`;

  // ---------- rep (repeat customers) ----------
  const nullGroups = groups.map((grp) => sql`NULL::text AS ${sql.id(grp.alias)}`);
  const rep = withRepeat
    ? sql`
    , rep AS (
      ${
        groups.length
          ? sql`SELECT period, 0 AS is_total, ${sql.join(g, sql`, `)}, avg((n >= 2)::int)::float8 AS repeat_rate
        FROM (SELECT period, ${sql.join(g, sql`, `)}, customer_id, count(DISTINCT order_id) AS n
              FROM per_order WHERE is_valid GROUP BY period, ${sql.join(g, sql`, `)}, customer_id) x
        GROUP BY period, ${sql.join(g, sql`, `)}
      UNION ALL`
          : sql``
      }
      SELECT period, 1 AS is_total${nullGroups.length ? sql`, ${sql.join(nullGroups, sql`, `)}` : sql``},
             avg((n >= 2)::int)::float8 AS repeat_rate
      FROM (SELECT period, customer_id, count(DISTINCT order_id) AS n
            FROM per_order WHERE is_valid GROUP BY period, customer_id) y
      GROUP BY period)`
    : sql``;

  const joinOn = sql.join(
    [
      sql`rep.period = agg.period`,
      sql`rep.is_total = agg.is_total`,
      ...groups.map((grp) => sql`rep.${sql.id(grp.alias)} IS NOT DISTINCT FROM agg.${sql.id(grp.alias)}`),
    ],
    sql` AND `,
  );
  const res = withRepeat
    ? sql`SELECT agg.*, coalesce(rep.repeat_rate, 0) AS repeat_rate FROM agg LEFT JOIN rep ON ${joinOn}`
    : sql`SELECT * FROM agg`;

  // ---------- final ----------
  const order = plan.sort
    ? sql`ORDER BY ${sql.ref(assertIdentifier(plan.sort.alias))} ${sql.raw(plan.sort.dir === 'asc' ? 'ASC' : 'DESC')} NULLS LAST`
    : groups.length
      ? sql`ORDER BY ${sql.join(g, sql`, `)}`
      : sql``;
  const limit = plan.limit ? sql`LIMIT ${plan.limit}` : sql``;

  const branches = [
    sql`(SELECT * FROM res WHERE period = 'current' AND is_total = 0 ${order} ${limit})`,
    sql`(SELECT * FROM res WHERE is_total = 1)`,
  ];
  if (plan.previousRows && previous && groups.length) {
    branches.push(sql`(SELECT * FROM res WHERE period = 'previous' AND is_total = 0)`);
  }

  return sql<RawRow>`
    WITH base AS (${base}),
    per_order AS (${perOrder}),
    agg AS (${agg})
    ${rep},
    res AS (${res})
    ${sql.join(branches, sql` UNION ALL `)}`;
}
