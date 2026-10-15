import { formatIstTime, VERSION_KIND_LABELS } from '@insightflow/shared';
import { History, X } from 'lucide-react';
import { useMemo } from 'react';
import { IconButton, Spinner } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { WidgetError } from '../widgets/WidgetStates';
import { groupByDay, shortenSummary, type VersionSummary } from './historyView';
import { useVersions } from './useVersions';

export const HISTORY_PANEL_WIDTH = 'lg:pr-[380px]';

/** Side panel listing the last 30 days of versions (full-screen sheet on small screens). */
export function HistoryPanel({
  selectedId,
  onSelect,
  onClose,
}: {
  /** The version being previewed; null = the current dashboard. */
  selectedId: string | null;
  onSelect: (version: VersionSummary | null) => void;
  onClose: () => void;
}) {
  const versions = useVersions(true);
  const groups = useMemo(() => groupByDay(versions.data ?? []), [versions.data]);
  const currentId = versions.data?.[0]?.id;

  return (
    <aside
      aria-label="Version history"
      className="fixed top-16 right-0 bottom-0 z-20 flex w-full animate-fade-in flex-col border-l border-line bg-surface shadow-pop lg:w-[364px]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <History className="size-4 text-primary" /> Version history
          </h2>
          <p className="mt-0.5 text-xs text-muted">Last 30 days · times in IST</p>
        </div>
        <IconButton label="Close version history" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {versions.isPending ? (
          <div className="flex h-40 items-center justify-center text-primary">
            <Spinner className="size-5" />
          </div>
        ) : versions.isError ? (
          <div className="h-48">
            <WidgetError message={versions.error.message} onRetry={() => versions.refetch()} />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-muted">No changes in the last 30 days</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-4">
              <h3 className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                {group.label}
              </h3>
              <ul className="space-y-1">
                {group.versions.map((v) => {
                  const isCurrent = v.id === currentId;
                  const selected = isCurrent ? selectedId === null : selectedId === v.id;
                  const { text, more } = shortenSummary(v.summary);
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(isCurrent ? null : v)}
                        aria-current={selected ? 'true' : undefined}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                          selected
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent hover:bg-slate-50',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink tabular">
                            {formatIstTime(v.createdAt)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {VERSION_KIND_LABELS[v.kind]}
                          </span>
                          {isCurrent ? (
                            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-white">
                              Current
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="mt-1 block text-[13px] leading-snug text-slate-600"
                          title={v.summary}
                        >
                          {text}
                          {more ? <span className="text-muted"> +{more} more</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
