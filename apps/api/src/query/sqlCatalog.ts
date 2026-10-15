/**
 * Server-only SQL behind each catalog measure (REQUIREMENTS §11.3).
 *
 * Expressions aggregate the `per_order` CTE (one row per order × group, see buildSql.ts), whose columns are:
 *   order_id, customer_id, is_valid, order_status, customer_type, delivery_days,
 *   net, gross, discount, profit, units
 * Orders are always counted with count(DISTINCT order_id) so totals stay correct when an order
 * spans several groups (e.g. two categories).
 */
import type { MeasureKey } from '@insightflow/shared';
import { sql, type RawBuilder } from 'kysely';

const VALID = sql`is_valid`;
const REACHED = sql`order_status IN ('Delivered', 'Returned')`;

const sumValid = (col: string) => sql`coalesce(sum(${sql.ref(col)}) FILTER (WHERE ${VALID}), 0)::float8`;
const ordersWhere = (cond: RawBuilder<unknown>) => sql`count(DISTINCT order_id) FILTER (WHERE ${cond})`;
const ratio = (num: RawBuilder<unknown>, den: RawBuilder<unknown>) =>
  sql`(${num})::float8 / nullif(${den}, 0)`;

/** `repeat_rate` is computed in its own CTE and joined in; see buildSql. */
export const REPEAT_RATE = 'repeat_rate' as const;

export const MEASURE_SQL: Record<Exclude<MeasureKey, typeof REPEAT_RATE>, RawBuilder<unknown>> = {
  revenue: sumValid('net'),
  orders: ordersWhere(VALID),
  units_sold: sumValid('units'),
  aov: ratio(sql`sum(net) FILTER (WHERE ${VALID})`, ordersWhere(VALID)),
  gross_profit: sumValid('profit'),
  margin_pct: ratio(sql`sum(profit) FILTER (WHERE ${VALID})`, sql`sum(net) FILTER (WHERE ${VALID})`),
  customers: sql`count(DISTINCT customer_id) FILTER (WHERE ${VALID})`,
  return_rate: ratio(ordersWhere(sql`order_status = 'Returned'`), ordersWhere(REACHED)),
  gross_sales: sumValid('gross'),
  discounts: sumValid('discount'),
  discount_pct: ratio(sql`sum(discount) FILTER (WHERE ${VALID})`, sql`sum(gross) FILTER (WHERE ${VALID})`),
  orders_placed: sql`count(DISTINCT order_id)`,
  returned_orders: ordersWhere(sql`order_status = 'Returned'`),
  cancellation_rate: ratio(ordersWhere(sql`order_status = 'Cancelled'`), sql`count(DISTINCT order_id)`),
  new_customers: sql`count(DISTINCT customer_id) FILTER (WHERE customer_type = 'New' AND order_status <> 'Cancelled')`,
  units_per_order: ratio(sql`sum(units) FILTER (WHERE ${VALID})`, ordersWhere(VALID)),
  avg_delivery_days: sql`avg(delivery_days) FILTER (WHERE ${REACHED})::float8`,
};
