/**
 * Metrics catalog — the single source of truth for every measure and attribute.
 * The widget builder (and later the AI) can only use keys defined here.
 *
 * This file is client-safe. The SQL behind each key lives in apps/api (server only);
 * `column` names the reporting-view column an attribute maps to.
 */
import type { DateGrain, ValueFormat } from './format';

export type MeasureAggregation = 'additive' | 'ratio' | 'distinct';
/** Which orders a measure counts. */
export type StatusScope = 'valid' | 'all' | 'reached_customer' | 'returned' | 'delivered';

export interface MeasureDef {
  key: string;
  label: string;
  description: string;
  synonyms: string[];
  format: ValueFormat;
  decimals?: number;
  aggregation: MeasureAggregation;
  /** Drives KPI arrow colours: for Return Rate an increase is bad. */
  positiveIsGood: boolean;
  statusScope: StatusScope;
}

export type AttributeGroup = 'time' | 'product' | 'customer' | 'order';

export interface AttributeDef {
  key: string;
  label: string;
  description: string;
  synonyms: string[];
  group: AttributeGroup;
  kind: 'date' | 'categorical';
  /** Reporting-view column. */
  column: string;
  /** 'line' attributes need item-level data (product fields). */
  level: 'order' | 'line';
  grains?: DateGrain[];
  /** Fixed display order; otherwise values are sorted alphabetically or by measure. */
  values?: string[];
  /** When set, the attribute can only be combined with these measures. */
  compatibleMeasures?: string[];
}

export const MEASURES = [
  {
    key: 'revenue',
    label: 'Revenue',
    description:
      'Net sales after discounts, excluding shipping, from orders that were not cancelled or returned.',
    synonyms: ['sales', 'net sales', 'turnover', 'gmv', 'income', 'earnings'],
    format: 'currency',
    aggregation: 'additive',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'orders',
    label: 'Orders',
    description: 'Number of orders that were not cancelled or returned.',
    synonyms: ['order count', 'number of orders', 'purchases', 'transactions'],
    format: 'number',
    aggregation: 'distinct',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'units_sold',
    label: 'Units Sold',
    description: 'Total quantity of items sold in valid orders.',
    synonyms: ['units', 'quantity', 'items sold', 'volume', 'pieces'],
    format: 'number',
    aggregation: 'additive',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'aov',
    label: 'Average Order Value',
    description: 'Revenue divided by the number of orders.',
    synonyms: ['aov', 'average order', 'basket size', 'average basket', 'order value'],
    format: 'currency',
    aggregation: 'ratio',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'gross_profit',
    label: 'Gross Profit',
    description: 'Revenue minus the cost of the items sold.',
    synonyms: ['profit', 'gross margin amount', 'contribution', 'earnings after cost'],
    format: 'currency',
    aggregation: 'additive',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'margin_pct',
    label: 'Margin %',
    description: 'Gross profit as a percentage of revenue.',
    synonyms: ['margin', 'gross margin', 'profit margin', 'profitability'],
    format: 'percent',
    aggregation: 'ratio',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'customers',
    label: 'Customers',
    description: 'Number of unique customers with at least one valid order.',
    synonyms: ['unique customers', 'buyers', 'shoppers', 'customer count', 'clients'],
    format: 'number',
    aggregation: 'distinct',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'return_rate',
    label: 'Return Rate',
    description: 'Returned orders as a share of orders that reached the customer (delivered or returned).',
    synonyms: ['returns', 'return %', 'returned share', 'rto'],
    format: 'percent',
    aggregation: 'ratio',
    positiveIsGood: false,
    statusScope: 'reached_customer',
  },
  {
    key: 'gross_sales',
    label: 'Gross Sales',
    description: 'Sales before discounts (quantity × price) from valid orders.',
    synonyms: ['gross revenue', 'sales before discount', 'list sales', 'gross merchandise value'],
    format: 'currency',
    aggregation: 'additive',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'discounts',
    label: 'Discounts',
    description: 'Total coupon discounts given on valid orders.',
    synonyms: ['discount amount', 'coupon value', 'markdowns', 'promotions'],
    format: 'currency',
    aggregation: 'additive',
    positiveIsGood: false,
    statusScope: 'valid',
  },
  {
    key: 'discount_pct',
    label: 'Discount %',
    description: 'Discounts as a percentage of gross sales.',
    synonyms: ['discount rate', 'discount share', 'promo depth'],
    format: 'percent',
    aggregation: 'ratio',
    positiveIsGood: false,
    statusScope: 'valid',
  },
  {
    key: 'orders_placed',
    label: 'Orders Placed',
    description: 'All orders placed, in any status, including cancelled and returned ones.',
    synonyms: ['all orders', 'total orders placed', 'gross orders', 'order volume'],
    format: 'number',
    aggregation: 'distinct',
    positiveIsGood: true,
    statusScope: 'all',
  },
  {
    key: 'returned_orders',
    label: 'Returned Orders',
    description: 'Number of orders that were returned by the customer.',
    synonyms: ['returns count', 'number of returns', 'returned'],
    format: 'number',
    aggregation: 'distinct',
    positiveIsGood: false,
    statusScope: 'returned',
  },
  {
    key: 'cancellation_rate',
    label: 'Cancellation Rate',
    description: 'Cancelled orders as a share of all orders placed.',
    synonyms: ['cancellations', 'cancel rate', 'cancelled share'],
    format: 'percent',
    aggregation: 'ratio',
    positiveIsGood: false,
    statusScope: 'all',
  },
  {
    key: 'new_customers',
    label: 'New Customers',
    description: 'Customers whose first valid order falls in the period.',
    synonyms: ['first-time customers', 'new buyers', 'acquired customers', 'acquisitions'],
    format: 'number',
    aggregation: 'distinct',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'repeat_rate',
    label: 'Repeat Customer Rate',
    description: 'Share of customers who placed two or more valid orders in the period.',
    synonyms: ['repeat rate', 'retention', 'loyalty', 'returning customer rate', 'repeat purchase rate'],
    format: 'percent',
    aggregation: 'ratio',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'units_per_order',
    label: 'Units per Order',
    description: 'Average number of units in a valid order.',
    synonyms: ['items per order', 'basket depth', 'upt', 'units per transaction'],
    format: 'number',
    decimals: 1,
    aggregation: 'ratio',
    positiveIsGood: true,
    statusScope: 'valid',
  },
  {
    key: 'avg_delivery_days',
    label: 'Avg Delivery Days',
    description: 'Average days from order to delivery, for delivered orders.',
    synonyms: ['delivery time', 'shipping time', 'lead time', 'fulfilment time', 'tat'],
    format: 'days',
    aggregation: 'ratio',
    positiveIsGood: false,
    statusScope: 'delivered',
  },
] as const satisfies readonly MeasureDef[];

