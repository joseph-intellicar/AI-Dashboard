/**
 * Indian number and date formatting, shared by the UI (and later the AI's text answers).
 *   Full:    ₹4,52,300   1,240    8.4%
 *   Compact: ₹950  ₹12.5K  ₹4.5L  ₹1.2Cr   12.5K  1.2L
 */
import { isoWeekday, monthName } from './dates';

export type ValueFormat = 'currency' | 'number' | 'percent' | 'days';
export type NumberStyle = 'compact' | 'full';
export type DateGrain = 'day' | 'week' | 'month' | 'quarter';

const fullInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const fullTwo = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function trimZero(s: string): string {
  return s.replace(/\.0+$/, '');
}

/** 12,500 → "12.5K", 4,52,300 → "4.5L", 99,999 → "1L" (rounding promotes to the next unit). */
export function compactIndian(value: number, decimals = 1): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const rounded = (n: number) => Number(n.toFixed(decimals));
  const fmt = (n: number, suffix: string) => `${sign}${trimZero(rounded(n).toFixed(decimals))}${suffix}`;
  if (abs >= 1e7 || rounded(abs / 1e5) >= 100) return fmt(abs / 1e7, 'Cr');
  if (abs >= 1e5 || rounded(abs / 1e3) >= 100) return fmt(abs / 1e5, 'L');
  if (Math.round(abs) >= 1e3) return fmt(abs / 1e3, 'K');
  return `${sign}${fullInt.format(Math.round(abs))}`;
}

export function formatCurrency(value: number, style: NumberStyle = 'full'): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (style === 'compact') return `${sign}₹${compactIndian(abs)}`;
  return `${sign}₹${abs < 100 && abs % 1 !== 0 ? fullTwo.format(abs) : fullInt.format(Math.round(abs))}`;
}

export function formatNumber(value: number, style: NumberStyle = 'full', decimals = 0): string {
  if (style === 'compact' && Math.abs(value) >= 1000) return compactIndian(value);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Ratios are fractions: 0.084 → "8.4%". */
export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function formatDays(value: number): string {
  return `${value.toFixed(1)} days`;
}

export interface FormatOptions {
  style?: NumberStyle;
  decimals?: number;
}

/** Formats a measure value by its catalog format. */
export function formatValue(
  value: number | null | undefined,
  format: ValueFormat,
  opts: FormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  switch (format) {
    case 'currency':
      return formatCurrency(value, opts.style);
    case 'percent':
      return formatPercent(value, opts.decimals ?? 1);
    case 'days':
      return formatDays(value);
    case 'number':
      return formatNumber(value, opts.style, opts.decimals ?? 0);
  }
}

export interface Change {
  /** Relative change as a fraction (0.124 = +12.4%). */
  ratio: number;
  direction: 'up' | 'down' | 'flat';
  text: string;
}

/** Change vs the previous period; null when there is nothing to compare against. */
export function formatChange(current: number | null, previous: number | null | undefined): Change | null {
  if (current === null || previous === null || previous === undefined || previous === 0) return null;
  const ratio = (current - previous) / Math.abs(previous);
  const direction = Math.abs(ratio) < 0.005 ? 'flat' : ratio > 0 ? 'up' : 'down';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  return { ratio, direction, text: `${arrow} ${(Math.abs(ratio) * 100).toFixed(1)}%` };
}

function parts(date: string) {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

/** "15 Oct 2026" */
export function formatDate(date: string): string {
  const { y, m, d } = parts(date);
  return `${d} ${monthName(m)} ${y}`;
}

/** "15 Oct" */
export function formatShortDate(date: string): string {
  const { m, d } = parts(date);
  return `${d} ${monthName(m)}`;
}

/** ISO 8601 week number. */
export function isoWeek(date: string): number {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - isoWeekday(date));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** Axis label for a bucket start date: day "15 Oct", week "13 Oct", month "Oct '26", quarter "Q3 2026". */
export function formatBucket(date: string, grain: DateGrain): string {
  const { y, m } = parts(date);
  switch (grain) {
    case 'day':
    case 'week':
      return formatShortDate(date);
    case 'month':
      return `${monthName(m)} '${String(y).slice(2)}`;
    case 'quarter':
      return `Q${Math.ceil(m / 3)} ${y}`;
  }
}

/** Tooltip label for a bucket: "Thu, 15 Oct 2026", "Week of 13 Oct 2026", "October 2026"-style. */
export function formatBucketLong(date: string, grain: DateGrain): string {
  switch (grain) {
    case 'day':
      return `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][isoWeekday(date) - 1]}, ${formatDate(date)}`;
    case 'week':
      return `Week of ${formatDate(date)}`;
    case 'month':
      return `${monthName(parts(date).m)} ${parts(date).y}`;
    case 'quarter':
      return formatBucket(date, 'quarter');
  }
}
