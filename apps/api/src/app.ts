import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { DB } from '@insightflow/db';
import Fastify from 'fastify';
import { sql } from 'kysely';
import { aiRoutes } from './ai/routes';
import type { ChatModel } from './ai/model';
import { authRoutes } from './auth/routes';
import { catalogRoutes } from './catalog/routes';
import { dashboardRoutes } from './dashboard/routes';
import { errorHandler } from './errors';
import { createQueryEngine } from './query/engine';
import { queryRoutes } from './query/routes';

export interface AppDeps {
  db: DB;
  /** Set the `Secure` cookie flag (production). */
  secureCookies?: boolean;
  logger?: boolean;
  /** Insight AI model; null/undefined = not configured. */
  aiModel?: ChatModel | null;
}

export async function buildApp({ db, secureCookies = false, logger = true, aiModel = null }: AppDeps) {
  const app = Fastify({
    logger: logger && {
      level: 'info',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );

  app.get('/api/health', async () => {
    await sql`select 1`.execute(db);
    return { ok: true };
  });

  authRoutes(app, { db, secureCookies });
  catalogRoutes(app, { db });
  // One engine (and result cache) shared by widgets and Insight AI.
  const runQuery = createQueryEngine(db);
  queryRoutes(app, { db, runQuery });
  dashboardRoutes(app, { db });
  aiRoutes(app, { db, model: aiModel, runQuery });

  return app;
}
