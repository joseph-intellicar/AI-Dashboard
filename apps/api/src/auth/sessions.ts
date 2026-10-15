import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '@insightflow/db';
import { TtlCache } from '../query/cache';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Extend the expiry at most once an hour, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Sessions are stored by the SHA-256 of the cookie token; the raw token is never stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/** Sliding expiry: renew when the session was last extended over an hour ago. */
export function shouldTouch(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - TOUCH_INTERVAL_MS;
}

export interface SessionUser {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; email: string; name: string };
}

export async function createSession(db: DB, userId: string, now = new Date()): Promise<string> {
  const token = newToken();
  await db
    .insertInto('sessions')
    .values({ id: hashToken(token), user_id: userId, expires_at: expiryFrom(now) })
    .execute();
  return token;
}

/**
 * Validated sessions are cached for 30 s: every API call needs the session, and each database
 * round trip to Neon costs ~250–400 ms from here. Logout evicts immediately (same process).
 */
const sessionCache = new TtlCache<SessionUser>(30_000, 1000);

export async function findSession(db: DB, token: string, now = new Date()): Promise<SessionUser | null> {
  const key = hashToken(token);
  const cached = sessionCache.get(key);
  if (cached && cached.expiresAt > now) return cached;
  const session = await loadSession(db, token, now);
  if (session) sessionCache.set(key, session);
  return session;
}

async function loadSession(db: DB, token: string, now: Date): Promise<SessionUser | null> {
  const row = await db
    .selectFrom('sessions as s')
    .innerJoin('users as u', 'u.id', 's.user_id')
    .select(['s.id as sessionId', 's.expires_at as expiresAt', 'u.id', 'u.email', 'u.name'])
    .where('s.id', '=', hashToken(token))
    .where('s.expires_at', '>', now)
    .executeTakeFirst();
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    user: { id: row.id, email: row.email, name: row.name },
  };
}

export async function touchSession(db: DB, session: SessionUser, now = new Date()): Promise<void> {
  if (!shouldTouch(session.expiresAt, now)) return;
  await db
    .updateTable('sessions')
    .set({ expires_at: expiryFrom(now) })
    .where('id', '=', session.sessionId)
    .execute();
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  sessionCache.delete(hashToken(token));
  await db.deleteFrom('sessions').where('id', '=', hashToken(token)).execute();
}
