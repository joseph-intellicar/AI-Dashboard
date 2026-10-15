import { describe, expect, it } from 'vitest';
import {
  compactIndian,
  formatBucket,
  formatBucketLong,
  formatChange,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatValue,
  isoWeek,
} from './format';

describe('formatCurrency', () => {
  it('uses lakh/crore grouping', () => {
    expect(formatCurrency(452300)).toBe('₹4,52,300');
    expect(formatCurrency(12345678)).toBe('₹1,23,45,678');
    expect(formatCurrency(999)).toBe('₹999');
  });

  it('rounds to whole rupees, keeping paise only under ₹100', () => {
    expect(formatCurrency(452300.6)).toBe('₹4,52,301');
    expect(formatCurrency(45.5)).toBe('₹45.50');
    expect(formatCurrency(45)).toBe('₹45');
  });

  it('handles zero and negatives', () => {
    expect(formatCurrency(0)).toBe('₹0');
    expect(formatCurrency(-1500)).toBe('-₹1,500');
    expect(formatCurrency(-450000, 'compact')).toBe('-₹4.5L');
  });

  it('formats compact values', () => {
    expect(formatCurrency(950, 'compact')).toBe('₹950');
    expect(formatCurrency(12500, 'compact')).toBe('₹12.5K');
    expect(formatCurrency(452300, 'compact')).toBe('₹4.5L');
    expect(formatCurrency(12000000, 'compact')).toBe('₹1.2Cr');
  });
});

describe('compactIndian rounding edges', () => {
  it('promotes to the next unit when rounding reaches it', () => {
    expect(compactIndian(99999)).toBe('1L');
    expect(compactIndian(9999999)).toBe('1Cr');
    expect(compactIndian(999.6)).toBe('1K');
  });

  it('drops a trailing .0', () => {
    expect(compactIndian(100000)).toBe('1L');
    expect(compactIndian(2000)).toBe('2K');
  });

  it('keeps large crore values readable', () => {
    expect(compactIndian(2_72_56_196)).toBe('2.7Cr');
    expect(compactIndian(1_23_00_00_000)).toBe('123Cr');
  });
});

describe('formatNumber / formatPercent / formatValue', () => {
  it('formats counts', () => {
    expect(formatNumber(1240)).toBe('1,240');
    expect(formatNumber(12500, 'compact')).toBe('12.5K');
    expect(formatNumber(120000, 'compact')).toBe('1.2L');
    expect(formatNumber(950, 'compact')).toBe('950');
    expect(formatNumber(1.66, 'full', 1)).toBe('1.7');
  });

  it('formats percentages from fractions with one decimal', () => {
    expect(formatPercent(0.084)).toBe('8.4%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(0.4235)).toBe('42.4%');
  });

  it('dispatches by format and shows a dash for missing values', () => {
    expect(formatValue(452300, 'currency', { style: 'compact' })).toBe('₹4.5L');
    expect(formatValue(0.231, 'percent')).toBe('23.1%');
    expect(formatValue(3.24, 'days')).toBe('3.2 days');
    expect(formatValue(null, 'number')).toBe('—');
  });
});

describe('formatChange', () => {
  it('reports direction and percentage', () => {
    expect(formatChange(112.4, 100)).toMatchObject({ direction: 'up', text: '↑ 12.4%' });
    expect(formatChange(96.9, 100)).toMatchObject({ direction: 'down', text: '↓ 3.1%' });
  });

  it('treats changes under 0.5% as flat', () => {
    expect(formatChange(100.4, 100)?.direction).toBe('flat');
  });

  it('returns null when there is no previous value', () => {
    expect(formatChange(100, 0)).toBeNull();
    expect(formatChange(100, null)).toBeNull();
  });
});

describe('dates', () => {
  it('formats dates and buckets', () => {
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026');
    expect(formatBucket('2026-10-15', 'day')).toBe('15 Oct');
    expect(formatBucket('2026-10-12', 'week')).toBe('12 Oct');
    expect(formatBucket('2026-10-01', 'month')).toBe("Oct '26");
    expect(formatBucket('2026-07-01', 'quarter')).toBe('Q3 2026');
    expect(formatBucketLong('2026-10-15', 'day')).toBe('Thu, 15 Oct 2026');
    expect(formatBucketLong('2026-10-12', 'week')).toBe('Week of 12 Oct 2026');
  });

  it('computes ISO week numbers', () => {
    expect(isoWeek('2026-10-15')).toBe(42);
    expect(isoWeek('2021-01-03')).toBe(53);
    expect(isoWeek('2026-01-01')).toBe(1);
  });
});
