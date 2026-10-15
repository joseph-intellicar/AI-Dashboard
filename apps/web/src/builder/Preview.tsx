import {
  autoSubtitle,
  autoTitle,
  queryPart,
  validateForBuilder,
  type DateFilter,
  type WidgetConfig,
} from '@insightflow/shared';
import { CalendarDays, LayoutTemplate, Pencil, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import type { WidgetPickHandler } from '../widgets/types';
import { WidgetView } from '../widgets/WidgetView';

/** Debounces the query part only, so colour/title edits show instantly but fields re-query after 150 ms. */
export function useDebouncedQueryConfig(config: WidgetConfig, delay = 150): WidgetConfig {
  const key = JSON.stringify(queryPart(config));
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), delay);
    return () => clearTimeout(t);
  }, [key, delay]);
  return useMemo(
    () => ({ ...config, ...(JSON.parse(debounced) as ReturnType<typeof queryPart>) }),
    [config, debounced],
  );
}

const FRAME: Record<WidgetConfig['type'], string> = {
  kpi: 'w-[300px] h-[176px]',
  line: 'w-full max-w-[680px] h-[368px]',
  bar: 'w-full max-w-[640px] h-[368px]',
  hbar: 'w-full max-w-[640px] h-[368px]',
  donut: 'w-full max-w-[460px] h-[368px]',
  table: 'w-full max-w-[680px] h-[368px]',
};

export function Preview({
  config,
  dashboardFilter,
  onTitle,
  onResetTitle,
  onPick,
}: {
  config: WidgetConfig;
  dashboardFilter: DateFilter;
  onTitle: (t: string) => void;
  onResetTitle: () => void;
  onPick: WidgetPickHandler;
}) {
  const debounced = useDebouncedQueryConfig(config);
  const validation = validateForBuilder(debounced);
  const ownRange = config.options.dateRange.mode !== 'dashboard';

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-auto bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1.2px)] [background-size:16px_16px] p-6">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Live preview</div>
      <section
        className={cn(
          'flex flex-col rounded-xl border border-line bg-surface px-4 pt-3.5 pb-3 shadow-card',
          FRAME[config.type],
        )}
      >
        <header className="min-w-0">
          <TitleEditor
            title={config.title}
            custom={config.titleIsCustom}
            auto={autoTitle(config)}
            onChange={onTitle}
            onReset={onResetTitle}
            kpi={config.type === 'kpi'}
          />
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            {ownRange ? <CalendarDays className="size-3 shrink-0 text-primary" /> : null}
            {autoSubtitle(config, dashboardFilter)}
          </p>
        </header>
        <div className={cn('min-h-0 flex-1', config.type === 'kpi' ? 'mt-1.5' : 'mt-3')}>
          {validation.valid ? (
            <WidgetView config={debounced} dashboardFilter={dashboardFilter} onPick={onPick} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <LayoutTemplate className="size-5" />
              </span>
              <p className="max-w-60 text-sm text-muted">{validation.reason}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TitleEditor({
  title,
  custom,
  auto,
  onChange,
  onReset,
  kpi,
}: {
  title: string;
  custom: boolean;
  auto: string;
  onChange: (t: string) => void;
  onReset: () => void;
  kpi: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);
  const commit = () => {
    setEditing(false);
    onChange(draft.trim() || auto);
  };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Widget title"
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(title);
            setEditing(false);
          }
        }}
        className="-mx-1 w-full rounded-md border border-primary bg-white px-1 text-[15px] font-semibold text-ink outline-none ring-2 ring-primary/15"
      />
    );
  }
  return (
    <div className="group flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          '-mx-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 text-left font-semibold text-ink hover:bg-slate-100',
          kpi ? 'text-[13px] text-slate-600' : 'text-[15px]',
        )}
        title="Click to edit the title"
      >
        <span className="truncate">{title}</span>
        <Pencil className="size-3.5 shrink-0 text-slate-400 opacity-60 group-hover:opacity-100" />
      </button>
      {custom ? (
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 text-[11px] text-muted hover:text-primary"
          title={`Use “${auto}”`}
        >
          <RotateCcw className="size-3" /> Auto
        </button>
      ) : null}
    </div>
  );
}
