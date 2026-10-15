import type { DB } from '@insightflow/db';
import {
  ATTRIBUTES,
  CHART_PALETTE,
  MEASURES,
  OTHER_COLOR,
  VALUE_COLORS,
  getAttribute,
  isAttributeKey,
} from '@insightflow/shared';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { requireUser } from '../auth/requireUser';
import { AppError, notFound } from '../errors';

/** Client-safe catalog: no view columns or SQL. */
export function publicCatalog() {
  return {
    measures: MEASURES,
    attributes: ATTRIBUTES.map(({ column: _column, level: _level, ...rest }) => rest),
    colors: { palette: CHART_PALETTE, other: OTHER_COLOR, values: VALUE_COLORS },
  };
}

const ValuesQuery = z.object({ q: z.string().max(100).optional() });

/** Distinct values of an attribute, e.g. for filters and colour editing. */
export async function attributeValues(db: DB, key: string, q?: string): Promise<string[]> {
  if (!isAttributeKey(key)) throw notFound(`Unknown attribute: ${key}`);
  const attr = getAttribute(key);
  if (attr.kind === 'date')
    throw new AppError(400, 'INVALID_REQUEST', 'Date has no value list — use a date range');

  // `column` comes from the catalog (a whitelist), never from the request.
  const view = attr.level === 'line' ? 'v_order_lines' : 'v_orders';
  const column = sql.ref(attr.column);
  const search = q?.trim();
  const { rows } = await sql<{ value: string }>`
    SELECT DISTINCT ${column}::text AS value FROM ${sql.table(view)}
    WHERE ${column} IS NOT NULL
    ${search ? sql`AND ${column}::text ILIKE ${'%' + search.replace(/[%_\\]/g, '\\$&') + '%'}` : sql``}
    LIMIT 500`.execute(db);

  const values = rows.map((r) => r.value);
  const order = attr.values as readonly string[] | undefined;
  if (order) return values.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return values.sort((a, b) => a.localeCompare(b, 'en-IN'));
}

export function catalogRoutes(app: FastifyInstance, { db }: { db: DB }) {
  const auth = { preHandler: requireUser(db) };

  app.get('/api/catalog', auth, async (_req, reply) => {
    reply.header('cache-control', 'private, max-age=300');
    return publicCatalog();
  });

  app.get<{ Params: { key: string } }>('/api/catalog/attributes/:key/values', auth, async (req) => {
    const { q } = ValuesQuery.parse(req.query);
    return { attribute: req.params.key, values: await attributeValues(db, req.params.key, q) };
  });
}
