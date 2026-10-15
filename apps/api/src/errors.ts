import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CONFIG'
  | 'INVALID_LAYOUT'
  | 'UNKNOWN_FIELD'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'QUERY_TIMEOUT'
  | 'AI_NOT_CONFIGURED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new AppError(404, 'NOT_FOUND', what);
export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Please log in');

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/** Maps any thrown error to the standard `{ error: { code, message } }` body. */
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError)
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    return {
      status: 400,
      body: { error: { code: 'INVALID_REQUEST', message: `${issue?.message ?? 'Invalid request'}${where}` } },
    };
  }
  const fe = err as Partial<FastifyError>;
  if (fe.statusCode === 429) {
    return {
      status: 429,
      body: { error: { code: 'RATE_LIMITED', message: 'Too many attempts — try again in a minute' } },
    };
  }
  if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
    return {
      status: fe.statusCode,
      body: { error: { code: 'INVALID_REQUEST', message: fe.message ?? 'Bad request' } },
    };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } };
}

export function errorHandler(err: unknown, req: FastifyRequest, reply: FastifyReply) {
  const { status, body } = toErrorResponse(err);
  if (status >= 500) req.log.error(err);
  return reply.status(status).send(body);
}
