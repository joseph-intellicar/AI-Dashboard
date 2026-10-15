/**
 * Dashboard history (REQUIREMENTS §6.8–6.9): snapshots, the diff between two snapshots and the
 * human-readable summaries. Used by the API (version summaries) and the web app (undo labels, badges).
 */
import type { Layout } from './defaultDashboard';
import type { WidgetConfig } from './widgetConfig';

export interface WidgetSnapshot {
  id: string;
  config: WidgetConfig;
  layout: Layout;
}

export const VERSION_KINDS = [
  'created',
  'edit_session',
  'added',
  'edited',
  'duplicated',
  'removed',
  'reset',
  'restored',
  'ai_added',
] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

export const VERSION_KIND_LABELS: Record<VersionKind, string> = {
  created: 'Created',
  edit_session: 'Edit session',
  added: 'Added',
  edited: 'Edited',
  duplicated: 'Duplicated',
  removed: 'Removed',
  reset: 'Reset',
  restored: 'Restored',
  ai_added: 'Insight AI',
};

export type ChangeOp = 'added' | 'removed' | 'edited' | 'moved' | 'resized';

export interface VersionChange {
  op: ChangeOp;
  widgetId: string;
  title: string;
}

/** Versions older than this are deleted (the newest version is always kept). */
export const HISTORY_DAYS = 30;

/** JSON with object keys sorted, so configs compare equal however the database ordered their keys. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const canonical = (widgets: WidgetSnapshot[]) =>
  stableStringify(
    [...widgets]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((w) => ({ id: w.id, config: w.config, layout: w.layout })),
  );

/** True when both snapshots have the same widgets, settings and positions (array order ignored). */
export function snapshotsEqual(a: WidgetSnapshot[], b: WidgetSnapshot[]): boolean {
  return a.length === b.length && canonical(a) === canonical(b);
}

const readingOrder = (widgets: WidgetSnapshot[]) =>
  [...widgets]
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x || (a.id < b.id ? -1 : 1))
    .map((w) => w.id);

/** IDs on a longest common subsequence of two orderings (the widgets that kept their relative order). */
function lcsIds(a: string[], b: string[]): Set<string> {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const keep = new Set<string>();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      keep.add(a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return keep;
}

/**
 * What changed from `before` to `after`. "Moved" means the user moved it: widgets that only reflowed
 * (pushed up or down while keeping their order and column) are not reported.
 */
export function diffSnapshots(before: WidgetSnapshot[], after: WidgetSnapshot[]): VersionChange[] {
  const prev = new Map(before.map((w) => [w.id, w]));
  const next = new Map(after.map((w) => [w.id, w]));
  const change = (op: ChangeOp, w: WidgetSnapshot): VersionChange => ({
    op,
    widgetId: w.id,
    title: w.config.title,
  });

  const added = after.filter((w) => !prev.has(w.id)).map((w) => change('added', w));
  const removed = before.filter((w) => !next.has(w.id)).map((w) => change('removed', w));

  const common = after.filter((w) => prev.has(w.id));
  const commonIds = new Set(common.map((w) => w.id));
  const inOrder = lcsIds(readingOrder(before.filter((w) => commonIds.has(w.id))), readingOrder(common));

  const edited: VersionChange[] = [];
  const moved: VersionChange[] = [];
  const resized: VersionChange[] = [];
  for (const w of [...common].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)) {
    const old = prev.get(w.id)!;
    if (stableStringify(old.config) !== stableStringify(w.config)) edited.push(change('edited', w));
    if (!inOrder.has(w.id) || old.layout.x !== w.layout.x) moved.push(change('moved', w));
    if (old.layout.w !== w.layout.w || old.layout.h !== w.layout.h) resized.push(change('resized', w));
  }
  return [...added, ...removed, ...edited, ...moved, ...resized];
}

const OP_ORDER: ChangeOp[] = ['added', 'removed', 'edited', 'moved', 'resized'];
const VERBS: Record<ChangeOp, string> = {
  added: 'Added',
  removed: 'Removed',
  edited: 'Edited',
  moved: 'Moved',
  resized: 'Resized',
};

/** One phrase per kind of change: "Removed Revenue by City", "Moved 3 widgets". */
export function changePhrases(changes: VersionChange[]): string[] {
  return OP_ORDER.flatMap((op) => {
    const items = changes.filter((c) => c.op === op);
    if (items.length === 0) return [];
    return [`${VERBS[op]} ${items.length === 1 ? items[0]!.title : `${items.length} widgets`}`];
  });
}

/** "Moved 3 widgets · Removed Revenue by City". */
export function summariseChanges(changes: VersionChange[]): string {
  const phrases = changePhrases(changes);
  return phrases.length ? phrases.join(' · ') : 'No changes';
}

/** The summary stored with a version. */
export function versionSummary(
  kind: VersionKind,
  changes: VersionChange[],
  opts: { restoredFrom?: string; historyStart?: boolean } = {},
): string {
  switch (kind) {
    case 'created':
      return opts.historyStart ? 'History started' : 'Created from default template';
    case 'reset':
      return 'Reset to default';
    case 'ai_added': {
      const added = changes.filter((c) => c.op === 'added');
      return added.length === 1
        ? `Added by Insight AI · ${added[0]!.title}`
        : `Added by Insight AI · ${summariseChanges(changes)}`;
    }
    case 'restored':
      return opts.restoredFrom
        ? `Restored version from ${formatIstDateTime(opts.restoredFrom)}`
        : 'Restored a version';
    default:
      return summariseChanges(changes);
  }
}

/** Label for one undo/redo step, e.g. "move Total Revenue", "remove 2 widgets". */
export function describeStep(before: WidgetSnapshot[], after: WidgetSnapshot[]): string {
  const changes = diffSnapshots(before, after);
  for (const op of ['added', 'removed', 'edited', 'resized', 'moved'] as ChangeOp[]) {
    const items = changes.filter((c) => c.op === op);
    if (items.length === 0) continue;
    const verb = { added: 'add', removed: 'remove', edited: 'edit', resized: 'resize', moved: 'move' }[op];
    return `${verb} ${items.length === 1 ? items[0]!.title : `${items.length} widgets`}`;
  }
  return 'change';
}

// ---------- IST time formatting for history entries

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function istParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const hour = d.getUTCHours();
  return {
    date: d.toISOString().slice(0, 10),
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()]!,
    year: d.getUTCFullYear(),
    time: `${hour % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`,
  };
}

/** "4:32 PM" (IST). */
export const formatIstTime = (iso: string) => istParts(iso).time;

/** "12 Oct, 4:32 PM" (IST); with `year`, "12 Oct 2026, 4:32 PM". */
export function formatIstDateTime(iso: string, { year = false } = {}): string {
  const p = istParts(iso);
  return `${p.day} ${p.month}${year ? ` ${p.year}` : ''}, ${p.time}`;
}

/** The IST calendar date of an instant, 'YYYY-MM-DD'. */
export const istDate = (iso: string) => istParts(iso).date;
