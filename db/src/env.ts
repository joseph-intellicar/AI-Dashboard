import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

const ROOT_ENV = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');

const EnvSchema = z.object({
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a postgres connection URL' }),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(1).default('dev-secret'),
  SEED_ANCHOR_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'SEED_ANCHOR_DATE must be YYYY-MM-DD')
    .optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Insight AI (Phase 2). The key is optional: without it the chat reports "not configured".
  XAPI_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).default('grok-4.7'),
  /** Tried once when AI_MODEL fails before replying; "none" disables it. */
  AI_FALLBACK_MODEL: z.string().min(1).default('grok-4.6'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /** Grok reasoning effort; "low" keeps chat replies fast. "default" = the model's own default. */
  AI_REASONING_EFFORT: z.enum(['low', 'medium', 'high', 'default']).default('low'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Empty strings in .env mean "not set". */
function blankToUndefined(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]));
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(blankToUndefined(source));
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Loads the repo-root .env (if present) and validates it. */
export function loadEnv(): Env {
  if (cached) return cached;
  if (existsSync(ROOT_ENV)) config({ path: ROOT_ENV, quiet: true });
  cached = parseEnv(process.env);
  return cached;
}

/** Migrations and seed prefer the direct (non-pooled) URL; the API uses the pooled one. */
export function connectionUrl(env: Env, purpose: 'runtime' | 'admin'): string {
  return purpose === 'admin' ? (env.DIRECT_DATABASE_URL ?? env.DATABASE_URL) : env.DATABASE_URL;
}
