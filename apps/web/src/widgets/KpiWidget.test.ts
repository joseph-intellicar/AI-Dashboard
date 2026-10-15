import { describe, expect, it } from 'vitest';
import { changeTone } from './KpiWidget';
import { sortRows } from './TableWidget';

describe('changeTone', () => {
  it('treats an increase as good for revenue and bad for return rate', () => {
    expect(changeTone('up', true)).toBe('good');
    expect(changeTone('down', true)).toBe('bad');
    expect(changeTone('up', false)).toBe('bad');
    expect(changeTone('down', false)).toBe('good');
    expect(changeTone('flat', true)).toBe('neutral');
  });
});

describe('table sortRows', () => {
  const rows = [
    { product: 'Lamp', revenue: 10 },
    { product: 'Bowl', revenue: 30 },
    { product: 'Cushion', revenue: null },
  ];
  it('sorts numbers and text, keeping nulls last', () => {
    expect(sortRows(rows, { key: 'revenue', dir: 'desc' }).map((r) => r.product)).toEqual([
      'Bowl',
      'Lamp',
      'Cushion',
    ]);
    expect(sortRows(rows, { key: 'product', dir: 'asc' }).map((r) => r.product)).toEqual([
      'Bowl',
      'Cushion',
      'Lamp',
    ]);
    expect(sortRows(rows, null)).toBe(rows);
  });
});
