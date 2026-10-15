import { describe, expect, it } from 'vitest';
import { DEFAULT_DASHBOARD, layoutsOverlap } from './defaultDashboard';
import { MIN_SIZES, WidgetConfigSchema, autoTitle } from './widgetConfig';

const widgets = DEFAULT_DASHBOARD.widgets;

describe('DEFAULT_DASHBOARD', () => {
  it('has the 12 widgets from the requirements, in order', () => {
    expect(widgets.map((w) => `${w.config.type}:${w.config.title}`)).toEqual([
      'kpi:Total Revenue',
      'kpi:Total Orders',
      'kpi:Average Order Value',
      'kpi:Gross Profit',
      'kpi:Unique Customers',
      'kpi:Return Rate',
      'line:Revenue Trend',
      'bar:Revenue by Category',
      'donut:Sales by Channel',
      'table:Top 10 Products',
      'hbar:Revenue by City',
      'donut:Orders by Payment Method',
    ]);
  });

  it('defaults to Last 30 days', () => {
    expect(DEFAULT_DASHBOARD.dateFilter).toEqual({ preset: 'last_30_days' });
  });

  it('only contains valid widget configs', () => {
    for (const w of widgets) {
      const result = WidgetConfigSchema.safeParse(w.config);
      expect(result.success, `${w.config.title}: ${result.error?.issues[0]?.message}`).toBe(true);
    }
  });

  it('keeps auto titles in sync with the fields', () => {
    for (const w of widgets.filter((w) => !w.config.titleIsCustom)) {
      expect(autoTitle(w.config)).toBe(w.config.title);
    }
  });

  it('fits a 12-column grid without overlaps and respects minimum sizes', () => {
    widgets.forEach((w, i) => {
      expect(w.layout.x + w.layout.w).toBeLessThanOrEqual(12);
      expect(w.layout.w).toBeGreaterThanOrEqual(MIN_SIZES[w.config.type].w);
      expect(w.layout.h).toBeGreaterThanOrEqual(MIN_SIZES[w.config.type].h);
      widgets.slice(i + 1).forEach((other) => expect(layoutsOverlap(w.layout, other.layout)).toBe(false));
    });
  });

  it('shows margin under Gross Profit and compares every KPI', () => {
    const kpis = widgets.filter((w) => w.config.type === 'kpi');
    expect(kpis.every((w) => w.config.options.compare)).toBe(true);
    expect(kpis.find((w) => w.config.title === 'Gross Profit')?.config.options.secondaryMeasure).toBe(
      'margin_pct',
    );
  });
});
