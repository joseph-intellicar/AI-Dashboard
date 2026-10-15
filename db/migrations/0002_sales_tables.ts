import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE regions (
      id   smallint PRIMARY KEY,
      name text NOT NULL UNIQUE
    );

    CREATE TABLE cities (
      id        smallint PRIMARY KEY,
      name      text NOT NULL UNIQUE,
      state     text NOT NULL,
      tier      text NOT NULL CHECK (tier IN ('Tier 1', 'Tier 2')),
      region_id smallint NOT NULL REFERENCES regions(id)
    );

    CREATE TABLE categories (
      id         smallint PRIMARY KEY,
      name       text NOT NULL UNIQUE,
      sort_order smallint NOT NULL
    );

    CREATE TABLE products (
      id           int PRIMARY KEY,
      sku          text NOT NULL UNIQUE,
      name         text NOT NULL UNIQUE,
      category_id  smallint NOT NULL REFERENCES categories(id),
      sub_category text NOT NULL,
      collection   text NOT NULL
                   CHECK (collection IN ('Essentials', 'Festive Edit', 'Earthy Handcrafted', 'Modern Minimal')),
      mrp          numeric(10,2) NOT NULL,
      price        numeric(10,2) NOT NULL CHECK (price > 0),
      cost         numeric(10,2) NOT NULL CHECK (cost > 0),
      launch_date  date NOT NULL,
      is_active    boolean NOT NULL DEFAULT true,
      CHECK (mrp >= price)
    );
    CREATE INDEX products_category_idx ON products(category_id);

    CREATE TABLE customers (
      id                 int PRIMARY KEY,
      name               text NOT NULL,
      email              text NOT NULL UNIQUE,
      gender             text NOT NULL CHECK (gender IN ('Female', 'Male', 'Undisclosed')),
      city_id            smallint NOT NULL REFERENCES cities(id),
      acquisition_source text NOT NULL
                         CHECK (acquisition_source IN ('Organic', 'Instagram', 'Google Ads', 'Referral', 'Influencer', 'Marketplace')),
      signup_date        date NOT NULL
    );
    CREATE INDEX customers_city_idx ON customers(city_id);

    CREATE TABLE orders (
      id              int PRIMARY KEY,
      order_number    text NOT NULL UNIQUE,
      customer_id     int NOT NULL REFERENCES customers(id),
      ordered_at      timestamptz NOT NULL,
      channel         text NOT NULL CHECK (channel IN ('Website', 'App', 'Marketplace')),
      platform        text NOT NULL CHECK (platform IN ('Desktop', 'Mobile Web', 'Android', 'iOS', 'Amazon', 'Flipkart')),
      payment_method  text NOT NULL CHECK (payment_method IN ('UPI', 'Card', 'COD')),
      status          text NOT NULL CHECK (status IN ('Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned')),
      coupon_code     text,
      discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      shipping_fee    numeric(10,2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
      delivered_at    timestamptz,
      returned_at     timestamptz,
      return_reason   text CHECK (return_reason IN
                        ('Damaged in transit', 'Not as described', 'Changed mind', 'Wrong item', 'Quality issue')),
      is_first_order  boolean NOT NULL,
      CHECK (
        (channel = 'Website'     AND platform IN ('Desktop', 'Mobile Web')) OR
        (channel = 'App'         AND platform IN ('Android', 'iOS')) OR
        (channel = 'Marketplace' AND platform IN ('Amazon', 'Flipkart'))
      ),
      CHECK ((status = 'Returned') = (returned_at IS NOT NULL AND return_reason IS NOT NULL)),
      CHECK (status NOT IN ('Delivered', 'Returned') OR delivered_at IS NOT NULL)
    );
    CREATE INDEX orders_ordered_at_idx ON orders(ordered_at);
    CREATE INDEX orders_customer_idx ON orders(customer_id);

    CREATE TABLE order_items (
      id              int PRIMARY KEY,
      order_id        int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id      int NOT NULL REFERENCES products(id),
      quantity        int NOT NULL CHECK (quantity > 0),
      unit_price      numeric(10,2) NOT NULL CHECK (unit_price > 0),
      unit_cost       numeric(10,2) NOT NULL CHECK (unit_cost > 0),
      discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      CHECK (discount_amount <= quantity * unit_price)
    );
    CREATE INDEX order_items_order_idx ON order_items(order_id);
    CREATE INDEX order_items_product_idx ON order_items(product_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS order_items, orders, customers, products, categories, cities, regions;`.execute(
    db,
  );
}
