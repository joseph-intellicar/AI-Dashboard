import { autoSubtitle, type DateFilter, type WidgetConfig } from '@insightflow/shared';
import { CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Card chrome around a widget: title, subtitle, own-range badge, actions slot. */
export function WidgetFrame({
  config,
  dashboardFilter,
  actions,
  children,
  className,
  highlight,
}: {
  config: WidgetConfig;
  dashboardFilter: DateFilter;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  const ownRange = config.options.dateRange.mode !== 'dashboard';
  const subtitle = autoSubtitle(config, dashboardFilter);
  return (
    <section
      aria-label={config.title}
      className={cn(
        'flex h-full min-h-0 flex-col rounded-xl border border-line bg-surface shadow-card',
        config.type === 'kpi' ? 'px-4 pt-3 pb-3' : 'px-4 pt-3.5 pb-3',
        highlight && 'animate-highlight',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            className={cn(
              'truncate font-semibold text-ink',
              config.type === 'kpi' ? 'text-[13px] text-slate-600' : 'text-[15px]',
            )}
            title={config.title}
          >
            {config.title}
          </h3>
          {config.type !== 'kpi' ? (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
              {ownRange ? (
                <CalendarDays className="size-3 shrink-0 text-primary" aria-label="Own date range" />
              ) : null}
              {subtitle}
            </p>
          ) : ownRange ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <CalendarDays className="size-3 text-primary" aria-label="Own date range" />
              {subtitle.split(' · ')[0]}
            </p>
          ) : null}
        </div>
        {actions ? <div className="-mt-1 -mr-2 flex shrink-0 items-center">{actions}</div> : null}
      </header>
      <div className={cn('min-h-0 flex-1', config.type === 'kpi' ? 'mt-1.5' : 'mt-3')}>{children}</div>
    </section>
  );
}
