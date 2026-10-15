import { emptyConfig } from '@insightflow/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stackedLayout } from './DashboardGrid';
import {
  applyLayout,
  changedItems,
  insertAtTop,
  insertBelow,
  useDebouncedLayoutSave,
  type Dashboard,
  type Widget,
} from './useDashboard';

const w = (id: string, x: number, y: number, wd = 2, h = 2): Widget => ({
  id,
  layout: { x, y, w: wd, h },
  config: emptyConfig('kpi'),
  updatedAt: '',
});
const dash = (...widgets: Widget[]): Dashboard => ({ dateFilter: { preset: 'last_30_days' }, widgets });

describe('optimistic dashboard helpers', () => {
  it('inserts at the top and pushes others down by its height', () => {
    const d = insertAtTop(dash(w('a', 0, 0), w('b', 2, 3)), w('new', 0, 0, 4, 4));
    expect(d.widgets.map((x) => [x.id, x.layout.y])).toEqual([
      ['new', 0],
      ['a', 4],
      ['b', 7],
    ]);
  });

  it('inserts a duplicate directly below the original', () => {
    const d = insertBelow(dash(w('a', 4, 2, 4, 4), w('b', 0, 6), w('c', 0, 0)), 'a', w('copy', 0, 0));
    const byId = Object.fromEntries(d.widgets.map((x) => [x.id, x.layout]));
    expect(byId.copy).toEqual({ x: 4, y: 6, w: 4, h: 4 });
    expect(byId.b!.y).toBe(10);
    expect(byId.c!.y).toBe(0);
  });

  it('applies layouts and reports only changed items', () => {
    const d = dash(w('a', 0, 0), w('b', 2, 0));
    const items = [
      { id: 'a', x: 0, y: 0, w: 2, h: 2 },
      { id: 'b', x: 4, y: 0, w: 2, h: 2 },
    ];
    expect(changedItems(d, items).map((i) => i.id)).toEqual(['b']);
    expect(applyLayout(d, items).widgets[1]!.layout.x).toBe(4);
  });

  it('stacks widgets in saved order for phones', () => {
    const layout = stackedLayout([w('right', 6, 0), w('below', 0, 4, 12, 4), w('left', 0, 0)]);
    expect(layout.map((l) => [l.i, l.y, l.w])).toEqual([
      ['left', 0, 1],
      ['right', 2, 1],
      ['below', 4, 1],
    ]);
  });
});

describe('useDebouncedLayoutSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses several drags into one save of the latest layout', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedLayoutSave(save, 500));
    act(() => {
      result.current.schedule([{ id: 'a', x: 1, y: 0, w: 2, h: 2 }]);
      vi.advanceTimersByTime(200);
      result.current.schedule([{ id: 'a', x: 2, y: 0, w: 2, h: 2 }]);
    });
    expect(result.current.pending).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ id: 'a', x: 2, y: 0, w: 2, h: 2 }]);
    expect(result.current.pending).toBe(false);
  });

  it('flushes immediately when asked (e.g. clicking Done)', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedLayoutSave(save, 500));
    act(() => {
      result.current.schedule([{ id: 'a', x: 1, y: 0, w: 2, h: 2 }]);
      result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
