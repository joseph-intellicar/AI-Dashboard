import { VALUE_COLORS, getAttribute, getMeasure, seriesColor, type DateFilter } from '@insightflow/shared';
import { Toggle } from '../components/ui/Controls';
import {
  accentColor,
  barsColorByValue,
  colorForSeries,
  colorForValue,
  withOverride,
  type ColorTarget,
} from '../widgets/colors';
import { useWidgetData } from '../widgets/useWidgetData';
import type { BuilderAction, BuilderState } from './builderState';
import type { ColorPickRequest } from './ColorPopover';
import { Section } from './OptionsPanel';

const FIXED = new Set(Object.keys(VALUE_COLORS));

/** Lists every colourable part of the widget; clicking a swatch opens the colour popover. */
export function ColorsPanel({
  state,
  dispatch,
  dashboardFilter,
  previewEnabled,
  openPicker,
}: {
  state: BuilderState;
  dispatch: (a: BuilderAction) => void;
  dashboardFilter: DateFilter;
  previewEnabled: boolean;
  openPicker: (r: ColorPickRequest) => void;
}) {
  const c = state.config;
  const colors = c.appearance.colors;
  // Same query key as the preview → served from cache, no extra request.
  const data = useWidgetData(c, dashboardFilter, {
    enabled: previewEnabled && (c.type === 'bar' || c.type === 'hbar' || c.type === 'donut'),
  });
  const set = (target: ColorTarget, color: string | null) =>
    dispatch({ type: 'setColors', colors: withOverride(colors, target, color) });
  const pick =
    (title: string, target: ColorTarget, color: string, isOverridden: boolean) => (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      openPicker({
        title,
        color,
        anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
        isOverridden,
        onChange: (col) => set(target, col),
      });
    };

  if (!previewEnabled) return null;
  const attr = c.fields.attributes[0]?.key;
  const rows: { label: string; target: ColorTarget; color: string; overridden: boolean }[] = [];

  if (c.type === 'kpi') {
    rows.push({
      label: 'Accent (sparkline)',
      target: { kind: 'accent' },
      color: accentColor(colors),
      overridden: Boolean(colors.accent),
    });
  } else if (c.type === 'line') {
    c.fields.measures.forEach((m, i) =>
      rows.push({
        label: getMeasure(m.key).label,
        target: { kind: 'series', key: m.key },
        color: colorForSeries(colors, m.key, i),
        overridden: Boolean(colors.series?.[m.key]),
      }),
    );
  } else if (c.type === 'table') {
    rows.push({
      label: 'Data bar',
      target: { kind: 'dataBar' },
      color: colors.dataBar ?? seriesColor(0),
      overridden: Boolean(colors.dataBar),
    });
  }

  const byValue =
    attr && (c.type === 'bar' || c.type === 'hbar')
      ? barsColorByValue(colors, attr, FIXED) && getAttribute(attr).kind !== 'date'
      : c.type === 'donut';
  if ((c.type === 'bar' || c.type === 'hbar') && attr && !byValue) {
    const m = c.fields.measures[0]?.key;
    if (m)
      rows.push({
        label: 'Bars',
        target: { kind: 'series', key: m },
        color: colorForSeries(colors, m, 0),
        overridden: Boolean(colors.series?.[m]),
      });
  }
  if (byValue && attr && data.data) {
    for (const r of data.data.rows.slice(0, 16)) {
      const v = String(r[attr]);
      rows.push({
        label: v,
        target: { kind: 'value', key: v },
        color: colorForValue(colors, attr, v),
        overridden: Boolean(colors.values?.[v]),
      });
    }
  }

  const hasOverrides = Boolean(
    colors.accent ||
    colors.dataBar ||
    Object.keys(colors.series ?? {}).length ||
    Object.keys(colors.values ?? {}).length,
  );

  return (
    <Section
      title="Colours"
      action={
        hasOverrides ? (
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'setColors',
                colors: colors.colorByValue === undefined ? {} : { colorByValue: colors.colorByValue },
              })
            }
            className="text-xs text-muted hover:text-ink"
          >
            Reset all
          </button>
        ) : null
      }
    >
      {(c.type === 'bar' || c.type === 'hbar') && attr && getAttribute(attr).kind !== 'date' ? (
        <Toggle
          id="opt-color-by-value"
          checked={Boolean(byValue)}
          onCheckedChange={(v) => dispatch({ type: 'setColors', colors: { ...colors, colorByValue: v } })}
          label="Colour each bar by value"
        />
      ) : null}
      <div className="space-y-1">
        {rows.map((row) => (
          <button
            key={`${row.target.kind}:${'key' in row.target ? row.target.key : ''}`}
            type="button"
            onClick={(e) => pick(row.label, row.target, row.color, row.overridden)(e.currentTarget)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
          >
            <span
              className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ background: row.color }}
            />
            <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
            {row.overridden ? <span className="text-[11px] text-primary">Custom</span> : null}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Tip: click a bar, slice or line in the preview to change its colour. Colours apply to this widget
        only.
      </p>
    </Section>
  );
}
