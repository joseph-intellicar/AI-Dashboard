import { describe, expect, it } from 'vitest';
import { publicCatalog } from './routes';

describe('publicCatalog', () => {
  it('contains no view columns or SQL', () => {
    const json = JSON.stringify(publicCatalog());
    expect(json).not.toMatch(/"column"|"level"|SELECT|v_order/i);
  });

  it('includes measures, attributes and colours', () => {
    const c = publicCatalog();
    expect(c.measures.length).toBeGreaterThan(10);
    expect(c.attributes.find((a) => a.key === 'region')).toMatchObject({ label: 'Region' });
    expect(c.colors.values.category?.Decor).toBe('#F59E0B');
  });
});
