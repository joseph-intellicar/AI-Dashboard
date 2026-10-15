/**
 * Version history (REQUIREMENTS §6.9). A version is a full snapshot of the user's widgets after a change;
 * its summary comes from diffing it against the version before. Every statement is scoped by user ID.
 */
import type { DB } from '@insightflow/db';
import {
  diffSnapshots,
  HISTORY_DAYS,
  MIN_SIZES,
  snapshotsEqual,
  versionSummary,
  WidgetConfigSchema,
  type VersionChange,
  type VersionKind,
  type WidgetSnapshot,
} from '@insightflow/shared';
import { sql } from 'kysely';
import { notFound } from '../errors';
import { GRID_COLUMNS } from './layout';

export interface VersionDto {
  id: string;
  kind: VersionKind;
  summary: string;
  changes: VersionChange[];
  createdAt: string;
}

export interface VersionDetailDto extends VersionDto {
  widgets: WidgetSnapshot[];
}

interface VersionRow {
  id: string;
  kind: VersionKind;
  summary: string;
  changes: VersionChange[];
  created_at: Date | string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionNotFound = () => notFound('Version not found');

const toDto = (row: VersionRow): VersionDto => ({
  id: row.id,
  kind: row.kind,
  summary: row.summary,
  changes: row.changes,
  createdAt: new Date(row.created_at).toISOString(),
});

/** The widgets of a dashboard as a snapshot (SQL fragment; `d` is the dashboards row). */
export const SNAPSHOT_SQL = sql`coalesce((
  SELECT json_agg(json_build_object(
    'id', w.id, 'config', w.config,
    'layout', json_build_object('x', w.layout_x, 'y', w.layout_y, 'w', w.layout_w, 'h', w.layout_h))
    ORDER BY w.layout_y, w.layout_x)
  FROM dashboard_widgets w WHERE w.dashboard_id = d.id), '[]')`;

export interface VersionPlan {
  kind: VersionKind;
  summary: string;
  changes: VersionChange[];
}

/**
 * Decides what to record (pure): nothing when the dashboard equals the latest version; the starting
 * point when there is no version yet; otherwise the requested kind with its diff.
 */
export function planVersion(
  kind: VersionKind,
  current: WidgetSnapshot[],
  latest: WidgetSnapshot[] | null,
  opts: { restoredFrom?: string } = {},
): VersionPlan | null {
  if (latest === null) {
    return {
      kind: 'created',
      summary: versionSummary('created', [], { historyStart: kind !== 'created' }),
      changes: [],
    };
  }
  if (snapshotsEqual(current, latest)) return null;
  const changes = diffSnapshots(latest, current);
  return { kind, changes, summary: versionSummary(kind, changes, opts) };
}

/**
 * Records a version of the user's current dashboard if it changed since the latest version.
 * Two round trips: read (current widgets + latest version), then insert + 30-day purge in one statement.
 * The insert only happens if the latest version is still the one we compared against.
 */
export async function recordVersion(
  db: DB,
  userId: string,
  kind: VersionKind,
  opts: { restoredFrom?: string } = {},
): Promise<VersionDto | null> {
  const { rows } = await sql<{
    dashboard_id: string;
    widgets: WidgetSnapshot[];
    latest_id: string | null;
    latest_widgets: WidgetSnapshot[] | null;
  }>`
    SELECT d.id AS dashboard_id, ${SNAPSHOT_SQL} AS widgets, v.id AS latest_id, v.widgets AS latest_widgets
    FROM dashboards d
    LEFT JOIN LATERAL (
      SELECT id, widgets FROM dashboard_versions WHERE dashboard_id = d.id ORDER BY created_at DESC LIMIT 1
    ) v ON true
    WHERE d.user_id = ${userId}`.execute(db);
  const row = rows[0];
  if (!row) return null;

  const plan = planVersion(kind, row.widgets, row.latest_widgets, opts);
  if (!plan) return null;

  const inserted = await sql<VersionRow>`
    WITH latest AS (
      SELECT id FROM dashboard_versions WHERE dashboard_id = ${row.dashboard_id}::uuid
      ORDER BY created_at DESC LIMIT 1),
    ins AS (
      INSERT INTO dashboard_versions (dashboard_id, kind, summary, changes, widgets)
      SELECT ${row.dashboard_id}::uuid, ${plan.kind}, ${plan.summary},
             ${JSON.stringify(plan.changes)}::jsonb, ${JSON.stringify(row.widgets)}::jsonb
      WHERE (SELECT id FROM latest) IS NOT DISTINCT FROM ${row.latest_id}::uuid
      RETURNING id, kind, summary, changes, created_at),
    purge AS (
      DELETE FROM dashboard_versions
      WHERE dashboard_id = ${row.dashboard_id}::uuid
        AND created_at < now() - make_interval(days => ${HISTORY_DAYS})
        AND EXISTS (SELECT 1 FROM ins))
    SELECT * FROM ins`.execute(db);
  return inserted.rows[0] ? toDto(inserted.rows[0]) : null;
}

/** Last 30 days, newest first. The newest version is always included, however old it is. */
export async function listVersions(db: DB, userId: string): Promise<VersionDto[]> {
  const { rows } = await sql<VersionRow>`
    SELECT v.id, v.kind, v.summary, v.changes, v.created_at
    FROM dashboard_versions v
    JOIN dashboards d ON d.id = v.dashboard_id
    WHERE d.user_id = ${userId}
      AND (v.created_at >= now() - make_interval(days => ${HISTORY_DAYS})
           OR v.id = (SELECT id FROM dashboard_versions WHERE dashboard_id = d.id ORDER BY created_at DESC LIMIT 1))
    ORDER BY v.created_at DESC
    LIMIT 500`.execute(db);
  return rows.map(toDto);
}

export async function getVersion(db: DB, userId: string, versionId: string): Promise<VersionDetailDto> {
  if (!UUID.test(versionId)) throw versionNotFound();
  const { rows } = await sql<VersionRow & { widgets: WidgetSnapshot[] }>`
    SELECT v.id, v.kind, v.summary, v.changes, v.created_at, v.widgets
    FROM dashboard_versions v
    JOIN dashboards d ON d.id = v.dashboard_id
    WHERE d.user_id = ${userId} AND v.id = ${versionId}::uuid`.execute(db);
  const row = rows[0];
  if (!row) throw versionNotFound();
  return { ...toDto(row), widgets: row.widgets };
}

/**
 * Widgets of an old snapshot that are still valid today (pure). Configs are re-validated against the
 * current schema and catalog; layouts are clamped to the grid and the type's minimum size.
 */
export function restorableWidgets(widgets: WidgetSnapshot[]): { widgets: WidgetSnapshot[]; skipped: number } {
  const valid: WidgetSnapshot[] = [];
  for (const w of widgets) {
    const parsed = WidgetConfigSchema.safeParse(w.config);
    if (!parsed.success || !UUID.test(w.id)) continue;
    const min = MIN_SIZES[parsed.data.type];
    const width = Math.min(GRID_COLUMNS, Math.max(min.w, w.layout.w));
    valid.push({
      id: w.id,
      config: parsed.data,
      layout: {
        x: Math.max(0, Math.min(w.layout.x, GRID_COLUMNS - width)),
        y: Math.max(0, w.layout.y),
        w: width,
        h: Math.max(min.h, w.layout.h),
      },
    });
  }
  return { widgets: valid, skipped: widgets.length - valid.length };
}
