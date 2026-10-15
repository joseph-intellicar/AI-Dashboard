import { describe, expect, it } from 'vitest';
import { connectionUrl, parseEnv } from './env';

const pooled = 'postgresql://u:p@host-pooler.neon.tech/db?sslmode=require';
const direct = 'postgresql://u:p@host.neon.tech/db?sslmode=require';

describe('parseEnv', () => {
  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('treats blank values as unset', () => {
    const env = parseEnv({ DATABASE_URL: pooled, SEED_ANCHOR_DATE: '' });
    expect(env.SEED_ANCHOR_DATE).toBeUndefined();
  });

  it('rejects a malformed anchor date', () => {
    expect(() => parseEnv({ DATABASE_URL: pooled, SEED_ANCHOR_DATE: '15-10-2026' })).toThrow(/YYYY-MM-DD/);
  });
});

describe('connectionUrl', () => {
  it('uses the direct URL for admin work when available', () => {
    const env = parseEnv({ DATABASE_URL: pooled, DIRECT_DATABASE_URL: direct });
    expect(connectionUrl(env, 'admin')).toBe(direct);
    expect(connectionUrl(env, 'runtime')).toBe(pooled);
  });

  it('falls back to the pooled URL for admin work', () => {
    const env = parseEnv({ DATABASE_URL: pooled });
    expect(connectionUrl(env, 'admin')).toBe(pooled);
  });
});
