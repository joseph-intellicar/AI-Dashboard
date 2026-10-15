import {
  addDays,
  addMonths,
  isoWeekday,
  startOfMonth,
  type DateGrain,
  type DateRange,
} from '@insightflow/shared';

/** Start date of the bucket containing `date`. Weeks start on Monday (ISO). */
export function bucketStart(date: string, grain: DateGrain): string {
  switch (grain) {
    case 'day':
      return date;
    case 'week':
      return addDays(date, -(isoWeekday(date) - 1));
    case 'month':
      return startOfMonth(date);
    case 'quarter': {
      const month = Number(date.slice(5, 7));
      const quarterMonth = month - ((month - 1) % 3);
      return `${date.slice(0, 4)}-${String(quarterMonth).padStart(2, '0')}-01`;
    }
  }
}

function nextBucket(start: string, grain: DateGrain): string {
  switch (grain) {
    case 'day':
      return addDays(start, 1);
    case 'week':
      return addDays(start, 7);
    case 'month':
      return addMonths(start, 1);
    case 'quarter':
      return addMonths(start, 3);
  }
}

/** Every bucket start overlapping the range, in order. */
export function dateBuckets(range: DateRange, grain: DateGrain): string[] {
  const out: string[] = [];
  for (let b = bucketStart(range.from, grain); b <= range.to; b = nextBucket(b, grain)) out.push(b);
  return out;
}

export const GRAIN_COLUMN: Record<DateGrain, string> = {
  day: 'order_date',
  week: 'order_week',
  month: 'order_month',
  quarter: 'order_quarter',
};
