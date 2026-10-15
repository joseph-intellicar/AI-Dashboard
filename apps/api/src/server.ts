import { createDb, loadEnv, pingDb } from '@insightflow/db';
import { modelFromEnv } from './ai/model';
import { buildApp } from './app';

const env = loadEnv();
const db = createDb({ env, queryTimeoutMs: 5000 });
const aiModel = modelFromEnv(env);
const app = await buildApp({ db, secureCookies: env.NODE_ENV === 'production', aiModel });
app.log.info(aiModel ? `Insight AI: ${env.AI_MODEL}` : 'Insight AI: not configured (no XAPI_KEY)');

try {
  await pingDb(db);
  app.log.info('DB connected');
} catch (err) {
  app.log.error((err as Error).message);
  process.exit(1);
}

app.addHook('onClose', () => db.destroy());

app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
