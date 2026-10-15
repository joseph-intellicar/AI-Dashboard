import type { WidgetType } from '@insightflow/shared';
import { AlertTriangle, BarChart3, RotateCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Card';

export function WidgetSkeleton({ type }: { type: WidgetType }) {
  if (type === 'kpi') {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5" aria-busy aria-label="Loading">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-36" />
      </div>
    );
  }
  if (type === 'donut') {
    return (
      <div className="flex h-full items-center justify-center gap-6" aria-busy aria-label="Loading">
        <div className="size-32 animate-pulse rounded-full border-[18px] border-slate-200/70" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </div>
    );
  }
  if (type === 'table') {
    return (
      <div className="space-y-2.5 pt-1" aria-busy aria-label="Loading">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }
  const heights = type === 'line' ? [45, 60, 50, 70, 65, 80, 72] : [80, 65, 55, 45, 35, 25, 18];
  if (type === 'hbar') {
    return (
      <div className="flex h-full flex-col justify-center gap-2.5" aria-busy aria-label="Loading">
        {heights.slice(0, 6).map((h, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-slate-200/70" style={{ width: `${h}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-full items-end gap-3 px-2 pb-2" aria-busy aria-label="Loading">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t-md bg-slate-200/70"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function WidgetEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <BarChart3 className="size-5" />
      </span>
      <p className="text-sm text-muted">No data for this period</p>
    </div>
  );
}

export function WidgetError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 text-center" role="alert">
      <span className="flex size-10 items-center justify-center rounded-full bg-red-50 text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <p className="max-w-64 text-sm text-muted">{message}</p>
      <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
