import { describe, expect, it } from 'vitest';
import { accentColor, barsColorByValue, colorForSeries, colorForValue, withOverride } from './colors';

describe('colour resolution', () => {
  it('prefers the widget override, then the global value colour', () => {
    expect(colorForValue({}, 'category', 'Decor')).toBe('#F59E0B');
    expect(colorForValue({ values: { Decor: '#DC2626' } }, 'category', 'Decor')).toBe('#DC2626');
    expect(colorForValue({}, 'category', 'Other')).toBe('#CBD5E1');
  });

  it('uses palette order for series unless overridden', () => {
    expect(colorForSeries({}, 'revenue', 0)).toBe('#0D9488');
    expect(colorForSeries({}, 'orders', 1)).toBe('#F59E0B');
    expect(colorForSeries({ series: { orders: '#111111' } }, 'orders', 1)).toBe('#111111');
    expect(accentColor({ accent: '#6366F1' })).toBe('#6366F1');
  });

  it('colours bars by value only for fixed domains unless set explicitly', () => {
    const fixed = new Set(['category']);
    expect(barsColorByValue({}, 'category', fixed)).toBe(true);
    expect(barsColorByValue({}, 'city', fixed)).toBe(false);
    expect(barsColorByValue({ colorByValue: true }, 'city', fixed)).toBe(true);
  });
});

describe('withOverride', () => {
  it('sets and resets overrides without touching others', () => {
    const a = withOverride({}, { kind: 'value', key: 'Lighting' }, '#DC2626');
    expect(a).toEqual({ values: { Lighting: '#DC2626' } });
    const b = withOverride(a, { kind: 'value', key: 'Decor' }, '#111111');
    expect(b.values).toEqual({ Lighting: '#DC2626', Decor: '#111111' });
    expect(withOverride(b, { kind: 'value', key: 'Decor' }, null)).toEqual(a);
    expect(withOverride(a, { kind: 'value', key: 'Lighting' }, null)).toEqual({});
    expect(withOverride({}, { kind: 'accent' }, '#6366F1')).toEqual({ accent: '#6366F1' });
    expect(withOverride({ accent: '#6366F1' }, { kind: 'accent' }, null)).toEqual({});
  });
});
