import net from 'node:net';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { connectionUrl, loadEnv, type Env } from './env';
import type { Database } from './schema';

// Return DATE columns as 'YYYY-MM-DD' strings and NUMERIC/BIGINT as numbers.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

// Node's "happy eyeballs" gives each address only 250 ms by default; the TCP handshake to
// Neon (us-east-2) from India takes longer, so every attempt would time out.
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

export type DB = Kysely<Database>;

export interface CreateDbOptions {
  purpose?: 'runtime' | 'admin';
  env?: Env;
  maxConnections?: number;
  /** Client-side query timeout (works through the Neon pooler, unlike SET statement_timeout). */
  queryTimeoutMs?: number;
}

export function createDb({
  purpose = 'runtime',
  env = loadEnv(),
  maxConnections = 10,
  queryTimeoutMs,
}: CreateDbOptions = {}): DB {
  const pool = new pg.Pool({
    connectionString: connectionUrl(env, purpose),
    max: maxConnections,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(queryTimeoutMs ? { query_timeout: queryTimeoutMs } : {}),
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * Pings the database, retrying once to ride out a Neon compute waking from auto-suspend.
 */
export async function pingDb(db: DB, { retries = 1, delayMs = 1500 } = {}): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await sql`select 1`.execute(db);
      return;
    } catch (err) {
      if (attempt >= retries) throw new Error(`Could not connect to the database: ${describeDbError(err)}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Short, credential-free description of a connection error. */
export function describeDbError(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) return describeDbError(err.errors[0]);
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return code ? `${err.message} (${code})` : err.message;
  }
  return String(err);
}
