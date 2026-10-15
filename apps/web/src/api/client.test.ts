import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, parseError, request, setUnauthorizedHandler } from './client';

function respond(status: number, body?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('parseError', () => {
  it('reads the standard error body', async () => {
    const err = await parseError(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Widget not found' } }), {
        status: 404,
      }),
    );
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Widget not found' });
  });

  it('falls back to a friendly message for non-JSON errors', async () => {
    const err = await parseError(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(err).toMatchObject({ status: 502, code: 'INTERNAL' });
    expect(err.message).toMatch(/try again/);
  });
});

describe('request', () => {
  it('returns JSON and undefined for 204', async () => {
    respond(200, { ok: true });
    expect(await request('GET', '/api/x')).toEqual({ ok: true });
    respond(204);
    expect(await request('DELETE', '/api/x')).toBeUndefined();
  });

  it('calls the unauthorized handler on 401 (but not for auth endpoints)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(401, { error: { code: 'UNAUTHENTICATED', message: 'Please log in' } });
    await expect(request('GET', '/api/dashboard')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(request('POST', '/api/auth/login', {})).rejects.toThrow('Please log in');
    await expect(request('GET', '/api/auth/me')).rejects.toThrow('Please log in');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to a readable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(request('GET', '/api/x')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
