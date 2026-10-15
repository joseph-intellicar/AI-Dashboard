/** Fetch wrapper: JSON in/out, session cookie included, standard error shape parsed. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

/** Called whenever an authenticated request returns 401 (session expired / logged out elsewhere). */
export function setUnauthorizedHandler(listener: UnauthorizedListener | null) {
  onUnauthorized = listener;
}

export async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.message) return new ApiError(res.status, body.error.code ?? 'ERROR', body.error.message);
  } catch {
    // not JSON
  }
  return new ApiError(
    res.status,
    res.status >= 500 ? 'INTERNAL' : 'ERROR',
    'Something went wrong — please try again',
  );
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Can’t reach the server — check your connection');
  }
  if (!res.ok) {
    const err = await parseError(res);
    // Auth endpoints report 401 as a normal answer ("not logged in"); everything else means the session ended.
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
