import { sql, type Kysely } from 'kysely';

/**
 * Reporting layer: every widget query runs against these two views.
 * All date parts are calendar dates in Asia/Kolkata (IST).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE VIEW v_order_base AS
    SELECT
      o.id                                                         AS order_id,
      o.order_number,
      o.customer_id,
      o.ordered_at                                                 AS order_ts,
      (o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date             AS order_date,
      date_trunc('week',    o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS order_week,
      date_trunc('month',   o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS order_month,
      date_trunc('quarter', o.ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS order_quarter,
      to_char(o.ordered_at AT TIME ZONE 'Asia/Kolkata', 'Dy')      AS day_of_week,
      extract(isodow FROM o.ordered_at AT TIME ZONE 'Asia/Kolkata')::int AS day_of_week_num,
      c.name                                                       AS customer_name,
      ci.name                                                      AS city,
      r.name                                                       AS region,
      ci.tier                                                      AS city_tier,
      c.acquisition_source,
      c.gender,
      c.signup_date,
      CASE WHEN o.is_first_order THEN 'New' ELSE 'Returning' END   AS customer_type,
      o.channel,
      o.platform,
      o.payment_method,
      o.status                                                     AS order_status,
      (o.status NOT IN ('Cancelled', 'Returned'))                  AS is_valid,
      CASE WHEN o.coupon_code IS NULL THEN 'No' ELSE 'Yes' END     AS coupon_used,
      o.coupon_code,
      o.return_reason,
      round((extract(epoch FROM o.delivered_at - o.ordered_at) / 86400.0)::numeric, 1) AS delivery_days,
      o.shipping_fee
    FROM orders o
    JOIN customers c  ON c.id = o.customer_id
    JOIN cities ci    ON ci.id = c.city_id
    JOIN regions r    ON r.id = ci.region_id;

    CREATE VIEW v_order_lines AS
    SELECT
      b.*,
      oi.id                                         AS order_item_id,
      oi.product_id,
      p.name                                        AS product_name,
      p.sku,
      cat.name                                      AS category,
      p.sub_category,
      p.collection,
      CASE
        WHEN oi.unit_price < 500  THEN '< ₹500'
        WHEN oi.unit_price < 1500 THEN '₹500–1,499'
        WHEN oi.unit_price < 5000 THEN '₹1,500–4,999'
        ELSE '₹5,000+'
      END                                           AS price_band,
      p.launch_date,
      oi.quantity,
      oi.unit_price,
      oi.unit_cost,
      oi.quantity * oi.unit_price                   AS line_gross,
      oi.discount_amount                            AS line_discount,
      oi.quantity * oi.unit_price - oi.discount_amount AS line_net,
      oi.quantity * oi.unit_cost                    AS line_cost,
      oi.quantity * oi.unit_price - oi.discount_amount - oi.quantity * oi.unit_cost AS line_profit
    FROM order_items oi
    JOIN v_order_base b    ON b.order_id = oi.order_id
    JOIN products p        ON p.id = oi.product_id
    JOIN categories cat    ON cat.id = p.category_id;

    CREATE VIEW v_orders AS
    SELECT
      b.*,
      t.items_count,
      t.units,
      t.order_gross,
      t.order_discount,
      t.order_net,
      t.order_cost,
      t.order_net - t.order_cost AS order_profit
    FROM v_order_base b
    JOIN (
      SELECT
        order_id,
        count(*)::int                                   AS items_count,
        sum(quantity)::int                              AS units,
        sum(quantity * unit_price)                      AS order_gross,
        sum(discount_amount)                            AS order_discount,
        sum(quantity * unit_price - discount_amount)    AS order_net,
        sum(quantity * unit_cost)                       AS order_cost
      FROM order_items
      GROUP BY order_id
    ) t ON t.order_id = b.order_id;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP VIEW IF EXISTS v_orders, v_order_lines, v_order_base;`.execute(db);
}
