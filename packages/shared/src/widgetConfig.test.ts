import { describe, expect, it } from 'vitest';
import {
  autoSubtitle,
  autoTitle,
  convertType,
  emptyConfig,
  fieldsForType,
  normaliseOptions,
  parseWidgetConfig,
  queryPart,
  suggestType,
  validateForBuilder,
  visualizationAvailability,
  widgetConfigJsonSchema,
  type PoolItem,
  type WidgetConfig,
  type WidgetType,
} from './widgetConfig';

const NOW = new Date('2026-10-15T04:30:00Z');
const m = (key: string) => ({ kind: 'measure', key }) as PoolItem;
const a = (key: string) => ({ kind: 'attribute', key }) as PoolItem;

function make(
  type: WidgetType,
  pool: PoolItem[],
  patch: Partial<WidgetConfig['options']> = {},
): WidgetConfig {
  const base = emptyConfig(type);
  const config: WidgetConfig = { ...base, fields: fieldsForType(type, pool).fields };
  config.options = { ...normaliseOptions(config), ...patch };
  config.title = autoTitle(config);
  return config;
}

describe('validateForBuilder — slot rules per type', () => {
  it('accepts a valid widget of every type', () => {
    expect(validateForBuilder(make('kpi', [m('revenue')]))).toEqual({ valid: true, reason: null });
    expect(validateForBuilder(make('line', [m('revenue'), m('orders'), a('order_date')])).valid).toBe(true);
    expect(validateForBuilder(make('bar', [m('revenue'), a('category')])).valid).toBe(true);
    expect(validateForBuilder(make('hbar', [m('revenue'), a('city')])).valid).toBe(true);
    expect(validateForBuilder(make('donut', [m('orders'), a('payment_method')])).valid).toBe(true);
    expect(
      validateForBuilder(make('table', [a('product'), a('category'), m('units_sold'), m('revenue')])).valid,
    ).toBe(true);
  });

  it.each<[string, WidgetConfig, RegExp]>([
    ['empty KPI', make('kpi', []), /Pick a measure to continue/],
    ['line without date', make('line', [m('revenue')]), /Line chart needs a date attribute/],
    ['bar without attribute', make('bar', [m('revenue')]), /Pick an attribute to group by/],
    ['donut with a ratio measure', make('donut', [m('aov'), a('channel')]), /adds up/],
    ['empty table', make('table', []), /Add at least one column/],
    ['table with only attributes', make('table', [a('product')]), /measure column/],
    ['return reason with revenue', make('bar', [m('revenue'), a('return_reason')]), /Returned Orders/],
  ])('rejects %s', (_name, config, reason) => {
    const result = validateForBuilder(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(reason);
  });

  it('rejects a KPI with an attribute', () => {
    const config = make('kpi', [m('revenue')]);
    config.fields.attributes = [{ key: 'category' }];
    expect(validateForBuilder(config).reason).toMatch(/remove the attribute/);
  });

  it('rejects an invalid custom date range', () => {
    const config = make('kpi', [m('revenue')], {
      dateRange: { mode: 'custom', from: '2026-09-01', to: '2026-08-01' },
    });
    expect(validateForBuilder(config).reason).toBe("Custom range: 'From' must be before 'To'");
  });

  it('rejects a donut limit above 6 and a limit above 50', () => {
    expect(validateForBuilder(make('donut', [m('revenue'), a('city')], { limit: 8 })).reason).toMatch(
      /at most 6/,
    );
    expect(validateForBuilder(make('bar', [m('revenue'), a('city')], { limit: 51 })).valid).toBe(false);
  });

  it('rejects an empty filter and filtering by date', () => {
    const config = make('bar', [m('revenue'), a('category')], {
      filter: { attribute: 'region', op: 'in', values: [] },
    });
    expect(validateForBuilder(config).reason).toBe('Pick at least one filter value');
    config.options.filter = { attribute: 'order_date', op: 'in', values: ['2026-10-01'] };
    expect(validateForBuilder(config).reason).toMatch(/date range/);
  });

  it('rejects unknown keys and an empty title', () => {
    const config = make('kpi', [m('revenue')]);
    expect(
      validateForBuilder({
        ...config,
        fields: { measures: [{ key: 'drop_table' as never }], attributes: [] },
      }).valid,
    ).toBe(false);
    expect(validateForBuilder({ ...config, title: '  ' }).reason).toBe('Give the widget a title');
  });
});

describe('suggestType', () => {
  it('follows the suggestion rules', () => {
    expect(suggestType([])).toBeNull();
    expect(suggestType([m('revenue')])).toBe('kpi');
    expect(suggestType([m('revenue'), a('order_date')])).toBe('line');
    expect(suggestType([m('revenue'), a('category')])).toBe('bar');
    expect(suggestType([m('revenue'), a('category'), a('region')])).toBe('table');
    expect(suggestType([m('revenue'), m('orders'), a('category')])).toBe('table');
  });
});

describe('visualizationAvailability', () => {
  it('enables everything when nothing is picked', () => {
    expect(Object.values(visualizationAvailability([])).every((v) => v.enabled && !v.hint)).toBe(true);
  });

  it('hints that a line needs a date when only a measure is picked', () => {
    const av = visualizationAvailability([m('revenue')]);
    expect(av.kpi.enabled).toBe(true);
    expect(av.line).toEqual({ enabled: true, hint: 'Line chart needs a date attribute' });
  });

  it('greys out types that conflict with the picked fields', () => {
    const av = visualizationAvailability([m('revenue'), a('category')]);
    expect(av.kpi).toEqual({ enabled: false, hint: 'KPI shows a single measure — remove the attribute' });
    expect(av.line.enabled).toBe(false);
    expect(av.bar.enabled).toBe(true);
    expect(visualizationAvailability([m('aov'), a('channel')]).donut.hint).toMatch(/adds up/);
  });
});

describe('convertType', () => {
  it('keeps both fields as columns when switching Bar → Table', () => {
    const { config, dropped } = convertType(make('bar', [m('revenue'), a('category')]), 'table');
    expect(config.fields.columns).toEqual([
      { kind: 'measure', key: 'revenue' },
      { kind: 'attribute', key: 'category' },
    ]);
    expect(dropped).toEqual([]);
  });

  it('reports dropped fields when switching Table → Bar', () => {
    const table = make('table', [a('product'), a('region'), m('revenue')]);
    const { config, dropped } = convertType(table, 'bar');
    expect(config.fields).toMatchObject({ measures: [{ key: 'revenue' }], attributes: [{ key: 'product' }] });
    expect(dropped).toEqual(['Region']);
  });

  it('adds an auto grain to the date attribute for line charts', () => {
    const { config } = convertType(make('table', [m('revenue'), a('order_date')]), 'line');
    expect(config.fields.attributes).toEqual([{ key: 'order_date', grain: 'auto' }]);
    expect(config.options.sort).toBeNull();
  });

  it('keeps a custom title', () => {
    const bar = { ...make('bar', [m('revenue'), a('category')]), title: 'My chart', titleIsCustom: true };
    expect(convertType(bar, 'donut').config.title).toBe('My chart');
  });
});

describe('autoTitle / autoSubtitle', () => {
  it('generates titles from the fields', () => {
    expect(autoTitle(make('kpi', [m('revenue')]))).toBe('Total Revenue');
    expect(autoTitle(make('kpi', [m('aov')]))).toBe('Average Order Value');
    expect(autoTitle(make('line', [m('revenue'), a('order_date')]))).toBe('Revenue Trend');
    expect(autoTitle(make('line', [m('revenue'), m('orders'), a('order_date')]))).toBe(
      'Revenue & Orders Trend',
    );
    expect(autoTitle(make('bar', [m('revenue'), a('category')]))).toBe('Revenue by Category');
    expect(autoTitle(make('table', [a('product'), a('category'), m('units_sold'), m('revenue')]))).toBe(
      'Top 10 Products',
    );
    expect(autoTitle(make('table', [a('city'), m('revenue')], { limit: 5 }))).toBe('Top 5 Cities');
  });

  it('adds the filter to the title', () => {
    const config = make('bar', [m('revenue'), a('category')], {
      filter: { attribute: 'region', op: 'in', values: ['South'] },
    });
    expect(autoTitle(config)).toBe('Revenue by Category · South');
    config.options.filter = { attribute: 'city', op: 'not_in', values: ['Delhi', 'Pune', 'Jaipur'] };
    expect(autoTitle(config)).toBe('Revenue by Category · excl. 3 cities');
  });

  it('builds subtitles from the effective date range and unit', () => {
    const config = make('bar', [m('revenue'), a('category')]);
    expect(autoSubtitle(config, { preset: 'last_30_days' }, NOW)).toBe('Last 30 days · ₹');
    const own = make('kpi', [m('orders')], { dateRange: { mode: 'preset', preset: 'last_12_months' } });
    expect(autoSubtitle(own, { preset: 'last_30_days' }, NOW)).toBe('Last 12 months · Orders');
    expect(autoSubtitle(make('kpi', [m('return_rate')]), { preset: 'last_90_days' }, NOW)).toBe(
      'Last 90 days · %',
    );
  });
});

describe('queryPart and parsing', () => {
  it('excludes title and appearance from the query part', () => {
    const config = make('bar', [m('revenue'), a('category')]);
    const recoloured = {
      ...config,
      title: 'X',
      appearance: { ...config.appearance, colors: { accent: '#DC2626' } },
    };
    expect(queryPart(recoloured)).toEqual(queryPart(config));
    expect(Object.keys(queryPart(config))).toEqual(['type', 'fields', 'options']);
  });

  it('fills defaults when parsing a minimal config', () => {
    const parsed = parseWidgetConfig({
      version: 1,
      type: 'kpi',
      title: 'Total Revenue',
      fields: { measures: [{ key: 'revenue' }] },
      options: {},
    });
    expect(parsed.options.dateRange).toEqual({ mode: 'dashboard' });
    expect(parsed.appearance.numberFormat).toBe('compact');
  });

  it('exports a JSON Schema for Phase 2', () => {
    const schema = widgetConfigJsonSchema() as { type: string; properties: Record<string, unknown> };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['type', 'title', 'fields', 'options', 'appearance']),
    );
  });
});
