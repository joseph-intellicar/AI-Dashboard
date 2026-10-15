/**
 * Kysely table and view types. Kept in sync with db/migrations by hand.
 */
import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DateString = ColumnType<string, string, string>; // 'YYYY-MM-DD'
type Json<T = unknown> = ColumnType<T, string, string>; // write as JSON.stringify(...)

export type Channel = 'Website' | 'App' | 'Marketplace';
export type Platform = 'Desktop' | 'Mobile Web' | 'Android' | 'iOS' | 'Amazon' | 'Flipkart';
export type PaymentMethod = 'UPI' | 'Card' | 'COD';
export type OrderStatus = 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Returned';
export type ReturnReason =
  'Damaged in transit' | 'Not as described' | 'Changed mind' | 'Wrong item' | 'Quality issue';
export type AcquisitionSource =
  'Organic' | 'Instagram' | 'Google Ads' | 'Referral' | 'Influencer' | 'Marketplace';
export type Gender = 'Female' | 'Male' | 'Undisclosed';
export type Collection = 'Essentials' | 'Festive Edit' | 'Earthy Handcrafted' | 'Modern Minimal';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  password_hash: string;
  created_at: Generated<Timestamp>;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  created_at: Generated<Timestamp>;
  expires_at: Timestamp;
}

export interface DashboardsTable {
  id: Generated<string>;
  user_id: string;
  date_filter: Json;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface DashboardWidgetsTable {
  id: Generated<string>;
  dashboard_id: string;
  config: Json;
  layout_x: number;
  layout_y: number;
  layout_w: number;
  layout_h: number;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type VersionKindColumn =
  | 'created'
  | 'edit_session'
  | 'added'
  | 'edited'
  | 'duplicated'
  | 'removed'
  | 'reset'
  | 'restored'
  | 'ai_added';

export interface DashboardVersionsTable {
  id: Generated<string>;
  dashboard_id: string;
  kind: VersionKindColumn;
  summary: string;
  changes: Json;
  widgets: Json;
  created_at: Generated<Timestamp>;
}

export interface RegionsTable {
  id: number;
  name: string;
}

export interface CitiesTable {
  id: number;
  name: string;
  state: string;
  tier: 'Tier 1' | 'Tier 2';
  region_id: number;
}

export interface CategoriesTable {
  id: number;
  name: string;
  sort_order: number;
}

export interface ProductsTable {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  sub_category: string;
  collection: Collection;
  mrp: number;
  price: number;
  cost: number;
  launch_date: DateString;
  is_active: boolean;
}

export interface CustomersTable {
  id: number;
  name: string;
  email: string;
  gender: Gender;
  city_id: number;
  acquisition_source: AcquisitionSource;
  signup_date: DateString;
}

export interface OrdersTable {
  id: number;
  order_number: string;
  customer_id: number;
  ordered_at: Timestamp;
  channel: Channel;
  platform: Platform;
  payment_method: PaymentMethod;
  status: OrderStatus;
  coupon_code: string | null;
  discount_amount: number;
  shipping_fee: number;
  delivered_at: Timestamp | null;
  returned_at: Timestamp | null;
  return_reason: ReturnReason | null;
  is_first_order: boolean;
}

export interface OrderItemsTable {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
}

/** Shared order-level columns of the reporting views. */
interface OrderBaseView {
  order_id: number;
  order_number: string;
  customer_id: number;
  order_ts: Date;
  order_date: string;
  order_week: string;
  order_month: string;
  order_quarter: string;
  day_of_week: string;
  day_of_week_num: number;
  customer_name: string;
  city: string;
  region: string;
  city_tier: string;
  acquisition_source: AcquisitionSource;
  gender: Gender;
  signup_date: string;
  customer_type: 'New' | 'Returning';
  channel: Channel;
  platform: Platform;
  payment_method: PaymentMethod;
  order_status: OrderStatus;
  is_valid: boolean;
  coupon_used: 'Yes' | 'No';
  coupon_code: string | null;
  return_reason: ReturnReason | null;
  delivery_days: number | null;
  shipping_fee: number;
}

export interface OrderLinesView extends OrderBaseView {
  order_item_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  category: string;
  sub_category: string;
  collection: Collection;
  price_band: string;
  launch_date: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_gross: number;
  line_discount: number;
  line_net: number;
  line_cost: number;
  line_profit: number;
}

export interface OrdersView extends OrderBaseView {
  items_count: number;
  units: number;
  order_gross: number;
  order_discount: number;
  order_net: number;
  order_cost: number;
  order_profit: number;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  dashboards: DashboardsTable;
  dashboard_widgets: DashboardWidgetsTable;
  dashboard_versions: DashboardVersionsTable;
  regions: RegionsTable;
  cities: CitiesTable;
  categories: CategoriesTable;
  products: ProductsTable;
  customers: CustomersTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  v_order_lines: OrderLinesView;
  v_orders: OrdersView;
}

export type User = Selectable<UsersTable>;
export type NewProduct = Insertable<ProductsTable>;
export type NewCustomer = Insertable<CustomersTable>;
export type NewOrder = Insertable<OrdersTable>;
export type NewOrderItem = Insertable<OrderItemsTable>;
