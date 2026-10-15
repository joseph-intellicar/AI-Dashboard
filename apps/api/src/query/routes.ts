import type { DB } from '@insightflow/db';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/requireUser';
import { createQueryEngine, type QueryEngineOptions } from './engine';

export function queryRoutes(
  app: FastifyInstance,
  {
    db,
    runQuery = createQueryEngine(db),
  }: { db: DB; runQuery?: ReturnType<typeof createQueryEngine> } & QueryEngineOptions,
) {
  app.post('/api/query', { preHandler: requireUser(db) }, async (req) => runQuery(req.body));
}
