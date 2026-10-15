import type { DB } from '@insightflow/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthenticated } from '../errors';
import { SESSION_COOKIE, findSession, touchSession, type SessionUser } from './sessions';

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionUser;
  }
}

/** preHandler for protected routes: resolves the user from the session cookie only. */
export function requireUser(db: DB) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    const session = token ? await findSession(db, token) : null;
    if (!session) throw unauthenticated();
    req.session = session;
    await touchSession(db, session);
  };
}

/** The logged-in user's ID. Never read a user ID from the request body, URL or query. */
export function userId(req: FastifyRequest): string {
  if (!req.session) throw unauthenticated();
  return req.session.user.id;
}
