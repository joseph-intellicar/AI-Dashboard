/**
 * Date presets and previous-period rules. All ranges are inclusive IST calendar dates.
 * See REQUIREMENTS §12.3.
 */
import { z } from 'zod';
import { addDays, addMonths, daysBetween, endOfMonth, isValidIsoDate, startOfMonth, todayIst } from './dates';
import { formatDate, formatShortDate } from './format';

export const PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'last_12_months',
] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  this_month: 'This month',
  last_month: 'Last month',
  last_12_months: 'Last 12 months',
};

/** Longest allowed custom range, inclusive. */
export const MAX_CUSTOM_DAYS = 731;

export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'Must be a date in YYYY-MM-DD format' });

export const DateFilterSchema = z.union([
  z.object({ preset: z.enum(PRESETS) }),
  z.object({ preset: z.literal('custom'), from: IsoDateSchema, to: IsoDateSchema }),
]);
/** The dashboard's global date filter. */
export type DateFilter = z.infer<typeof DateFilterSchema>;

export interface DateRange {
  from: string;
  to: string;
}

export interface ResolvedRange extends DateRange {
  label: string;
  days: number;
}

export function rangeDays({ from, to }: DateRange): number {
  return daysBetween(from, to) + 1;
}

/** null when valid, otherwise the reason. */
export function validateCustomRange(from: string, to: string): string | null {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return 'Pick both a start and an end date';
  if (from > to) return "Custom range: 'From' must be before 'To'";
  if (rangeDays({ from, to }) > MAX_CUSTOM_DAYS) return 'Custom range can be at most 2 years';
  return null;
}

function customLabel(from: string, to: string, today: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4) && from.slice(0, 4) === today.slice(0, 4);
  const f = sameYear ? formatShortDate : formatDate;
  return from === to ? `Custom: ${f(from)}` : `Custom: ${f(from)} – ${f(to)}`;
}

export function resolveDateFilter(filter: DateFilter, now: Date = new Date()): ResolvedRange {
  const today = todayIst(now);
  let range: DateRange;
  switch (filter.preset) {
    case 'today':
      range = { from: today, to: today };
      break;
    case 'yesterday': {
      const y = addDays(today, -1);
      range = { from: y, to: y };
      break;
    }
    case 'last_7_days':
      range = { from: addDays(today, -6), to: today };
      break;
    case 'last_30_days':
      range = { from: addDays(today, -29), to: today };
      break;
    case 'last_90_days':
      range = { from: addDays(today, -89), to: today };
      break;
    case 'this_month':
      range = { from: startOfMonth(today), to: today };
      break;
    case 'last_month': {
      const from = addMonths(today, -1);
      range = { from, to: endOfMonth(from) };
      break;
    }
    case 'last_12_months':
      range = { from: addDays(today, -364), to: today };
      break;
    case 'custom':
      range = { from: filter.from, to: filter.to };
      break;
  }
  const label =
    filter.preset === 'custom' ? customLabel(range.from, range.to, today) : PRESET_LABELS[filter.preset];
  return { ...range, label, days: rangeDays(range) };
}

/** The period to compare against. */
export function previousRange(filter: DateFilter, current: DateRange): DateRange {
  if (filter.preset === 'last_month') {
    const from = addMonths(current.from, -1);
    return { from, to: endOfMonth(from) };
  }
  if (filter.preset === 'this_month') {
    // Same day span at the start of last month, capped at its last day (e.g. 1–31 Mar → 1–28 Feb).
    const from = addMonths(current.from, -1);
    const to = addDays(from, rangeDays(current) - 1);
    const last = endOfMonth(from);
    return { from, to: to > last ? last : to };
  }
  const days = rangeDays(current);
  return { from: addDays(current.from, -days), to: addDays(current.from, -1) };
}

/** Line charts on "Auto" use days up to 90 days, months beyond that. */
export function autoGrain(range: DateRange): 'day' | 'month' {
  return rangeDays(range) <= 90 ? 'day' : 'month';
}

/** "vs previous 30 days", "vs last month" … for KPI captions. */
export function comparisonLabel(filter: DateFilter, current: DateRange): string {
  switch (filter.preset) {
    case 'today':
      return 'vs yesterday';
    case 'yesterday':
      return 'vs day before';
    case 'this_month':
      return 'vs same days last month';
    case 'last_month':
      return 'vs month before';
    case 'last_12_months':
      return 'vs previous 12 months';
    default: {
      const days = rangeDays(current);
      return days === 1 ? 'vs previous day' : `vs previous ${days} days`;
    }
  }
}
