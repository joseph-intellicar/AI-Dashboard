import { DEFAULT_DASHBOARD, type WidgetSnapshot } from '@insightflow/shared';
import { describe, expect, it } from 'vitest';
import { dummyDb } from '../testing';
import { getVersion, planVersion, restorableWidgets } from './history';
import { replaceWidgets } from './repo';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot: WidgetSnapshot[] = DEFAULT_DASHBOARD.widgets.map((w, i) => ({
  id: id(i),
  config: w.config,
  layout: w.layout,
}));

describe('planVersion', () => {
  it('records the starting point when there is no version yet', () => {
    expect(planVersion('created', snapshot, null)).toMatchObject({
      kind: 'created',
      summary: 'Created from default template',
    });
    expect(planVersion('edit_session', snapshot, null)).toMatchObject({
      kind: 'created',
      summary: 'History started',
    });
  });

  it('skips when nothing changed', () => {
    expect(planVersion('edit_session', snapshot, structuredClone(snapshot).reverse())).toBeNull();
  });

  it('records the diff and summary otherwise', () => {
    const plan = planVersion('removed', snapshot.slice(1), snapshot);
    expect(plan).toEqual({
      kind: 'removed',
      summary: `Removed ${snapshot[0]!.config.title}`,
      changes: [{ op: 'removed', widgetId: id(0), title: snapshot[0]!.config.title }],
    });
    expect(
      planVersion('restored', snapshot.slice(1), snapshot, { restoredFrom: '2026-10-12T11:02:00Z' })?.summary,
    ).toBe('Restored version from 12 Oct, 4:32 PM');
  });
});

describe('restorableWidgets', () => {
  it('skips widgets whose config no longer validates and clamps layouts', () => {
    const old = structuredClone(snapshot.slice(0, 3));
    (old[1]!.config.fields.measures[0] as { key: string }).key = 'retired_measure';
    old[2]!.layout = { x: 11, y: 0, w: 1, h: 1 };
    const { widgets, skipped } = restorableWidgets(old);
    expect(skipped).toBe(1);
    expect(widgets.map((w) => w.id)).toEqual([id(0), id(2)]);
    const kpiMin = { w: 2, h: 2 };
    expect(widgets[1]!.layout).toEqual({ x: 10, y: 0, ...kpiMin });
  });
});

describe('ownership guards', () => {
  it('returns 404 for a malformed version ID without querying', async () => {
    await expect(getVersion(dummyDb(), id(1), 'not-a-uuid')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a replace with an invalid layout or a bad ID', async () => {
    const overlapPastGrid = [{ ...snapshot[0]!, layout: { x: 10, y: 0, w: 4, h: 2 } }];
    await expect(replaceWidgets(dummyDb(), id(1), overlapPastGrid)).rejects.toMatchObject({ status: 400 });
    const dup = [snapshot[0]!, snapshot[0]!];
    await expect(replaceWidgets(dummyDb(), id(1), dup)).rejects.toMatchObject({ status: 400 });
    await expect(replaceWidgets(dummyDb(), id(1), [{ ...snapshot[0]!, id: 'x' }])).rejects.toMatchObject({
      status: 404,
    });
    // The dummy database returns no row → treated as "not your dashboard".
    await expect(replaceWidgets(dummyDb(), id(1), snapshot)).rejects.toMatchObject({ status: 404 });
  });
});
