import type { DateFilter, QueryResult, WidgetConfig } from '@insightflow/shared';
import { BarWidget } from './BarWidget';
import { DonutWidget } from './DonutWidget';
import { KpiWidget } from './KpiWidget';
import { LineWidget } from './LineWidget';
import { TableWidget } from './TableWidget';
import type { WidgetPickHandler } from './types';
import { useWidgetData } from './useWidgetData';
import { WidgetEmpty, WidgetError, WidgetSkeleton } from './WidgetStates';

export function isEmptyResult(config: WidgetConfig, result: QueryResult): boolean {
  if (result.meta.empty) return true;
  return config.type !== 'kpi' && config.type !== 'line' && result.rows.length === 0;
}

/** Renders a widget's body: loads its data and shows loading / empty / error / chart. */
export function WidgetView({
  config,
  dashboardFilter,
  onPick,
}: {
  config: WidgetConfig;
  dashboardFilter: DateFilter;
  onPick?: WidgetPickHandler;
}) {
  const data = useWidgetData(config, dashboardFilter);
  if (data.isPending) return <WidgetSkeleton type={config.type} />;
  if (data.isError) return <WidgetError message={data.error.message} onRetry={() => data.refetch()} />;
  const result = data.data;
  if (isEmptyResult(config, result)) return <WidgetEmpty />;

  return (
    <div className={data.isFetching ? 'h-full opacity-70 transition-opacity' : 'h-full transition-opacity'}>
      <WidgetBody config={config} result={result} dashboardFilter={dashboardFilter} onPick={onPick} />
    </div>
  );
}

export function WidgetBody({
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
  switch (config.type) {
    case 'kpi':
      return <KpiWidget config={config} result={result} dashboardFilter={dashboardFilter} onPick={onPick} />;
    case 'line':
      return <LineWidget config={config} result={result} onPick={onPick} />;
    case 'bar':
    case 'hbar':
      return <BarWidget config={config} result={result} onPick={onPick} />;
    case 'donut':
      return <DonutWidget config={config} result={result} onPick={onPick} />;
    case 'table':
      return <TableWidget config={config} result={result} onPick={onPick} />;
  }
}
