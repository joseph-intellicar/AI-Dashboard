/**
 * pnpm db:seed [--keep-dashboards]
 *
 * Truncates and re-creates all sales data and the two test users in one transaction.
 * By default users are re-created too, which also wipes their sessions and dashboards.
 */
import { createHash } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { sql, type Kysely, type Transaction } from 'kysely';
import { createDb, describeDbError, loadEnv } from '../src';
import type { Database } from '../src/schema';
import { todayIst } from './dates';
import { generateSeedData, type SeedData } from './generate';
import { CATEGORIES, CITIES, REGIONS, TEST_PASSWORD, TEST_USERS } from './reference';

const BATCH = 1000;

async function insertBatched<T extends keyof Database & string>(
  trx: Transaction<Database>,
  table: T,
  rows: readonly object[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    // Rows are typed by the generator; Kysely can't infer the insert type of a generic table.
    await trx
      .insertInto(table)
      .values(rows.slice(i, i + BATCH) as never)
      .execute();
  }
}

export function checksum(data: SeedData): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

async function seed(db: Kysely<Database>, data: SeedData, keepDashboards: boolean): Promise<void> {
  const passwordHash = await hash(TEST_PASSWORD);

  await db.transaction().execute(async (trx) => {
    await sql`TRUNCATE order_items, orders, customers, products, categories, cities, regions`.execute(trx);
    if (keepDashboards) {
      for (const u of TEST_USERS) {
        await trx
          .insertInto('users')
          .values({ email: u.email, name: u.name, password_hash: passwordHash })
          .onConflict((oc) => oc.column('email').doUpdateSet({ name: u.name, password_hash: passwordHash }))
          .execute();
      }
    } else {
      await sql`TRUNCATE users CASCADE`.execute(trx);
      await trx
        .insertInto('users')
        .values(TEST_USERS.map((u) => ({ email: u.email, name: u.name, password_hash: passwordHash })))
        .execute();
    }

    await trx
      .insertInto('regions')
      .values(REGIONS.map((r) => ({ ...r })))
      .execute();
    await trx
      .insertInto('cities')
      .values(CITIES.map(({ id, name, state, tier, region_id }) => ({ id, name, state, tier, region_id })))
      .execute();
    await trx
      .insertInto('categories')
      .values(CATEGORIES.map((c, i) => ({ id: c.id, name: c.name, sort_order: i + 1 })))
      .execute();
    await insertBatched(trx, 'products', data.products);
    await insertBatched(trx, 'customers', data.customers);
    await insertBatched(trx, 'orders', data.orders);
    await insertBatched(trx, 'order_items', data.orderItems);
  });
}

function summarise(data: SeedData) {
  const valid = new Set(
    data.orders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Returned').map((o) => o.id),
  );
  const revenue = data.orderItems
    .filter((i) => valid.has(i.order_id))
    .reduce((sum, i) => sum + i.quantity * i.unit_price - (i.discount_amount ?? 0), 0);
  return {
    range: `${data.range.from} → ${data.range.to}`,
    products: data.products.length,
    customers: data.customers.length,
    orders: data.orders.length,
    orderItems: data.orderItems.length,
    revenue: `₹${Math.round(revenue).toLocaleString('en-IN')}`,
    checksum: checksum(data),
  };
}

async function main() {
  const started = Date.now();
  const keepDashboards = process.argv.includes('--keep-dashboards');
  const env = loadEnv();
  const anchor = env.SEED_ANCHOR_DATE ?? todayIst();
  // With a fixed anchor the data is fully reproducible; otherwise today's orders stop at "now".
  const data = generateSeedData({ anchor, cutoff: env.SEED_ANCHOR_DATE ? undefined : new Date() });

  const db = createDb({ purpose: 'admin', env, maxConnections: 1 });
  try {
    await seed(db, data, keepDashboards);
  } catch (err) {
    console.error(`Seed failed: ${describeDbError(err)}`);
    process.exitCode = 1;
    return;
  } finally {
    await db.destroy();
  }

  console.log('Seed complete' + (keepDashboards ? ' (dashboards kept)' : ''));
  console.table(summarise(data));
  console.log(`Users: ${TEST_USERS.map((u) => u.email).join(', ')} / ${TEST_PASSWORD}`);
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
