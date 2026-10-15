import { describe, expect, it } from 'vitest';
import { DEFAULT_DASHBOARD } from './defaultDashboard';
import {
  describeStep,
  diffSnapshots,
  formatIstDateTime,
  formatIstTime,
  istDate,
  snapshotsEqual,
  stableStringify,
  summariseChanges,
  versionSummary,
  type WidgetSnapshot,
} from './history';

const base: WidgetSnapshot[] = DEFAULT_DASHBOARD.widgets.map((w, i) => ({
  id: `w${i}`,
  config: w.config,
  layout: w.layout,
}));
const title = (id: string) => base.find((w) => w.id === id)!.config.title;
const clone = () => structuredClone(base);

/** Re-stacks a column of full-width widgets in the given order (simulates vertical compaction). */
function stack(widgets: WidgetSnapshot[]): WidgetSnapshot[] {
  let y = 0;
  return widgets.map((w) => {
    const placed = { ...w, layout: { x: 0, y, w: 12, h: 3 } };
    y += 3;
    return placed;
  });
}

describe('diffSnapshots', () => {
  it('reports nothing for identical snapshots', () => {
    expect(diffSnapshots(base, clone())).toEqual([]);
  });

  it('reports added, removed and edited widgets', () => {
    const after = clone().filter((w) => w.id !== 'w3');
    after[0]!.config = { ...after[0]!.config, title: 'Sales' };
    after.push({ id: 'new', config: base[5]!.config, layout: { x: 0, y: 99, w: 4, h: 3 } });
    expect(diffSnapshots(base, after)).toEqual([
      { op: 'added', widgetId: 'new', title: base[5]!.config.title },
      { op: 'removed', widgetId: 'w3', title: title('w3') },
      { op: 'edited', widgetId: 'w0', title: 'Sales' },
    ]);
  });

  it('reports only the dragged widget when one moves to the bottom', () => {
    const column = stack(clone().slice(0, 5));
    const [first, ...rest] = column;
    const after = stack([...rest, first!]);
    expect(diffSnapshots(column, after)).toEqual([{ op: 'moved', widgetId: 'w0', title: title('w0') }]);
  });

  it('does not report widgets that only reflowed after a removal', () => {
    const column = stack(clone().slice(0, 5));
    const after = stack(column.filter((w) => w.id !== 'w1'));
    expect(diffSnapshots(column, after)).toEqual([{ op: 'removed', widgetId: 'w1', title: title('w1') }]);
  });

  it('reports a column change as a move and a size change as a resize', () => {
    const after = clone();
    after[0]!.layout = { ...after[0]!.layout, x: after[0]!.layout.x + 1 };
    after[1]!.layout = { ...after[1]!.layout, h: after[1]!.layout.h + 2 };
    expect(diffSnapshots(base, after).map((c) => `${c.op}:${c.widgetId}`)).toEqual([
      'moved:w0',
      'resized:w1',
    ]);
  });

  it('ignores key order inside configs', () => {
    const after = clone();
    const c = after[0]!.config as unknown as Record<string, unknown>;
    after[0]!.config = Object.fromEntries(Object.entries(c).reverse()) as unknown as WidgetSnapshot['config'];
    expect(diffSnapshots(base, after)).toEqual([]);
  });
});

describe('snapshotsEqual', () => {
  it('ignores array order but not content', () => {
    expect(snapshotsEqual(base, [...clone()].reverse())).toBe(true);
    const moved = clone();
    moved[2]!.layout.y += 1;
    expect(snapshotsEqual(base, moved)).toBe(false);
    expect(snapshotsEqual(base, clone().slice(1))).toBe(false);
  });

  it('stableStringify sorts keys and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
  });
});

describe('summaries', () => {
  it('groups and pluralises', () => {
    const changes = [
      { op: 'moved', widgetId: 'a', title: 'A' },
      { op: 'removed', widgetId: 'b', title: 'Revenue by City' },
      { op: 'moved', widgetId: 'c', title: 'C' },
      { op: 'moved', widgetId: 'd', title: 'D' },
    ] as const;
    expect(summariseChanges([...changes])).toBe('Removed Revenue by City · Moved 3 widgets');
    expect(summariseChanges([])).toBe('No changes');
  });

  it('uses fixed wording for created, reset and restored', () => {
    expect(versionSummary('created', [])).toBe('Created from default template');
    expect(versionSummary('created', [], { historyStart: true })).toBe('History started');
    expect(versionSummary('reset', [])).toBe('Reset to default');
    expect(versionSummary('restored', [], { restoredFrom: '2026-10-12T11:02:00Z' })).toBe(
      'Restored version from 12 Oct, 4:32 PM',
    );
    expect(versionSummary('added', [{ op: 'added', widgetId: 'x', title: 'X' }])).toBe('Added X');
    expect(versionSummary('ai_added', [{ op: 'added', widgetId: 'x', title: 'Revenue by City' }])).toBe(
      'Added by Insight AI · Revenue by City',
    );
  });

  it('labels undo steps', () => {
    const column = stack(clone().slice(0, 3));
    const [first, ...rest] = column;
    expect(describeStep(column, stack([...rest, first!]))).toBe(`move ${title('w0')}`);
    expect(describeStep(column, column.slice(0, 2))).toBe(`remove ${title('w2')}`);
    expect(describeStep(column, column)).toBe('change');
  });
});

describe('IST formatting', () => {
  it('formats in Asia/Kolkata', () => {
    expect(formatIstTime('2026-10-12T11:02:00Z')).toBe('4:32 PM');
    expect(formatIstTime('2026-10-12T18:45:00Z')).toBe('12:15 AM');
    expect(istDate('2026-10-12T18:45:00Z')).toBe('2026-10-13');
    expect(formatIstDateTime('2026-10-12T06:30:00Z', { year: true })).toBe('12 Oct 2026, 12:00 PM');
  });
});
