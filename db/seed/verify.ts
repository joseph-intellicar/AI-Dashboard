/**
 * pnpm db:verify — checks that the seeded data has the coverage and trends the app relies on.
 * Exits with code 1 if any check fails.
 */
import { sql, type RawBuilder } from 'kysely';
import { createDb, describeDbError, loadEnv } from '../src';
import { todayIst } from './dates';

interface Check {
  name: string;
  /** Must return one row: { pass: boolean, detail: string }. */
  query: RawBuilder<{ pass: boolean; detail: string }>;
}

/** "Today" for the checks: the seed anchor if fixed, otherwise the current IST date. */
const env = loadEnv();
const anchor = sql`${env.SEED_ANCHOR_DATE ?? todayIst()}::date`;

/** Small-domain attributes that must have data in every 30-day window. */
// prettier-ignore
const COVERAGE_COLUMNS = [
  'category', 'sub_category', 'collection', 'price_band', 'city', 'region', 'customer_type',
  'acquisition_source', 'channel', 'platform', 'payment_method', 'coupon_used', 'day_of_week',
];

const checks: Check[] = [
  ...COVERAGE_COLUMNS.map<Check>((col) => ({
    name: `Coverage: every ${col} value in each 30-day window`,
    query: sql`
      WITH b AS (
        SELECT (${anchor} - order_date) / 30 AS bucket, ${sql.ref(col)} AS v
        FROM v_order_lines WHERE (${anchor} - order_date) < 720
      ), per AS (SELECT bucket, count(DISTINCT v) AS n FROM b GROUP BY bucket),
      total AS (SELECT count(DISTINCT v) AS n FROM b)
      SELECT bool_and(per.n = total.n) AS pass,
             'min ' || min(per.n) || ' of ' || max(total.n) || ' values per window' AS detail
      FROM per, total`,
  })),
  {
    name: 'Coverage: every launched product sold in the last 30 days',
    query: sql`
      SELECT count(*) = 0 AS pass, count(*) || ' products with no sales' AS detail
      FROM products p
      WHERE p.launch_date <= ${anchor} - 30
        AND NOT EXISTS (SELECT 1 FROM v_order_lines l
                        WHERE l.product_id = p.id AND l.order_date > ${anchor} - 30)`,
  },
  {
    name: 'Coverage: channel × payment × region every month',
    query: sql`
      WITH months AS (SELECT DISTINCT order_month FROM v_orders),
      combos AS (
        SELECT m.order_month, c.channel, p.payment_method, r.name AS region
        FROM months m
        CROSS JOIN (VALUES ('Website'), ('App'), ('Marketplace')) c(channel)
        CROSS JOIN (VALUES ('UPI'), ('Card'), ('COD')) p(payment_method)
        CROSS JOIN regions r)
      SELECT count(*) = 0 AS pass, count(*) || ' empty month/combination cells' AS detail
      FROM combos k
      WHERE NOT EXISTS (SELECT 1 FROM v_orders o
                        WHERE o.order_month = k.order_month AND o.channel = k.channel
                          AND o.payment_method = k.payment_method AND o.region = k.region)`,
  },
  {
    name: 'Coverage: orders today and yesterday',
    query: sql`
      SELECT count(DISTINCT order_date) = 2 AS pass, count(*) || ' orders in the last 2 days' AS detail
      FROM v_orders WHERE order_date >= ${anchor} - 1`,
  },
  {
    name: 'Views: line totals match order totals',
    query: sql`
      SELECT abs((SELECT sum(line_net) FROM v_order_lines) - (SELECT sum(order_net) FROM v_orders)) < 0.01 AS pass,
             'lines ₹' || (SELECT round(sum(line_net)) FROM v_order_lines) ||
             ' vs orders ₹' || (SELECT round(sum(order_net)) FROM v_orders) AS detail`,
  },
  {
    name: 'Trend: COD return rate > 2× UPI',
    query: sql`
      WITH r AS (
        SELECT payment_method,
               avg((order_status = 'Returned')::int) FILTER (WHERE order_status IN ('Delivered', 'Returned')) AS rate
        FROM v_orders GROUP BY payment_method)
      SELECT (SELECT rate FROM r WHERE payment_method = 'COD') > 2 * (SELECT rate FROM r WHERE payment_method = 'UPI') AS pass,
             string_agg(payment_method || ' ' || round(rate * 100, 1) || '%', ', ' ORDER BY rate DESC) AS detail
      FROM r`,
  },
  {
    name: 'Trend: App share up, Marketplace share down',
    query: sql`
      WITH s AS (
        SELECT CASE WHEN order_date > ${anchor} - 90 THEN 'last' ELSE 'first' END AS period,
               avg((channel = 'App')::int) AS app, avg((channel = 'Marketplace')::int) AS mkt
        FROM v_orders WHERE order_date > ${anchor} - 90 OR order_date < ${anchor} - 630
        GROUP BY 1)
      SELECT (SELECT app FROM s WHERE period = 'last') > (SELECT app FROM s WHERE period = 'first')
         AND (SELECT mkt FROM s WHERE period = 'last') < (SELECT mkt FROM s WHERE period = 'first') AS pass,
             'App ' || round((SELECT app FROM s WHERE period = 'first') * 100) || '% → ' ||
             round((SELECT app FROM s WHERE period = 'last') * 100) || '%, Marketplace ' ||
             round((SELECT mkt FROM s WHERE period = 'first') * 100) || '% → ' ||
             round((SELECT mkt FROM s WHERE period = 'last') * 100) || '%' AS detail`,
  },
  {
    name: 'Trend: Lighting stock-out ~2 months ago',
    query: sql`
      WITH d AS (
        SELECT sum(line_net) FILTER (WHERE ${anchor} - order_date BETWEEN 50 AND 70) / 21.0 AS dip,
               sum(line_net) FILTER (WHERE ${anchor} - order_date BETWEEN 71 AND 150) / 80.0 AS normal
        FROM v_order_lines WHERE is_valid AND category = 'Lighting')
      SELECT dip < 0.5 * normal AND dip > 0 AS pass,
             'Lighting ₹' || round(dip) || '/day in dip vs ₹' || round(normal) || '/day before' AS detail
      FROM d`,
  },
  {
    name: 'Trend: total revenue dips during the stock-out',
    query: sql`
      WITH d AS (
        SELECT sum(line_net) FILTER (WHERE ${anchor} - order_date BETWEEN 50 AND 70) / 21.0 AS dip,
               sum(line_net) FILTER (WHERE ${anchor} - order_date BETWEEN 71 AND 120) / 50.0 AS before
        FROM v_order_lines WHERE is_valid)
      SELECT dip < 0.95 * before AS pass,
             'total ₹' || round(dip) || '/day in dip vs ₹' || round(before) || '/day before' AS detail
      FROM d`,
  },
  {
    name: 'Trend: festive spike led by Decor',
    query: sql`
      WITH season AS (
        SELECT make_date(y, 10, 15) AS f_from, make_date(y, 11, 15) AS f_to, make_date(y, 9, 1) AS s_from
        FROM (SELECT extract(year FROM ${anchor} - 60)::int - 1 AS y) t),
      rev AS (
        SELECT category,
               sum(line_net) FILTER (WHERE order_date BETWEEN f_from AND f_to) AS festive,
               sum(line_net) FILTER (WHERE order_date BETWEEN s_from AND s_from + 29) AS sept
        FROM v_order_lines, season WHERE is_valid GROUP BY category),
      top AS (SELECT category FROM rev ORDER BY festive DESC LIMIT 1)
      SELECT (SELECT category FROM top) = 'Decor' AND sum(festive) / 32.0 > 1.25 * sum(sept) / 30.0 AS pass,
             'top category ' || (SELECT category FROM top) || ', festive ₹' || round(sum(festive) / 32.0) ||
             '/day vs Sept ₹' || round(sum(sept) / 30.0) || '/day' AS detail
      FROM rev`,
  },
  {
    name: 'Trend: breakout product in the Top 10 (last 30 days)',
    query: sql`
      WITH top AS (
        SELECT product_name FROM v_order_lines
        WHERE is_valid AND order_date > ${anchor} - 30
        GROUP BY product_name ORDER BY sum(line_net) DESC LIMIT 10)
      SELECT EXISTS (SELECT 1 FROM top WHERE product_name LIKE 'Aroma Reed Diffuser%') AS pass,
             'Top 10: ' || (SELECT string_agg(left(product_name, 18), ', ') FROM top) AS detail`,
  },
  {
    name: 'Trend: coupons → higher AOV, lower margin',
    query: sql`
      WITH c AS (
        SELECT coupon_used, avg(order_net) AS aov, sum(order_profit) / sum(order_net) AS margin
        FROM v_orders WHERE is_valid GROUP BY coupon_used)
      SELECT (SELECT aov FROM c WHERE coupon_used = 'Yes') > (SELECT aov FROM c WHERE coupon_used = 'No')
         AND (SELECT margin FROM c WHERE coupon_used = 'Yes') < (SELECT margin FROM c WHERE coupon_used = 'No') AS pass,
             string_agg(coupon_used || ': AOV ₹' || round(aov) || ', margin ' || round(margin * 100, 1) || '%', '; ') AS detail
      FROM c`,
  },
  {
    name: 'Trend: Referral customers repeat more than Instagram',
    query: sql`
      WITH per AS (
        SELECT acquisition_source, customer_id, count(*) AS n FROM v_orders WHERE is_valid GROUP BY 1, 2),
      r AS (SELECT acquisition_source, avg((n > 1)::int) AS repeat_rate FROM per GROUP BY 1)
      SELECT (SELECT repeat_rate FROM r WHERE acquisition_source = 'Referral') >
             (SELECT repeat_rate FROM r WHERE acquisition_source = 'Instagram') AS pass,
             string_agg(acquisition_source || ' ' || round(repeat_rate * 100) || '%', ', ' ORDER BY repeat_rate DESC) AS detail
      FROM r`,
  },
  {
    name: 'Trend: South is the largest region',
    query: sql`
      WITH r AS (SELECT region, sum(line_net) AS rev FROM v_order_lines WHERE is_valid GROUP BY region)
      SELECT (SELECT region FROM r ORDER BY rev DESC LIMIT 1) = 'South' AS pass,
             string_agg(region || ' ' || round(rev / 100000) || 'L', ', ' ORDER BY rev DESC) AS detail
      FROM r`,
  },
];

async function main() {
  const db = createDb({ purpose: 'admin', env, maxConnections: 4 });
  const rows: { check: string; result: string; detail: string }[] = [];
  try {
    for (const c of checks) {
      const { rows: out } = await c.query.execute(db);
      const r = out[0];
      rows.push({ check: c.name, result: r?.pass ? 'PASS' : 'FAIL', detail: r?.detail ?? '' });
    }
  } catch (err) {
    console.error(`Verify failed: ${describeDbError(err)}`);
    process.exitCode = 1;
    return;
  } finally {
    await db.destroy();
  }
  console.table(rows);
  const failed = rows.filter((r) => r.result === 'FAIL').length;
  console.log(failed ? `${failed} check(s) failed` : `All ${rows.length} checks passed`);
  if (failed) process.exitCode = 1;
}

main();
