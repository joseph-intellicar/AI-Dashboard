/** Pure helpers for the version history panel and the version preview (REQUIREMENTS §6.9). */
import {
  addDays,
  diffSnapshots,
  istDate,
  todayIst,
  type VersionChange,
  type VersionKind,
  type WidgetSnapshot,
} from '@insightflow/shared';

export interface VersionSummary {
  id: string;
  kind: VersionKind;
  summary: string;
  changes: VersionChange[];
  createdAt: string;
}

export interface VersionDetail extends VersionSummary {
  widgets: WidgetSnapshot[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday" or "12 Oct 2026" for an IST calendar date. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** Versions (newest first) grouped by IST day, keeping the order. */
export function groupByDay(
  versions: VersionSummary[],
  now: Date = new Date(),
): { label: string; versions: VersionSummary[] }[] {
  const today = todayIst(now);
  const groups: { date: string; label: string; versions: VersionSummary[] }[] = [];
  for (const v of versions) {
    const date = istDate(v.createdAt);
    const last = groups[groups.length - 1];
    if (last?.date === date) last.versions.push(v);
    else groups.push({ date, label: dayLabel(date, today), versions: [v] });
  }
  return groups.map(({ label, versions: vs }) => ({ label, versions: vs }));
}

/** Keeps the first `max` phrases of a summary: "Moved 3 widgets · Removed X +2 more". */
export function shortenSummary(summary: string, max = 2): { text: string; more: number } {
  const phrases = summary.split(' · ');
  return { text: phrases.slice(0, max).join(' · '), more: Math.max(0, phrases.length - max) };
}

export type VersionBadge = 'Added' | 'Edited' | 'Moved';

/**
 * How a version differs from the current dashboard: a badge per widget of the version, and the titles
 * of current widgets that the version doesn't have.
 */
export function compareToCurrent(
  current: WidgetSnapshot[],
  version: WidgetSnapshot[],
): { badges: Map<string, VersionBadge>; notInVersion: string[] } {
  const badges = new Map<string, VersionBadge>();
  const notInVersion: string[] = [];
  const rank: Record<VersionBadge, number> = { Added: 3, Edited: 2, Moved: 1 };
  const set = (id: string, badge: VersionBadge) => {
    const existing = badges.get(id);
    if (!existing || rank[badge] > rank[existing]) badges.set(id, badge);
  };
  for (const c of diffSnapshots(current, version)) {
    if (c.op === 'added') set(c.widgetId, 'Added');
    else if (c.op === 'edited') set(c.widgetId, 'Edited');
    else if (c.op === 'moved' || c.op === 'resized') set(c.widgetId, 'Moved');
    else notInVersion.push(c.title);
  }
  return { badges, notInVersion };
}
