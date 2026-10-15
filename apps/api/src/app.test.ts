import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app';
import { AppError, toErrorResponse } from './errors';
import { dummyDb } from './testing';

describe('api app', () => {
  it('responds on /api/health', async () => {
    const app = await buildApp({ db: dummyDb(), logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('returns the standard error body for unknown routes', async () => {
    const app = await buildApp({ db: dummyDb(), logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    await app.close();
  });

  it('rejects protected routes without a session cookie', async () => {
    const app = await buildApp({ db: dummyDb(), logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
    await app.close();
  });

  it('validates the login body', async () => {
    const app = await buildApp({ db: dummyDb(), logger: false });
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Enter your email/);
    await app.close();
  });
});

describe('toErrorResponse', () => {
  it('maps app errors', () => {
    expect(toErrorResponse(new AppError(404, 'NOT_FOUND', 'Widget not found'))).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Widget not found' } },
    });
  });

  it('maps validation errors to 400 with the first message and path', () => {
    const result = z.object({ limit: z.number().max(50, 'Too big') }).safeParse({ limit: 99 });
    const { status, body } = toErrorResponse(result.error);
    expect(status).toBe(400);
    expect(body.error).toEqual({ code: 'INVALID_REQUEST', message: 'Too big (limit)' });
  });

  it('hides internals of unexpected errors', () => {
    const { status, body } = toErrorResponse(new Error('connection string postgres://secret'));
    expect(status).toBe(500);
    expect(body.error.message).toBe('Something went wrong');
  });

  it('maps rate limiting', () => {
    expect(toErrorResponse(Object.assign(new Error('x'), { statusCode: 429 })).body.error.code).toBe(
      'RATE_LIMITED',
    );
  });
});
