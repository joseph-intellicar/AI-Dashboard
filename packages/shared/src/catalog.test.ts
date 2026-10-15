import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTES,
  MEASURES,
  getAttribute,
  getMeasure,
  incompatibility,
  isMeasureKey,
  matchesSearch,
} from './catalog';
import { CHART_PALETTE, OTHER_COLOR, contrastText, hashColor, valueColor } from './colors';

/** Columns of v_order_lines (db/migrations/0003_reporting_views.ts). */
// prettier-ignore
const VIEW_COLUMNS = new Set([
  'order_date', 'day_of_week', 'category', 'sub_category', 'product_name', 'collection', 'price_band',
  'city', 'region', 'customer_type', 'acquisition_source', 'channel', 'platform', 'payment_method',
  'order_status', 'coupon_used', 'return_reason',
]);

describe('catalog', () => {
  it('has unique keys across measures and attributes', () => {
    const keys = [...MEASURES.map((m) => m.key), ...ATTRIBUTES.map((a) => a.key)];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('defines the measures and attributes from the requirements', () => {
    expect(MEASURES).toHaveLength(18);
    expect(ATTRIBUTES).toHaveLength(17);
  });

  it('maps every attribute to a reporting-view column', () => {
    for (const a of ATTRIBUTES) expect(VIEW_COLUMNS.has(a.column), a.key).toBe(true);
  });

  it('gives every entry a description and synonyms in lower case', () => {
    for (const d of [...MEASURES, ...ATTRIBUTES]) {
      expect(d.description.length, d.key).toBeGreaterThan(10);
      for (const s of d.synonyms) expect(s, d.key).toBe(s.toLowerCase());
    }
  });

  it('marks return rate as bad when it goes up', () => {
    expect(getMeasure('return_rate').positiveIsGood).toBe(false);
    expect(getMeasure('revenue').positiveIsGood).toBe(true);
  });

  it('throws on unknown keys', () => {
    expect(() => getMeasure('drop table')).toThrow(/Unknown measure/);
    expect(() => getAttribute('nope')).toThrow(/Unknown attribute/);
    expect(isMeasureKey('revenue')).toBe(true);
    expect(isMeasureKey('product')).toBe(false);
  });

  it('restricts return reason to returned orders', () => {
    expect(incompatibility('revenue', 'return_reason')).toMatch(/Returned Orders/);
    expect(incompatibility('returned_orders', 'return_reason')).toBeNull();
    expect(incompatibility('revenue', 'category')).toBeNull();
  });

  it('searches labels, synonyms and descriptions', () => {
    expect(matchesSearch(getMeasure('revenue'), 'sales')).toBe(true);
    expect(matchesSearch(getMeasure('revenue'), 'GMV')).toBe(true);
    expect(matchesSearch(getAttribute('city'), 'city')).toBe(true);
    expect(matchesSearch(getAttribute('city'), 'zzz')).toBe(false);
  });
});

describe('colors', () => {
  it('uses fixed colours for small-domain attributes', () => {
    expect(valueColor('category', 'Decor')).toBe('#F59E0B');
    expect(valueColor('channel', 'App')).toBe('#F59E0B');
    expect(valueColor('region', 'Other')).toBe(OTHER_COLOR);
  });

  it('gives many-valued attributes a stable palette colour', () => {
    const a = valueColor('product', 'Rattan Table Lamp');
    expect(valueColor('product', 'Rattan Table Lamp')).toBe(a);
    expect(CHART_PALETTE).toContain(a);
    expect(hashColor('x')).toBe(hashColor('x'));
  });

  it('picks readable label text', () => {
    expect(contrastText('#0F766E')).toBe('#FFFFFF');
    expect(contrastText('#F59E0B')).toBe('#0F172A');
    expect(contrastText('#FFFFFF')).toBe('#0F172A');
  });
});
