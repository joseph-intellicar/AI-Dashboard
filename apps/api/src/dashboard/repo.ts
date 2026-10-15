/**
 * Per-user dashboard storage (ARCHITECTURE §4.4). Every statement is scoped by the session user's ID
 * inside the SQL itself, so another user's widget ID simply matches nothing (→ 404).
 * Multi-row changes are single statements (data-modifying CTEs), so each is atomic and costs one round trip.
 */
import type { DB } from '@insightflow/db';
import {
  DEFAULT_DASHBOARD,
  DEFAULT_SIZES,
  type DateFilter,
  type Layout,
  type WidgetConfig,
  type WidgetSnapshot,
} from '@insightflow/shared';
import { sql } from 'kysely';
import { AppError, notFound } from '../errors';
import { getVersion, recordVersion, restorableWidgets } from './history';
import { duplicatePlacement, layoutProblem, type LayoutItem } from './layout';

export interface WidgetDto {
  id: string;
  layout: Layout;
  config: WidgetConfig;
  updatedAt: string;
}

export interface DashboardDto {
  dateFilter: DateFilter;
  widgets: WidgetDto[];
}

interface WidgetRow {
  id: string;
  config: WidgetConfig;
  layout_x: number;
  layout_y: number;
  layout_w: number;
  layout_h: number;
  updated_at: Date | string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const widgetNotFound = () => notFound('Widget not found');

function assertUuid(id: string) {
  if (!UUID.test(id)) throw widgetNotFound();
}

function toDto(row: WidgetRow): WidgetDto {
  return {
    id: row.id,
    layout: { x: row.layout_x, y: row.layout_y, w: row.layout_w, h: row.layout_h },
    config: row.config,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const RETURNING = sql`id, config, layout_x, layout_y, layout_w, layout_h, updated_at`;

function templateValues() {
  return sql.join(
    DEFAULT_DASHBOARD.widgets.map(
      (w) =>
        sql`(${JSON.stringify(w.config)}::jsonb, ${w.layout.x}::int, ${w.layout.y}::int, ${w.layout.w}::int, ${w.layout.h}::int)`,
    ),
  );
}

async function readDashboard(db: DB, userId: string): Promise<DashboardDto | null> {
  const { rows } = await sql<{ date_filter: DateFilter; widgets: WidgetRow[] }>`
    SELECT d.date_filter,
           coalesce(json_agg(json_build_object(
             'id', w.id, 'config', w.config, 'layout_x', w.layout_x, 'layout_y', w.layout_y,
             'layout_w', w.layout_w, 'layout_h', w.layout_h, 'updated_at', w.updated_at)
             ORDER BY w.layout_y, w.layout_x) FILTER (WHERE w.id IS NOT NULL), '[]') AS widgets
    FROM dashboards d
    LEFT JOIN dashboard_widgets w ON w.dashboard_id = d.id
    WHERE d.user_id = ${userId}
    GROUP BY d.id`.execute(db);
  const row = rows[0];
  return row ? { dateFilter: row.date_filter, widgets: row.widgets.map(toDto) } : null;
}

/** Returns the user's dashboard, creating it from the default template on first use. */
export async function getOrCreateDashboard(db: DB, userId: string): Promise<DashboardDto> {
  const existing = await readDashboard(db, userId);
  if (existing) return existing;
  // ON CONFLICT: if two tabs race on first login, only the winner inserts the template widgets.
  await sql`
    WITH ins AS (
      INSERT INTO dashboards (user_id, date_filter)
      VALUES (${userId}, ${JSON.stringify(DEFAULT_DASHBOARD.dateFilter)}::jsonb)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING id)
    INSERT INTO dashboard_widgets (dashboard_id, config, layout_x, layout_y, layout_w, layout_h)
    SELECT ins.id, t.config, t.x, t.y, t.w, t.h
    FROM ins, (VALUES ${templateValues()}) AS t(config, x, y, w, h)`.execute(db);
  const created = await readDashboard(db, userId);
  if (!created) throw new AppError(500, 'INTERNAL', 'Could not create dashboard');
  await recordVersion(db, userId, 'created');
  return created;
}

export async function setDateFilter(db: DB, userId: string, filter: DateFilter): Promise<DateFilter> {
  const update = () =>
    db
      .updateTable('dashboards')
      .set({ date_filter: JSON.stringify(filter), updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .executeTakeFirst();
  if (!(await update()).numUpdatedRows) {
    await getOrCreateDashboard(db, userId);
    await update();
  }
  return filter;
}

/**
 * Inserts a widget at the top (x=0, y=0), pushing every other widget down by its height,
 * or at the bottom (below the lowest widget).
 */
export async function addWidget(
  db: DB,
  userId: string,
  config: WidgetConfig,
  {
    position = 'top',
    size = DEFAULT_SIZES[config.type],
  }: { position?: 'top' | 'bottom'; size?: { w: number; h: number } } = {},
): Promise<WidgetDto> {
  const insert = () =>
    position === 'bottom'
      ? // Insight AI adds below the lowest widget (REQUIREMENTS §17.7).
        sql<WidgetRow>`
    WITH d AS (SELECT id FROM dashboards WHERE user_id = ${userId}),
    bottom AS (
      SELECT coalesce(max(layout_y + layout_h), 0) AS y FROM dashboard_widgets
      WHERE dashboard_id = (SELECT id FROM d))
    INSERT INTO dashboard_widgets (dashboard_id, config, layout_x, layout_y, layout_w, layout_h)
    SELECT d.id, ${JSON.stringify(config)}::jsonb, 0, bottom.y, ${size.w}::int, ${size.h}::int FROM d, bottom
    RETURNING ${RETURNING}`.execute(db)
      : sql<WidgetRow>`
    WITH d AS (SELECT id FROM dashboards WHERE user_id = ${userId}),
    shifted AS (
      UPDATE dashboard_widgets SET layout_y = layout_y + ${size.h}::int, updated_at = now()
      WHERE dashboard_id = (SELECT id FROM d))
    INSERT INTO dashboard_widgets (dashboard_id, config, layout_x, layout_y, layout_w, layout_h)
    SELECT d.id, ${JSON.stringify(config)}::jsonb, 0, 0, ${size.w}::int, ${size.h}::int FROM d
    RETURNING ${RETURNING}`.execute(db);
  let { rows } = await insert();
  if (!rows[0]) {
    // No dashboard yet (widget added before the first GET): create it, then insert.
    await getOrCreateDashboard(db, userId);
    ({ rows } = await insert());
  }
  return toDto(rows[0]!);
}

export async function updateWidgetConfig(db: DB, userId: string, widgetId: string, config: WidgetConfig) {
  assertUuid(widgetId);
  const { rows } = await sql<WidgetRow>`
    UPDATE dashboard_widgets w SET config = ${JSON.stringify(config)}::jsonb, updated_at = now()
    FROM dashboards d
    WHERE d.id = w.dashboard_id AND d.user_id = ${userId} AND w.id = ${widgetId}::uuid
    RETURNING w.id, w.config, w.layout_x, w.layout_y, w.layout_w, w.layout_h, w.updated_at`.execute(db);
  if (!rows[0]) throw widgetNotFound();
  return toDto(rows[0]);
}

export async function deleteWidget(db: DB, userId: string, widgetId: string): Promise<void> {
  assertUuid(widgetId);
  const result = await sql`
    DELETE FROM dashboard_widgets w USING dashboards d
    WHERE d.id = w.dashboard_id AND d.user_id = ${userId} AND w.id = ${widgetId}::uuid`.execute(db);
  if (!result.numAffectedRows) throw widgetNotFound();
}

/** Copies a widget directly below the original; widgets further down move down to make room. */
export async function duplicateWidget(db: DB, userId: string, widgetId: string): Promise<WidgetDto> {
  assertUuid(widgetId);
  const original = await db
    .selectFrom('dashboard_widgets as w')
    .innerJoin('dashboards as d', 'd.id', 'w.dashboard_id')
    .select(['w.config', 'w.layout_x', 'w.layout_y', 'w.layout_w', 'w.layout_h', 'w.dashboard_id'])
    .where('d.user_id', '=', userId)
    .where('w.id', '=', widgetId)
    .executeTakeFirst();
  if (!original) throw widgetNotFound();

  const place = duplicatePlacement({
    x: original.layout_x,
    y: original.layout_y,
    w: original.layout_w,
    h: original.layout_h,
  });
  const { rows } = await sql<WidgetRow>`
    WITH shifted AS (
      UPDATE dashboard_widgets SET layout_y = layout_y + ${place.h}::int, updated_at = now()
      WHERE dashboard_id = ${original.dashboard_id}::uuid AND layout_y >= ${place.y}::int)
    INSERT INTO dashboard_widgets (dashboard_id, config, layout_x, layout_y, layout_w, layout_h)
    VALUES (${original.dashboard_id}::uuid, ${JSON.stringify(original.config)}::jsonb,
            ${place.x}::int, ${place.y}::int, ${place.w}::int, ${place.h}::int)
    RETURNING ${RETURNING}`.execute(db);
  return toDto(rows[0]!);
}

/** Saves widget positions. All-or-nothing: any ID that isn't this user's widget rejects the whole save. */
export async function saveLayout(db: DB, userId: string, items: LayoutItem[]): Promise<void> {
  if (items.length === 0) return;
  for (const item of items) assertUuid(item.id);

  const owned = await db
    .selectFrom('dashboard_widgets as w')
    .innerJoin('dashboards as d', 'd.id', 'w.dashboard_id')
    .select(['w.id', 'w.config'])
    .where('d.user_id', '=', userId)
    .execute();
  const typeById = new Map(owned.map((w) => [w.id, (w.config as WidgetConfig).type]));
  if (items.some((i) => !typeById.has(i.id))) throw widgetNotFound();
  const problem = layoutProblem(items, (id) => typeById.get(id));
  if (problem) throw new AppError(400, 'INVALID_LAYOUT', problem);

  const values = sql.join(
    items.map((i) => sql`(${i.id}::uuid, ${i.x}::int, ${i.y}::int, ${i.w}::int, ${i.h}::int)`),
  );
  await sql`
    UPDATE dashboard_widgets w
    SET layout_x = v.x, layout_y = v.y, layout_w = v.w, layout_h = v.h, updated_at = now()
    FROM (VALUES ${values}) AS v(id, x, y, w, h), dashboards d
    WHERE w.id = v.id AND d.id = w.dashboard_id AND d.user_id = ${userId}`.execute(db);
}

/** Replaces this user's widgets and date filter with the default template (one atomic statement). */
export async function resetDashboard(db: DB, userId: string): Promise<DashboardDto> {
  await sql`
    WITH d AS (SELECT id FROM dashboards WHERE user_id = ${userId}),
    removed AS (DELETE FROM dashboard_widgets WHERE dashboard_id = (SELECT id FROM d)),
    filter AS (
      UPDATE dashboards SET date_filter = ${JSON.stringify(DEFAULT_DASHBOARD.dateFilter)}::jsonb, updated_at = now()
      WHERE id = (SELECT id FROM d))
    INSERT INTO dashboard_widgets (dashboard_id, config, layout_x, layout_y, layout_w, layout_h)
    SELECT d.id, t.config, t.x, t.y, t.w, t.h FROM d, (VALUES ${templateValues()}) AS t(config, x, y, w, h)`.execute(
    db,
  );
  // If the user had no dashboard yet, this creates the default one.
  return getOrCreateDashboard(db, userId);
}

/**
 * Replaces all of this user's widgets with `widgets` (settings + layout), keeping their IDs, in one
 * statement: widgets not in the list are deleted, the rest are upserted. Used by undo/redo and restore.
 * If any ID belongs to another dashboard nothing is changed and the call returns 404.
 */
export async function replaceWidgets(
  db: DB,
  userId: string,
  widgets: WidgetSnapshot[],
): Promise<DashboardDto> {
  for (const w of widgets) assertUuid(w.id);
  const problem = layoutProblem(
    widgets.map((w) => ({ id: w.id, ...w.layout })),
    (id) => widgets.find((w) => w.id === id)?.config.type,
  );
  if (problem) throw new AppError(400, 'INVALID_LAYOUT', problem);

  const payload = JSON.stringify(
    widgets.map((w) => ({
      id: w.id,
      config: w.config,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
    })),
  );
  const { rows } = await sql<{ ok: boolean; date_filter: DateFilter | null; widgets: WidgetRow[] }>`
    WITH d AS (SELECT id, date_filter FROM dashboards WHERE user_id = ${userId}),
    v AS (
      SELECT * FROM jsonb_to_recordset(${payload}::jsonb)
        AS t(id uuid, config jsonb, x int, y int, w int, h int)),
    guard AS (
      SELECT EXISTS (SELECT 1 FROM d)
         AND NOT EXISTS (
           SELECT 1 FROM dashboard_widgets dw
           WHERE dw.id IN (SELECT id FROM v) AND dw.dashboard_id <> (SELECT id FROM d)) AS ok),
    removed AS (
      DELETE FROM dashboard_widgets
      WHERE dashboard_id = (SELECT id FROM d) AND (SELECT ok FROM guard)
        AND id NOT IN (SELECT id FROM v)),
    upserted AS (
      INSERT INTO dashboard_widgets (id, dashboard_id, config, layout_x, layout_y, layout_w, layout_h)
      SELECT v.id, d.id, v.config, v.x, v.y, v.w, v.h FROM v, d WHERE (SELECT ok FROM guard)
      ON CONFLICT (id) DO UPDATE SET
        config = excluded.config, layout_x = excluded.layout_x, layout_y = excluded.layout_y,
        layout_w = excluded.layout_w, layout_h = excluded.layout_h, updated_at = now()
      WHERE dashboard_widgets.dashboard_id = excluded.dashboard_id
      RETURNING ${RETURNING})
    SELECT (SELECT ok FROM guard) AS ok, (SELECT date_filter FROM d) AS date_filter,
           coalesce((SELECT json_agg(u ORDER BY u.layout_y, u.layout_x) FROM upserted u), '[]') AS widgets`.execute(
    db,
  );
  const row = rows[0];
  if (!row?.ok || !row.date_filter) throw widgetNotFound();
  return { dateFilter: row.date_filter, widgets: row.widgets.map(toDto) };
}

/** Brings back an earlier version (date filter untouched) and records the restore as a new version. */
export async function restoreVersion(
  db: DB,
  userId: string,
  versionId: string,
): Promise<{ dashboard: DashboardDto; skipped: number }> {
  const version = await getVersion(db, userId, versionId);
  // The current dashboard is normally already the latest version; this makes sure it is before replacing it.
  await recordVersion(db, userId, 'edit_session');
  const { widgets, skipped } = restorableWidgets(version.widgets);
  const dashboard = await replaceWidgets(db, userId, widgets);
  await recordVersion(db, userId, 'restored', { restoredFrom: version.createdAt });
  return { dashboard, skipped };
}
