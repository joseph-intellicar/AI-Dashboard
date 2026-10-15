import { describe, expect, it } from 'vitest';
import { SESSION_TTL_MS, expiryFrom, hashToken, newToken, normaliseEmail, shouldTouch } from './sessions';

describe('session tokens', () => {
  it('creates random 32-byte tokens', () => {
    const a = newToken();
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(newToken()).not.toBe(a);
  });

  it('hashes tokens with SHA-256 (stable, hex, not the token itself)', () => {
    const token = newToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('sliding expiry', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it('expires 7 days from now', () => {
    expect(expiryFrom(now).getTime() - now.getTime()).toBe(SESSION_TTL_MS);
  });

  it('does not renew a freshly extended session', () => {
    expect(shouldTouch(expiryFrom(now), new Date(now.getTime() + 30 * 60_000))).toBe(false);
  });

  it('renews after an hour', () => {
    expect(shouldTouch(expiryFrom(now), new Date(now.getTime() + 61 * 60_000))).toBe(true);
  });
});

describe('normaliseEmail', () => {
  it('ignores case and surrounding spaces', () => {
    expect(normaliseEmail('  Aarav@Nivora.IN ')).toBe('aarav@nivora.in');
  });
});
