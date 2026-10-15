import {
  ATTRIBUTES,
  DONUT_MAX_SLICES,
  MAX_LIMIT,
  MEASURES,
  PRESET_LABELS,
  getAttribute,
  getMeasure,
  resolveDateFilter,
  usedFields,
  type DateFilter,
  type WidgetDateRange,
} from '@insightflow/shared';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Field, Input, MultiSelect, SegmentedControl, Select, Toggle } from '../components/ui/Controls';
import { DateFilterPicker } from '../components/ui/DateFilterPicker';
import type { BuilderAction, BuilderState } from './builderState';
import { useAttributeValues } from './useAttributeValues';

function toFilter(range: WidgetDateRange, dashboard: DateFilter): DateFilter {
  if (range.mode === 'dashboard') return dashboard;
  if (range.mode === 'preset') return { preset: range.preset };
  return { preset: 'custom', from: range.from, to: range.to };
}

export function OptionsPanel({
  state,
  dispatch,
  dashboardFilter,
}: {
  state: BuilderState;
  dispatch: (a: BuilderAction) => void;
  dashboardFilter: DateFilter;
}) {
  const c = state.config;
  const o = c.options;
  const setOptions = (patch: Partial<typeof o>) => dispatch({ type: 'setOptions', patch });
  const setAppearance = (patch: Partial<typeof c.appearance>) => dispatch({ type: 'setAppearance', patch });
  const { measures, attributes } = usedFields(c);
  const isDateChart = c.type === 'line' || (attributes[0] && getAttribute(attributes[0].key).kind === 'date');
  const showSort = c.type !== 'kpi' && !isDateChart && (measures.length > 0 || attributes.length > 0);
  const showLimit = showSort;
  const maxLimit = c.type === 'donut' ? DONUT_MAX_SLICES : MAX_LIMIT;
  const range = o.dateRange;
  const dashboardLabel = resolveDateFilter(dashboardFilter).label;

  return (
    <div className="space-y-5">
      <Section title="Date range">
        <DateFilterPicker
          fullWidth
          value={toFilter(range, dashboardFilter)}
          triggerLabel={range.mode === 'dashboard' ? `Dashboard filter (${dashboardLabel})` : undefined}
          extra={{
            label: `Use dashboard filter (${dashboardLabel})`,
            active: range.mode === 'dashboard',
            onSelect: () => setOptions({ dateRange: { mode: 'dashboard' } }),
          }}
          onChange={(f) =>
            setOptions({
              dateRange:
                f.preset === 'custom'
                  ? { mode: 'custom', from: f.from, to: f.to }
                  : { mode: 'preset', preset: f.preset },
            })
          }
        />
        {range.mode === 'preset' ? (
          <p className="text-xs text-muted">
            Always {PRESET_LABELS[range.preset].toLowerCase()}, whatever the dashboard filter.
          </p>
        ) : null}
      </Section>

      {c.type === 'kpi' ? (
        <Section title="KPI">
          <Toggle
            id="opt-compare"
            checked={o.compare}
            onCheckedChange={(v) => setOptions({ compare: v })}
            label="Compare to previous period"
          />
          <Field label="Secondary measure">
            <Select
              value={o.secondaryMeasure ?? ''}
              onChange={(e) =>
                setOptions({ secondaryMeasure: (e.target.value || null) as typeof o.secondaryMeasure })
              }
            >
              <option value="">None</option>
              {MEASURES.filter((m) => m.key !== measures[0]).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </Section>
      ) : null}

      {showSort ? (
        <Section title="Sort & limit">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Sort by">
              <Select
                value={o.sort?.by ?? ''}
                onChange={(e) => setOptions({ sort: { by: e.target.value, dir: o.sort?.dir ?? 'desc' } })}
              >
                {[
                  ...measures.map((k) => ({ key: k, label: getMeasure(k).label })),
                  ...attributes.map((a) => ({ key: a.key, label: getAttribute(a.key).label })),
                ].map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <SegmentedControl
              label="Sort direction"
              value={o.sort?.dir ?? 'desc'}
              onChange={(dir) => setOptions({ sort: { by: o.sort?.by ?? measures[0] ?? '', dir } })}
              options={[
                { value: 'desc', label: 'High → low' },
                { value: 'asc', label: 'Low → high' },
              ]}
            />
          </div>
          {showLimit ? (
            <Field
              label={
                c.type === 'donut'
                  ? `Slices (max ${DONUT_MAX_SLICES}, rest shown as “Other”)`
                  : `Show top N (max ${MAX_LIMIT})`
              }
            >
              <Input
                type="number"
                min={1}
                max={maxLimit}
                value={o.limit ?? ''}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  setOptions({ limit: Number.isFinite(n) && n > 0 ? Math.min(n, maxLimit) : null });
                }}
              />
            </Field>
          ) : null}
        </Section>
      ) : null}

      <FilterSection state={state} setOptions={setOptions} />

      <Section title="Display">
        <Field label="Numbers">
          <SegmentedControl
            label="Number format"
            value={c.appearance.numberFormat}
            onChange={(numberFormat) => setAppearance({ numberFormat })}
            options={[
              { value: 'compact', label: 'Compact (₹4.5L)' },
              { value: 'full', label: 'Full (₹4,52,300)' },
            ]}
          />
        </Field>
        {c.type === 'bar' || c.type === 'hbar' || c.type === 'donut' ? (
          <Toggle
            id="opt-labels"
            checked={c.appearance.dataLabels}
            onCheckedChange={(v) => setAppearance({ dataLabels: v })}
            label="Show data labels"
          />
        ) : null}
        {c.type === 'donut' ? (
          <>
            <Toggle
              id="opt-legend"
              checked={c.appearance.legend.show}
              onCheckedChange={(v) => setAppearance({ legend: { ...c.appearance.legend, show: v } })}
              label="Show legend"
            />
            {c.appearance.legend.show ? (
              <SegmentedControl
                label="Legend position"
                value={c.appearance.legend.position}
                onChange={(position) => setAppearance({ legend: { ...c.appearance.legend, position } })}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
              />
            ) : null}
          </>
        ) : null}
        {c.type === 'line' ? (
          <>
            <Toggle
              id="opt-smooth"
              checked={c.appearance.line.smooth}
              onCheckedChange={(v) => setAppearance({ line: { ...c.appearance.line, smooth: v } })}
              label="Smooth curve"
            />
            <Toggle
              id="opt-area"
              checked={c.appearance.line.area}
              onCheckedChange={(v) => setAppearance({ line: { ...c.appearance.line, area: v } })}
              label="Area fill"
            />
            <Toggle
              id="opt-prev"
              checked={o.compare}
              onCheckedChange={(v) => setOptions({ compare: v })}
              label="Show previous period (dashed)"
            />
          </>
        ) : null}
      </Section>
    </div>
  );
}

