import { autoSubtitle, WIDGET_TYPE_LABELS, type DateFilter } from '@insightflow/shared';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { WidgetView } from '../widgets/WidgetView';
import type { ChatPreview } from './chatStore';

const HEIGHTS: Record<string, string> = {
  kpi: 'h-[120px]',
  line: 'h-[240px]',
  bar: 'h-[260px]',
  hbar: 'h-[280px]',
  donut: 'h-[260px]',
  table: 'h-[280px]',
};

/** A visualization proposed in the chat: the real widget with live data (REQUIREMENTS §17.7). */
export function PreviewCard({
  preview,
  dashboardFilter,
  onAdd,
  onEdit,
  onDiscard,
}: {
  preview: ChatPreview;
  dashboardFilter: DateFilter;
  onAdd: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const { config, status, revision } = preview;
  // Flash the card when a refinement updates it in place.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (revision === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(t);
  }, [revision]);

  if (status === 'discarded') {
    return (
      <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
        <X className="size-3.5" /> Discarded · {config.title}
      </p>
    );
  }

  return (
    <section
      aria-label={`Preview: ${config.title}`}
      className={cn(
        'mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-card',
        flash && 'animate-highlight',
      )}
    >
      <header className="flex items-start justify-between gap-2 px-3.5 pt-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-ink" title={config.title}>
            {config.title}
          </h4>
          <p className="mt-0.5 truncate text-xs text-muted">{autoSubtitle(config, dashboardFilter)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {WIDGET_TYPE_LABELS[config.type]}
        </span>
      </header>
      <div className={cn('px-3.5 pt-2 pb-3', HEIGHTS[config.type])}>
        <WidgetView config={config} dashboardFilter={dashboardFilter} />
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-slate-50/60 px-3.5 py-2.5">
        {status === 'added' ? (
          <Button variant="secondary" size="sm" disabled icon={<Check className="size-4 text-success" />}>
            Added to dashboard
          </Button>
        ) : (
          <>
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={onAdd}>
              Add to dashboard
            </Button>
            <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onDiscard}>
              Discard
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}
