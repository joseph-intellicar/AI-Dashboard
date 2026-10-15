import {
  WIDGET_TYPES,
  WIDGET_TYPE_LABELS,
  poolFromConfig,
  suggestType,
  visualizationAvailability,
  type WidgetType,
} from '@insightflow/shared';
import { BarChart3, BarChartHorizontal, Hash, LineChart, PieChart, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from '../components/ui/Tooltip';
import { cn } from '../lib/cn';
import type { BuilderState } from './builderState';

const ICONS: Record<WidgetType, ReactNode> = {
  kpi: <Hash />,
  line: <LineChart />,
  bar: <BarChart3 />,
  hbar: <BarChartHorizontal />,
  donut: <PieChart />,
  table: <Table2 />,
};

export function VisualizationPicker({
  state,
  onSelect,
}: {
  state: BuilderState;
  onSelect: (t: WidgetType) => void;
}) {
  const pool = poolFromConfig(state.config);
  const availability = visualizationAvailability(pool);
  const suggested = !state.typeChosen ? suggestType(pool) : null;
  return (
    <div role="radiogroup" aria-label="Visualization" className="grid grid-cols-3 gap-2">
      {WIDGET_TYPES.map((t) => {
        const a = availability[t];
        const active = state.config.type === t && (state.typeChosen || pool.length > 0);
        return (
          <Tooltip key={t} content={a.hint}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={!a.enabled}
              onClick={() => a.enabled && onSelect(t)}
              className={cn(
                'relative flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors [&>svg]:size-5',
                active
                  ? 'border-primary bg-primary-soft text-primary ring-1 ring-primary'
                  : a.enabled
                    ? 'border-line bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-ink'
                    : 'cursor-not-allowed border-dashed border-line bg-slate-50 text-slate-300',
              )}
            >
              {ICONS[t]}
              {WIDGET_TYPE_LABELS[t]}
              {suggested === t ? (
                <span className="absolute -top-2 right-1.5 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-white">
                  Suggested
                </span>
              ) : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
