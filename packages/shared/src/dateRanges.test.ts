import { describe, expect, it } from 'vitest';
import {
  autoGrain,
  comparisonLabel,
  previousRange,
  resolveDateFilter,
  validateCustomRange,
  type DateFilter,
} from './dateRanges';

// 15 Oct 2026, 10:00 IST
const NOW = new Date('2026-10-15T04:30:00Z');

function resolve(filter: DateFilter, now = NOW) {
  const r = resolveDateFilter(filter, now);
  return { from: r.from, to: r.to, label: r.label, days: r.days, prev: previousRange(filter, r) };
}

describe('resolveDateFilter + previousRange', () => {
  it.each<[DateFilter, string, string, string, string]>([
    [{ preset: 'today' }, '2026-10-15', '2026-10-15', '2026-10-14', '2026-10-14'],
    [{ preset: 'yesterday' }, '2026-10-14', '2026-10-14', '2026-10-13', '2026-10-13'],
    [{ preset: 'last_7_days' }, '2026-10-09', '2026-10-15', '2026-10-02', '2026-10-08'],
    [{ preset: 'last_30_days' }, '2026-09-16', '2026-10-15', '2026-08-17', '2026-09-15'],
    [{ preset: 'last_90_days' }, '2026-07-18', '2026-10-15', '2026-04-19', '2026-07-17'],
    [{ preset: 'this_month' }, '2026-10-01', '2026-10-15', '2026-09-01', '2026-09-15'],
    [{ preset: 'last_month' }, '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'],
    [{ preset: 'last_12_months' }, '2025-10-16', '2026-10-15', '2024-10-16', '2025-10-15'],
    [
      { preset: 'custom', from: '2026-08-01', to: '2026-08-31' },
      '2026-08-01',
      '2026-08-31',
      '2026-07-01',
      '2026-07-31',
    ],
  ])('%j', (filter, from, to, prevFrom, prevTo) => {
    const r = resolve(filter);
    expect([r.from, r.to]).toEqual([from, to]);
    expect(r.prev).toEqual({ from: prevFrom, to: prevTo });
  });

  it('uses the IST date, not the UTC date', () => {
    // 14 Oct 20:00 UTC is already 15 Oct 01:30 in IST
    expect(resolve({ preset: 'today' }, new Date('2026-10-14T20:00:00Z')).from).toBe('2026-10-15');
    // 14 Oct 18:29 UTC is still 14 Oct 23:59 in IST
    expect(resolve({ preset: 'today' }, new Date('2026-10-14T18:29:00Z')).from).toBe('2026-10-14');
  });

  it('caps "this month" comparisons at the end of a shorter month', () => {
    const r = resolve({ preset: 'this_month' }, new Date('2026-03-31T06:00:00Z'));
    expect(r.prev).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('handles leap years', () => {
    const r = resolve({ preset: 'last_month' }, new Date('2024-03-10T06:00:00Z'));
    expect([r.from, r.to]).toEqual(['2024-02-01', '2024-02-29']);
  });

  it('handles the January → December rollover', () => {
    const r = resolve({ preset: 'last_month' }, new Date('2026-01-05T06:00:00Z'));
    expect([r.from, r.to]).toEqual(['2025-12-01', '2025-12-31']);
    expect(r.prev).toEqual({ from: '2025-11-01', to: '2025-11-30' });
  });

  it('builds labels', () => {
    expect(resolve({ preset: 'last_30_days' }).label).toBe('Last 30 days');
    expect(resolve({ preset: 'custom', from: '2026-08-01', to: '2026-08-31' }).label).toBe(
      'Custom: 1 Aug – 31 Aug',
    );
    expect(resolve({ preset: 'custom', from: '2025-08-01', to: '2025-08-31' }).label).toBe(
      'Custom: 1 Aug 2025 – 31 Aug 2025',
    );
  });
});

describe('validateCustomRange', () => {
  it('accepts a valid range', () => {
    expect(validateCustomRange('2026-08-01', '2026-08-31')).toBeNull();
    expect(validateCustomRange('2026-08-01', '2026-08-01')).toBeNull();
  });

  it('rejects from > to, bad dates and over-long ranges', () => {
    expect(validateCustomRange('2026-09-01', '2026-08-01')).toMatch(/before/);
    expect(validateCustomRange('2026-02-30', '2026-03-01')).toMatch(/Pick/);
    expect(validateCustomRange('2023-01-01', '2026-01-01')).toMatch(/2 years/);
  });
});

describe('autoGrain and comparisonLabel', () => {
  it('switches from day to month after 90 days', () => {
    expect(autoGrain({ from: '2026-07-18', to: '2026-10-15' })).toBe('day');
    expect(autoGrain({ from: '2026-07-17', to: '2026-10-15' })).toBe('month');
  });

  it('describes the comparison period', () => {
    const r = resolveDateFilter({ preset: 'last_30_days' }, NOW);
    expect(comparisonLabel({ preset: 'last_30_days' }, r)).toBe('vs previous 30 days');
    expect(comparisonLabel({ preset: 'today' }, r)).toBe('vs yesterday');
  });
});
