/**
 * The default dashboard (REQUIREMENTS §5). Copied into a user's dashboard on first login
 * and on "Reset to default". Exists only in code — never as a shared database row.
 */
import type { DateFilter } from './dateRanges';
import { AppearanceSchema, type WidgetConfig } from './widgetConfig';

export interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardTemplate {
  dateFilter: DateFilter;
  widgets: { layout: Layout; config: WidgetConfig }[];
}

const appearance = (patch: Partial<WidgetConfig['appearance']> = {}) => ({
  ...AppearanceSchema.parse({}),
  ...patch,
});

function kpi(
  measure: WidgetConfig['fields']['measures'][number]['key'],
  title: string,
  secondary?: 'margin_pct',
) {
  return {
    version: 1,
    type: 'kpi',
    title,
    titleIsCustom: true,
    fields: { measures: [{ key: measure }], attributes: [], columns: null },
    options: {
      dateRange: { mode: 'dashboard' },
      compare: true,
      secondaryMeasure: secondary ?? null,
      sort: null,
      limit: null,
      filter: null,
    },
    appearance: appearance(),
  } satisfies WidgetConfig;
}

function grouped(
  type: 'bar' | 'hbar' | 'donut',
  measure: 'revenue' | 'orders',
  attribute: 'category' | 'channel' | 'city' | 'payment_method',
  title: string,
): WidgetConfig {
  return {
    version: 1,
    type,
    title,
    titleIsCustom: false,
    fields: { measures: [{ key: measure }], attributes: [{ key: attribute }], columns: null },
    options: {
      dateRange: { mode: 'dashboard' },
      compare: false,
      secondaryMeasure: null,
      sort: { by: measure, dir: 'desc' },
      limit: type === 'donut' ? 6 : 10,
      filter: null,
    },
    appearance: appearance({
      dataLabels: type === 'hbar',
      legend: { show: type === 'donut', position: type === 'donut' ? 'right' : 'bottom' },
      colors: type === 'bar' ? { colorByValue: true } : {},
    }),
  };
}

const revenueTrend: WidgetConfig = {
  version: 1,
  type: 'line',
  title: 'Revenue Trend',
  titleIsCustom: false,
  fields: {
    measures: [{ key: 'revenue' }],
    attributes: [{ key: 'order_date', grain: 'auto' }],
    columns: null,
  },
  options: {
    dateRange: { mode: 'dashboard' },
    compare: false,
    secondaryMeasure: null,
    sort: null,
    limit: null,
    filter: null,
  },
  appearance: appearance({ legend: { show: false, position: 'bottom' }, line: { smooth: true, area: true } }),
};

const topProducts: WidgetConfig = {
  version: 1,
  type: 'table',
  title: 'Top 10 Products',
  titleIsCustom: false,
  fields: {
    measures: [],
    attributes: [],
    columns: [
      { kind: 'attribute', key: 'product' },
      { kind: 'attribute', key: 'category' },
      { kind: 'measure', key: 'units_sold' },
      { kind: 'measure', key: 'revenue' },
    ],
  },
  options: {
    dateRange: { mode: 'dashboard' },
    compare: false,
    secondaryMeasure: null,
    sort: { by: 'revenue', dir: 'desc' },
    limit: 10,
    filter: null,
  },
  appearance: appearance({ numberFormat: 'full' }),
};

export const DEFAULT_DASHBOARD: DashboardTemplate = {
  dateFilter: { preset: 'last_30_days' },
  widgets: [
    { layout: { x: 0, y: 0, w: 2, h: 2 }, config: kpi('revenue', 'Total Revenue') },
    { layout: { x: 2, y: 0, w: 2, h: 2 }, config: kpi('orders', 'Total Orders') },
    { layout: { x: 4, y: 0, w: 2, h: 2 }, config: kpi('aov', 'Average Order Value') },
    { layout: { x: 6, y: 0, w: 2, h: 2 }, config: kpi('gross_profit', 'Gross Profit', 'margin_pct') },
    { layout: { x: 8, y: 0, w: 2, h: 2 }, config: kpi('customers', 'Unique Customers') },
    { layout: { x: 10, y: 0, w: 2, h: 2 }, config: kpi('return_rate', 'Return Rate') },
    { layout: { x: 0, y: 2, w: 8, h: 4 }, config: revenueTrend },
    {
      layout: { x: 8, y: 2, w: 4, h: 4 },
      config: grouped('bar', 'revenue', 'category', 'Revenue by Category'),
    },
    {
      layout: { x: 0, y: 6, w: 4, h: 4 },
      // The brief's title differs from the auto title ("Revenue by Channel"), so keep it as custom.
      config: { ...grouped('donut', 'revenue', 'channel', 'Sales by Channel'), titleIsCustom: true },
    },
    { layout: { x: 4, y: 6, w: 8, h: 4 }, config: topProducts },
    { layout: { x: 0, y: 10, w: 6, h: 4 }, config: grouped('hbar', 'revenue', 'city', 'Revenue by City') },
    {
      layout: { x: 6, y: 10, w: 6, h: 4 },
      config: grouped('donut', 'orders', 'payment_method', 'Orders by Payment Method'),
    },
  ],
};

/** True when two layouts overlap on the grid. */
export function layoutsOverlap(p: Layout, q: Layout): boolean {
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
}
