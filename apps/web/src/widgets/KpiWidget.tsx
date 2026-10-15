import {
  comparisonLabel,
  effectiveDateFilter,
  formatChange,
  getMeasure,
  type DateFilter,
  type QueryResult,
  type WidgetConfig,
} from '@insightflow/shared';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { accentColor } from './colors';
import { formatMeasure } from './format';
import type { WidgetPickHandler } from './types';

export type ChangeTone = 'good' | 'bad' | 'neutral';

/** Up is good for revenue, bad for return rate; tiny changes are neutral. */
export function changeTone(direction: 'up' | 'down' | 'flat', positiveIsGood: boolean): ChangeTone {
  if (direction === 'flat') return 'neutral';
  return (direction === 'up') === positiveIsGood ? 'good' : 'bad';
}

export function KpiWidget({
  config,
  result,
  dashboardFilter,
  onPick,
}: {
  config: WidgetConfig;
  result: QueryResult;
  dashboardFilter: DateFilter;
  onPick?: WidgetPickHandler;
}) {
  const key = config.fields.measures[0]!.key;
  const measure = getMeasure(key);
  const value = result.totals[key] ?? null;
  const style = config.appearance.numberFormat;
  const accent = accentColor(config.appearance.colors);
  const filter = effectiveDateFilter(config.options.dateRange, dashboardFilter);

  const change = config.options.compare ? formatChange(value, result.previous?.totals[key]) : null;
  const tone = change ? changeTone(change.direction, measure.positiveIsGood) : 'neutral';
  const secondary = config.options.secondaryMeasure;
  const series = result.rows.map((r) => (typeof r[key] === 'number' ? (r[key] as number) : null));

  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-1">
      <div className="min-w-0">
        <div
          className="text-[28px] leading-none font-semibold tracking-tight text-ink tabular"
          title={formatMeasure(value, key, 'full')}
        >
          {formatMeasure(value, key, style)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {config.options.compare ? (
            change ? (
              <>
                <ChangePill
                  tone={tone}
                  direction={change.direction}
                  text={change.text.replace(/^[↑↓→] /, '')}
                />
                <span className="text-muted">{comparisonLabel(filter, result.meta.range)}</span>
              </>
            ) : (
              <span className="text-muted">— no prior data</span>
            )
          ) : null}
          {secondary ? (
            <span className="text-muted">
              {getMeasure(secondary).label}{' '}
              <span className="font-medium text-ink tabular">
                {formatMeasure(result.totals[secondary], secondary, style)}
              </span>
            </span>
          ) : null}
        </div>
      </div>
      {series.length > 1 ? (
        <button
          type="button"
          tabIndex={onPick ? 0 : -1}
          disabled={!onPick}
          aria-label="Change accent colour"
          onClick={(e) => onPick?.({ kind: 'accent' }, accent, e.currentTarget.getBoundingClientRect())}
          className={cn(
            '-mx-1 block h-9 min-h-0 shrink',
            onPick ? 'cursor-pointer rounded hover:bg-slate-50' : 'cursor-default',
          )}
        >
          <Sparkline values={series} color={accent} />
        </button>
      ) : null}
    </div>
  );
}

function ChangePill({
  tone,
  direction,
  text,
}: {
  tone: ChangeTone;
  direction: 'up' | 'down' | 'flat';
  text: string;
}) {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular',
        tone === 'good' && 'bg-green-50 text-green-700',
        tone === 'bad' && 'bg-red-50 text-red-700',
        tone === 'neutral' && 'bg-slate-100 text-slate-600',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{direction === 'up' ? 'Up' : direction === 'down' ? 'Down' : 'Flat'}</span>
      {text}
    </span>
  );
}

/** Lightweight SVG sparkline (no axes); nulls are skipped. */
export function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const id = useId();
  const nums = values.map((v) => v ?? 0);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const w = 100;
  const h = 28;
  const pts = nums.map(
    (v, i) => [(i / (nums.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
