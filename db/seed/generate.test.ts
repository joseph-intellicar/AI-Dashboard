import { describe, expect, it } from 'vitest';
import { addDays, istToUtc, todayIst } from './dates';
import { festiveIntensity, generateSeedData } from './generate';
import { checksum } from './index';
import { Rng } from './random';

const ANCHOR = '2026-10-15';
const data = generateSeedData({ anchor: ANCHOR });

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('produces values in [0, 1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('dates', () => {
  it('converts IST wall-clock time to UTC', () => {
    expect(istToUtc('2026-10-15', 0, 0).toISOString()).toBe('2026-10-14T18:30:00.000Z');
  });

  it('computes today in IST', () => {
    expect(todayIst(new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15');
  });
});

describe('generateSeedData', () => {
  it('is deterministic for the same anchor date', () => {
    expect(checksum(generateSeedData({ anchor: ANCHOR }))).toBe(checksum(data));
  });

  it('changes with the anchor date', () => {
    expect(checksum(generateSeedData({ anchor: '2026-10-16' }))).not.toBe(checksum(data));
  });

  it('covers 24 months ending at the anchor', () => {
    expect(data.range).toEqual({ from: '2024-10-16', to: ANCHOR });
    const first = Math.min(...data.orders.map((o) => (o.ordered_at as Date).getTime()));
    const last = Math.max(...data.orders.map((o) => (o.ordered_at as Date).getTime()));
    expect(first).toBeGreaterThanOrEqual(istToUtc('2024-10-16', 0, 0).getTime());
    expect(last).toBeLessThan(istToUtc(addDays(ANCHOR, 1), 0, 0).getTime());
  });

  it('produces volumes close to the targets', () => {
    expect(data.products).toHaveLength(60);
    expect(data.orders.length).toBeGreaterThan(7500);
    expect(data.orders.length).toBeLessThan(9500);
    expect(data.customers.length).toBeGreaterThan(4000);
  });

  it('keeps status and dates consistent', () => {
    for (const o of data.orders) {
      const ordered = (o.ordered_at as Date).getTime();
      if (o.status === 'Delivered' || o.status === 'Returned') {
        expect((o.delivered_at as Date).getTime()).toBeGreaterThan(ordered);
      } else {
        expect(o.delivered_at).toBeNull();
      }
      if (o.status === 'Returned') {
        expect((o.returned_at as Date).getTime()).toBeGreaterThan((o.delivered_at as Date).getTime());
        expect(o.return_reason).toBeTruthy();
      } else {
        expect(o.returned_at).toBeNull();
        expect(o.return_reason).toBeNull();
      }
    }
  });

  it('never discounts more than the line value', () => {
    for (const i of data.orderItems) {
      expect(i.discount_amount ?? 0).toBeLessThanOrEqual(i.quantity * i.unit_price);
    }
  });

  it('marks exactly one first order per ordering customer, before any later order', () => {
    const seen = new Set<number>();
    for (const o of data.orders) {
      if (o.is_first_order) {
        expect(seen.has(o.customer_id)).toBe(false);
      }
      if (o.status !== 'Cancelled') seen.add(o.customer_id);
    }
  });

  it('only sells products after their launch date', () => {
    const launch = new Map(data.products.map((p) => [p.id, p.launch_date]));
    const orderDate = new Map(data.orders.map((o) => [o.id, todayIst(o.ordered_at as Date)]));
    for (const i of data.orderItems) {
      expect(orderDate.get(i.order_id)! >= launch.get(i.product_id)!).toBe(true);
    }
  });

  it('has orders today and yesterday', () => {
    const days = new Set(data.orders.map((o) => todayIst(o.ordered_at as Date)));
    expect(days.has(ANCHOR)).toBe(true);
    expect(days.has(addDays(ANCHOR, -1))).toBe(true);
  });
});

describe('festiveIntensity', () => {
  it('peaks at the end of October and is zero outside the season', () => {
    expect(festiveIntensity('2025-10-30')).toBe(1);
    expect(festiveIntensity('2025-11-08')).toBeGreaterThan(0);
    expect(festiveIntensity('2025-07-01')).toBe(0);
  });
});
