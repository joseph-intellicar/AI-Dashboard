import { formatIstDateTime } from '@insightflow/shared';
import { ArrowLeft, History, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import type { VersionSummary } from './historyView';

/** Shown above the grid while an earlier version is previewed. */
export function VersionBanner({
  version,
  notInVersion,
  restoring,
  onRestore,
  onBack,
}: {
  version: VersionSummary;
  notInVersion: string[];
  restoring: boolean;
  onRestore: () => void;
  onBack: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center"
    >
      <History className="hidden size-5 shrink-0 text-primary sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          Viewing version from {formatIstDateTime(version.createdAt, { year: true })}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          {version.summary}. Read-only, showing live data.
          {notInVersion.length ? (
            <span className="block truncate" title={notInVersion.join(', ')}>
              Not in this version: {notInVersion.join(', ')}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Back to current
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<RotateCcw className="size-4" />}
          loading={restoring}
          onClick={onRestore}
        >
          Restore this version
        </Button>
      </div>
    </div>
  );
}