export const ATTRIBUTES = [
  {
    key: 'order_date',
    label: 'Date',
    description: 'Order date (IST), grouped by day, week, month or quarter.',
    synonyms: ['date', 'time', 'day', 'week', 'month', 'quarter', 'trend', 'over time'],
    group: 'time',
    kind: 'date',
    column: 'order_date',
    level: 'order',
    grains: ['day', 'week', 'month', 'quarter'],
  },
  {
    key: 'day_of_week',
    label: 'Day of Week',
    description: 'Weekday the order was placed (Mon–Sun).',
    synonyms: ['weekday', 'day of the week', 'weekend'],
    group: 'time',
    kind: 'categorical',
    column: 'day_of_week',
    level: 'order',
    values: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  {
    key: 'category',
    label: 'Category',
    description: 'Product category: Kitchen, Decor, Bedding, Lighting, Storage or Bath.',
    synonyms: ['product category', 'department', 'product type', 'segment'],
    group: 'product',
    kind: 'categorical',
    column: 'category',
    level: 'line',
  },
  {
    key: 'sub_category',
    label: 'Sub-category',
    description: 'Finer product grouping within a category, e.g. Table Lamps or Bedsheets.',
    synonyms: ['subcategory', 'product line', 'sub category'],
    group: 'product',
    kind: 'categorical',
    column: 'sub_category',
    level: 'line',
  },
  {
    key: 'product',
    label: 'Product',
    description: 'Individual product (SKU).',
    synonyms: ['item', 'sku', 'product name', 'article'],
    group: 'product',
    kind: 'categorical',
    column: 'product_name',
    level: 'line',
  },
  {
    key: 'collection',
    label: 'Collection',
    description: 'Merchandising collection: Essentials, Festive Edit, Earthy Handcrafted, Modern Minimal.',
    synonyms: ['range', 'line', 'edit', 'theme'],
    group: 'product',
    kind: 'categorical',
    column: 'collection',
    level: 'line',
  },
  {
    key: 'price_band',
    label: 'Price Band',
    description: 'Selling-price bucket of the item.',
    synonyms: ['price range', 'price tier', 'price point', 'price bucket'],
    group: 'product',
    kind: 'categorical',
    column: 'price_band',
    level: 'line',
    values: ['< ₹500', '₹500–1,499', '₹1,500–4,999', '₹5,000+'],
  },
  {
    key: 'city',
    label: 'City',
    description: "Customer's city.",
    synonyms: ['town', 'location', 'metro', 'place'],
    group: 'customer',
    kind: 'categorical',
    column: 'city',
    level: 'order',
  },
  {
    key: 'region',
    label: 'Region',
    description: "Customer's region: North, South, West or East.",
    synonyms: ['zone', 'area', 'geography', 'territory'],
    group: 'customer',
    kind: 'categorical',
    column: 'region',
    level: 'order',
    values: ['North', 'South', 'West', 'East'],
  },
  {
    key: 'customer_type',
    label: 'Customer Type',
    description: "New (the customer's first order) or Returning.",
    synonyms: ['new vs returning', 'first order', 'repeat customer', 'customer segment'],
    group: 'customer',
    kind: 'categorical',
    column: 'customer_type',
    level: 'order',
    values: ['New', 'Returning'],
  },
  {
    key: 'acquisition_source',
    label: 'Acquisition Source',
    description: 'How the customer first found Nivora Home.',
    synonyms: ['source', 'marketing channel', 'traffic source', 'acquisition channel', 'utm'],
    group: 'customer',
    kind: 'categorical',
    column: 'acquisition_source',
    level: 'order',
  },
  {
    key: 'channel',
    label: 'Channel',
    description: 'Sales channel: Website, App or Marketplace.',
    synonyms: ['sales channel', 'storefront', 'medium'],
    group: 'order',
    kind: 'categorical',
    column: 'channel',
    level: 'order',
    values: ['Website', 'App', 'Marketplace'],
  },
  {
    key: 'platform',
    label: 'Platform',
    description:
      'Device or marketplace within the channel: Desktop, Mobile Web, Android, iOS, Amazon, Flipkart.',
    synonyms: ['device', 'os', 'marketplace name', 'sub-channel'],
    group: 'order',
    kind: 'categorical',
    column: 'platform',
    level: 'order',
    values: ['Desktop', 'Mobile Web', 'Android', 'iOS', 'Amazon', 'Flipkart'],
  },
  {
    key: 'payment_method',
    label: 'Payment Method',
    description: 'How the order was paid: UPI, Card or Cash on Delivery (COD).',
    synonyms: ['payment', 'payment mode', 'payment type', 'cod', 'upi', 'card'],
    group: 'order',
    kind: 'categorical',
    column: 'payment_method',
    level: 'order',
    values: ['UPI', 'Card', 'COD'],
  },
  {
    key: 'order_status',
    label: 'Order Status',
    description: 'Current status of the order. Use with Orders Placed to see cancelled and returned orders.',
    synonyms: ['status', 'fulfilment status', 'state'],
    group: 'order',
    kind: 'categorical',
    column: 'order_status',
    level: 'order',
    values: ['Processing', 'Shipped', 'Delivered', 'Returned', 'Cancelled'],
  },
  {
    key: 'coupon_used',
    label: 'Coupon Used',
    description: 'Whether a coupon code was applied to the order.',
    synonyms: ['coupon', 'promo code', 'discount code', 'voucher'],
    group: 'order',
    kind: 'categorical',
    column: 'coupon_used',
    level: 'order',
    values: ['Yes', 'No'],
  },
  {
    key: 'return_reason',
    label: 'Return Reason',
    description: 'Why a returned order was sent back. Only available with Returned Orders.',
    synonyms: ['reason for return', 'return cause'],
    group: 'order',
    kind: 'categorical',
    column: 'return_reason',
    level: 'order',
    compatibleMeasures: ['returned_orders'],
  },
] as const satisfies readonly AttributeDef[];

export type MeasureKey = (typeof MEASURES)[number]['key'];
export type AttributeKey = (typeof ATTRIBUTES)[number]['key'];

export const MEASURE_KEYS = MEASURES.map((m) => m.key) as [MeasureKey, ...MeasureKey[]];
export const ATTRIBUTE_KEYS = ATTRIBUTES.map((a) => a.key) as [AttributeKey, ...AttributeKey[]];

const measureMap = new Map<string, MeasureDef>(MEASURES.map((m) => [m.key, m]));
const attributeMap = new Map<string, AttributeDef>(ATTRIBUTES.map((a) => [a.key, a]));

export function getMeasure(key: string): MeasureDef {
  const m = measureMap.get(key);
  if (!m) throw new Error(`Unknown measure: ${key}`);
  return m;
}

export function getAttribute(key: string): AttributeDef {
  const a = attributeMap.get(key);
  if (!a) throw new Error(`Unknown attribute: ${key}`);
  return a;
}

export function isMeasureKey(key: string): key is MeasureKey {
  return measureMap.has(key);
}

export function isAttributeKey(key: string): key is AttributeKey {
  return attributeMap.has(key);
}

/** Why a measure and attribute can't be combined, or null if they can. */
export function incompatibility(measureKey: string, attributeKey: string): string | null {
  const a = getAttribute(attributeKey);
  if (a.compatibleMeasures && !a.compatibleMeasures.includes(measureKey)) {
    const names = a.compatibleMeasures.map((k) => getMeasure(k).label).join(', ');
    return `${a.label} only works with ${names}`;
  }
  return null;
}

/** Case-insensitive search over label, description and synonyms. */
export function matchesSearch(
  def: { label: string; description: string; synonyms: readonly string[] },
  q: string,
) {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return (
    def.label.toLowerCase().includes(query) ||
    def.synonyms.some((s) => s.includes(query)) ||
    def.description.toLowerCase().includes(query)
  );
}

export const ATTRIBUTE_GROUP_LABELS: Record<AttributeGroup, string> = {
  time: 'Time',
  product: 'Product',
  customer: 'Customer',
  order: 'Order',
};
