/** Response of POST /api/query — shared by the API, the widgets and (later) the AI. */
import type { DateRange } from './dateRanges';
import type { DateGrain, ValueFormat } from './format';

export interface ResultColumn {
  key: string;
  label: string;
  role: 'attribute' | 'measure';
  format?: ValueFormat;
  decimals?: number;
}

export type ResultRow = Record<string, string | number | null>;

export interface QueryResult {
  columns: ResultColumn[];
  /** KPI: the measure over time (sparkline). Others: one row per group. */
  rows: ResultRow[];
  totals: Record<string, number | null>;
  previous?: { totals: Record<string, number | null>; rows?: ResultRow[] };
  meta: {
    range: { from: string; to: string; label: string };
    previousRange?: DateRange;
    grain: DateGrain | null;
    truncated: boolean;
    empty: boolean;
    queryMs: number;
    cached: boolean;
  };
}
