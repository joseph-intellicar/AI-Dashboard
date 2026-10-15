import { VALUE_COLORS, getAttribute } from '@insightflow/shared';
import { describe, expect, it } from 'vitest';
import { RETURN_REASONS, CATEGORIES, CITIES, PRODUCTS, REGIONS } from './reference';

describe('catalog ↔ seed consistency', () => {
  it('has a fixed colour for every seeded category and region', () => {
    for (const c of CATEGORIES) expect(VALUE_COLORS.category![c.name], c.name).toBeDefined();
    for (const r of REGIONS) expect(VALUE_COLORS.region![r.name], r.name).toBeDefined();
  });

  it('has a fixed colour for every collection and platform', () => {
    for (const p of PRODUCTS) expect(VALUE_COLORS.collection![p.collection], p.collection).toBeDefined();
    for (const v of getAttribute('platform').values ?? []) expect(VALUE_COLORS.platform![v]).toBeDefined();
  });

  it('lists every region in the attribute value order', () => {
    expect([...(getAttribute('region').values ?? [])].sort()).toEqual(REGIONS.map((r) => r.name).sort());
  });

  it('has 8 cities and 5 return reasons', () => {
    expect(CITIES).toHaveLength(8);
    expect(RETURN_REASONS).toHaveLength(5);
  });
});
