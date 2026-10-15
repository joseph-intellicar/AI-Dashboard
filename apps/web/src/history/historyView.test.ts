import { DEFAULT_DASHBOARD, type WidgetSnapshot } from '@insightflow/shared';
import { describe, expect, it } from 'vitest';
import { compareToCurrent, dayLabel, groupByDay, shortenSummary, type VersionSummary } from './historyView';

const v = (id: string, createdAt: string): VersionSummary => ({
  id,
  kind: 'edit_session',
  summary: 'x',
  changes: [],
  createdAt,
});

describe('groupByDay', () => {
  it('groups by IST day with Today / Yesterday / date labels', () => {
    const now = new Date('2026-10-15T12:00:00Z'); // 5:30 PM IST
    const groups = groupByDay(
      [
        v('a', '2026-10-15T10:00:00Z'),
        v('b', '2026-10-14T19:00:00Z'), // 15 Oct, 12:30 AM IST → Today
        v('c', '2026-10-14T10:00:00Z'),
        v('d', '2026-10-12T10:00:00Z'),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.versions.map((x) => x.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['12 Oct 2026', ['d']],
    ]);
  });

  it('labels days', () => {
    expect(dayLabel('2026-09-01', '2026-10-15')).toBe('1 Sep 2026');
  });
});

describe('shortenSummary', () => {
  it('keeps two phrases and counts the rest', () => {
    expect(shortenSummary('Added A · Removed B · Moved 3 widgets · Resized C')).toEqual({
      text: 'Added A · Removed B',
      more: 2,
    });
    expect(shortenSummary('Reset to default')).toEqual({ text: 'Reset to default', more: 0 });
  });
});

describe('compareToCurrent', () => {
  const current: WidgetSnapshot[] = DEFAULT_DASHBOARD.widgets.slice(0, 4).map((w, i) => ({
    id: `w${i}`,
    config: w.config,
    layout: w.layout,
  }));

  it('badges added, edited and moved widgets and lists the missing ones', () => {
    const version = structuredClone(current).filter((w) => w.id !== 'w3');
    version[0]!.config.title = 'Old title';
    version[0]!.layout.x += 1; // edited wins over moved
    version[1]!.layout.h += 1;
    version.push({ id: 'gone', config: current[2]!.config, layout: { x: 0, y: 50, w: 4, h: 3 } });
    const { badges, notInVersion } = compareToCurrent(current, version);
    expect(Object.fromEntries(badges)).toEqual({ gone: 'Added', w0: 'Edited', w1: 'Moved' });
    expect(notInVersion).toEqual([current[3]!.config.title]);
  });
});
