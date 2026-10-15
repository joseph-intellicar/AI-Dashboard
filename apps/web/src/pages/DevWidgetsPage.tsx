/** Dev-only page (/dev/widgets): every widget type at real grid sizes, for visual checks. */
import { DEFAULT_DASHBOARD, emptyConfig, type WidgetConfig } from '@insightflow/shared';
import { WidgetFrame } from '../dashboard/WidgetFrame';
import { WidgetView } from '../widgets/WidgetView';

const ROW = 80;
const GAP = 16;

const extras: { w: number; h: number; config: WidgetConfig }[] = [
  {
    w: 6,
    h: 4,
    config: {
      ...emptyConfig('line'),
      title: 'Revenue & Margin % Trend',
      fields: {
        measures: [{ key: 'revenue' }, { key: 'margin_pct' }],
        attributes: [{ key: 'order_date', grain: 'auto' }],
        columns: null,
      },
    },
  },
  {
    w: 6,
    h: 4,
    config: {
      ...emptyConfig('line'),
      title: 'Orders vs previous period',
      fields: {
        measures: [{ key: 'orders' }],
        attributes: [{ key: 'order_date', grain: 'week' }],
        columns: null,
      },
      options: {
        ...emptyConfig('line').options,
        compare: true,
        dateRange: { mode: 'preset', preset: 'last_90_days' },
      },
    },
  },
  {
    w: 6,
    h: 4,
    config: {
      ...emptyConfig('bar'),
      title: 'Revenue by Month',
      fields: {
        measures: [{ key: 'revenue' }],
        attributes: [{ key: 'order_date', grain: 'month' }],
        columns: null,
      },
      options: { ...emptyConfig('bar').options, dateRange: { mode: 'preset', preset: 'last_12_months' } },
      appearance: { ...emptyConfig('bar').appearance, colors: { series: { revenue: '#6366F1' } } },
    },
  },
  {
    w: 3,
    h: 2,
    config: {
      ...emptyConfig('kpi'),
      title: 'Empty range',
      fields: { measures: [{ key: 'revenue' }], attributes: [], columns: null },
      options: {
        ...emptyConfig('kpi').options,
        dateRange: { mode: 'custom', from: '2020-01-01', to: '2020-01-31' },
      },
    },
  },
  {
    w: 3,
    h: 2,
    config: {
      ...emptyConfig('kpi'),
      title: 'Error state',
      fields: { measures: [{ key: 'revenue' }], attributes: [{ key: 'city' }], columns: null },
    },
  },
];

export default function DevWidgetsPage() {
  const filter = DEFAULT_DASHBOARD.dateFilter;
  const items = [
    ...DEFAULT_DASHBOARD.widgets.map((w) => ({ w: w.layout.w, h: w.layout.h, config: w.config })),
    ...extras,
  ];
  return (
    <div className="mx-auto max-w-[1440px] p-6">
      <div className="grid grid-cols-12" style={{ gap: GAP, gridAutoRows: ROW }}>
        {items.map((it, i) => (
          <div key={i} style={{ gridColumn: `span ${it.w}`, gridRow: `span ${it.h}` }}>
            <WidgetFrame config={it.config} dashboardFilter={filter}>
              <WidgetView config={it.config} dashboardFilter={filter} />
            </WidgetFrame>
          </div>
        ))}
      </div>
    </div>
  );
}