function FilterSection({
  state,
  setOptions,
}: {
  state: BuilderState;
  setOptions: (p: Partial<BuilderState['config']['options']>) => void;
}) {
  const filter = state.config.options.filter;
  const values = useAttributeValues(filter?.attribute ?? null);
  const filterable = ATTRIBUTES.filter((a) => a.kind !== 'date' && !('compatibleMeasures' in a));
  return (
    <Section
      title="Filter"
      action={
        filter ? (
          <button
            type="button"
            onClick={() => setOptions({ filter: null })}
            className="flex items-center gap-1 text-xs text-muted hover:text-danger"
          >
            <X className="size-3" /> Remove
          </button>
        ) : null
      }
    >
      {filter ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filter.attribute}
              onChange={(e) =>
                setOptions({
                  filter: { attribute: e.target.value as typeof filter.attribute, op: filter.op, values: [] },
                })
              }
              aria-label="Filter attribute"
            >
              {filterable.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </Select>
            <Select
              value={filter.op}
              onChange={(e) => setOptions({ filter: { ...filter, op: e.target.value as 'in' | 'not_in' } })}
              aria-label="Filter operator"
            >
              <option value="in">is one of</option>
              <option value="not_in">is not one of</option>
            </Select>
          </div>
          <MultiSelect
            label={`${getAttribute(filter.attribute).label} values`}
            values={filter.values}
            options={values.data ?? []}
            loading={values.isPending}
            onChange={(v) => setOptions({ filter: { ...filter, values: v } })}
            placeholder={`Pick ${getAttribute(filter.attribute).label.toLowerCase()} values`}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOptions({ filter: { attribute: 'region', op: 'in', values: [] } })}
          className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-muted hover:border-primary hover:text-primary"
        >
          + Add a filter (e.g. Region = South)
        </button>
      )}
    </Section>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}
