import { seriesColor, type QueryResult, type ResultColumn, type WidgetConfig } from '@insightflow/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { formatCell } from './format';
import type { WidgetPickHandler } from './types';

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

export function sortRows<T extends Record<string, unknown>>(rows: T[], sort: Sort): T[] {
  if (!sort) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'en-IN', { numeric: true }) * dir;
  });
}

export function TableWidget({
  config,
  result,
  onPick,
}: {
  config: WidgetConfig;
  result: QueryResult;
  onPick?: WidgetPickHandler;
}) {
  const [sort, setSort] = useState<Sort>(null);
  const rows = useMemo(() => sortRows(result.rows, sort), [result.rows, sort]);
  const style = config.appearance.numberFormat;
  // The data bar follows the measure the table is sorted by (falls back to the first measure).
  const sortKey = sort?.key ?? config.options.sort?.by;
  const barColumn =
    result.columns.find((c) => c.role === 'measure' && c.key === sortKey) ??
    result.columns.find((c) => c.role === 'measure');
  const barColor = config.appearance.colors.dataBar ?? seriesColor(0);
  const max = barColumn ? Math.max(0, ...result.rows.map((r) => Number(r[barColumn.key] ?? 0))) : 0;

  const toggleSort = (c: ResultColumn) =>
    setSort((s) =>
      s?.key !== c.key
        ? { key: c.key, dir: c.role === 'measure' ? 'desc' : 'asc' }
        : s.dir === 'desc'
          ? { key: c.key, dir: 'asc' }
          : { key: c.key, dir: 'desc' },
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">{config.title}</caption>
          <thead className="sticky top-0 z-[1] bg-white">
            <tr>
              {result.columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cn(
                      'border-b border-line px-2 py-2 font-medium whitespace-nowrap text-muted',
                      c.role === 'measure' ? 'text-right' : 'text-left',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-ink',
                        c.role === 'measure' && 'flex-row-reverse',
                        active && 'text-ink',
                      )}
                    >
                      {c.label}
                      {active ? (
                        sort!.dir === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-50">
                {result.columns.map((c) => {
                  const isBar = barColumn?.key === c.key;
                  const v = r[c.key];
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        'border-b border-slate-100 px-2 py-1.5',
                        c.role === 'measure'
                          ? 'text-right font-medium text-ink tabular whitespace-nowrap'
                          : 'max-w-56 truncate text-ink',
                        isBar && 'relative',
                      )}
                      title={c.role === 'attribute' ? String(v ?? '') : undefined}
                    >
                      {isBar && max > 0 ? (
                        <button
                          type="button"
                          tabIndex={onPick ? 0 : -1}
                          disabled={!onPick}
                          aria-label="Change data bar colour"
                          onClick={(e) =>
                            onPick?.({ kind: 'dataBar' }, barColor, e.currentTarget.getBoundingClientRect())
                          }
                          className={cn(
                            'absolute inset-y-1.5 right-1 rounded-sm',
                            onPick ? 'cursor-pointer' : 'pointer-events-none',
                          )}
                          style={{
                            width: `calc(${(Number(v ?? 0) / max) * 100}% - 8px)`,
                            background: barColor,
                            opacity: 0.14,
                          }}
                        />
                      ) : null}
                      <span className="relative">{formatCell(v, c, style)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.meta.truncated ? (
        <div className="pt-1.5 text-[11px] text-muted">Showing top {result.rows.length}</div>
      ) : null}
    </div>
  );
}
