import { hash, verify } from '@node-rs/argon2';
import type { DB } from '@insightflow/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors';
import { requireUser } from './requireUser';
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, deleteSession, normaliseEmail } from './sessions';

const LoginBody = z.object({
  email: z.string().min(1, 'Enter your email').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

/** Verified against when the email is unknown, so both paths take similar time. */
let dummyHash: Promise<string> | undefined;

export function authRoutes(app: FastifyInstance, { db, secureCookies }: { db: DB; secureCookies: boolean }) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: secureCookies,
  };

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = LoginBody.parse(req.body);
      const user = await db
        .selectFrom('users')
        .select(['id', 'email', 'name', 'password_hash'])
        .where('email', '=', normaliseEmail(body.email))
        .executeTakeFirst();

      if (!user) {
        dummyHash ??= hash('not-a-real-password');
        await verify(await dummyHash, body.password);
        throw invalidCredentials();
      }
      if (!(await verify(user.password_hash, body.password))) throw invalidCredentials();

      const token = await createSession(db, user.id);
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS / 1000 });
      return { user: { id: user.id, email: user.email, name: user.name } };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireUser(db) }, async (req) => ({ user: req.session!.user }));
}
