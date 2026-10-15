import type { DB } from '@insightflow/db';
import {
  DateFilterSchema,
  WidgetConfigSchema,
  type VersionKind,
  type WidgetConfig,
  type WidgetSnapshot,
} from '@insightflow/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, userId } from '../auth/requireUser';
import { configError } from '../query/engine';
import * as history from './history';
import { LayoutItemSchema } from './layout';
import * as repo from './repo';

const WidgetBody = z.object({ config: z.unknown() });
const AddBody = z.object({ position: z.enum(['top', 'bottom']).default('top') });
const DashboardPatch = z.object({ dateFilter: DateFilterSchema });
const LayoutBody = z.object({ items: z.array(LayoutItemSchema).max(200) });
const ReplaceBody = z.object({
  widgets: z
    .array(
      z.object({
        id: z.string(),
        config: z.unknown(),
        layout: LayoutItemSchema.omit({ id: true }),
      }),
    )
    .max(200),
});
type IdParams = { Params: { id: string }; Querystring: { record?: string } };
type RecordQuery = { Querystring: { record?: string; source?: string } };

/** Widget changes record a version unless the client is inside an edit session (`?record=false`). */
const shouldRecord = (query: { record?: string }) => query.record !== 'false';

/** Server-side validation of every widget config written to the database. */
function parseConfig(body: unknown): WidgetConfig {
  const { config } = WidgetBody.parse(body);
  const parsed = WidgetConfigSchema.safeParse(config);
  if (!parsed.success) throw configError(parsed.error);
  return parsed.data;
}

export function dashboardRoutes(app: FastifyInstance, { db }: { db: DB }) {
  const auth = { preHandler: requireUser(db) };
  const record = async (req: { query: { record?: string } }, uid: string, kind: VersionKind) => {
    if (shouldRecord(req.query)) await history.recordVersion(db, uid, kind);
  };

  app.get('/api/dashboard', auth, async (req) => repo.getOrCreateDashboard(db, userId(req)));

  app.patch('/api/dashboard', auth, async (req) => {
    const { dateFilter } = DashboardPatch.parse(req.body);
    return { dateFilter: await repo.setDateFilter(db, userId(req), dateFilter) };
  });

  app.post<RecordQuery>('/api/dashboard/widgets', auth, async (req, reply) => {
    const { position } = AddBody.parse(req.body);
    const widget = await repo.addWidget(db, userId(req), parseConfig(req.body), { position });
    // `?source=ai`: added from Insight AI, shown with the "Insight AI" tag in Version history.
    await record(req, userId(req), req.query.source === 'ai' ? 'ai_added' : 'added');
    return reply.status(201).send(widget);
  });

  app.patch<IdParams>('/api/dashboard/widgets/:id', auth, async (req) => {
    const widget = await repo.updateWidgetConfig(db, userId(req), req.params.id, parseConfig(req.body));
    await record(req, userId(req), 'edited');
    return widget;
  });

  app.delete<IdParams>('/api/dashboard/widgets/:id', auth, async (req, reply) => {
    await repo.deleteWidget(db, userId(req), req.params.id);
    await record(req, userId(req), 'removed');
    return reply.status(204).send();
  });

  app.post<IdParams>('/api/dashboard/widgets/:id/duplicate', auth, async (req, reply) => {
    const widget = await repo.duplicateWidget(db, userId(req), req.params.id);
    await record(req, userId(req), 'duplicated');
    return reply.status(201).send(widget);
  });

  /** Undo/redo: replace every widget at once. Part of an edit session, so no version is recorded. */
  app.put('/api/dashboard/widgets', auth, async (req) => {
    const { widgets } = ReplaceBody.parse(req.body);
    const snapshot: WidgetSnapshot[] = widgets.map((w) => ({
      id: w.id,
      config: parseConfig({ config: w.config }),
      layout: w.layout,
    }));
    return repo.replaceWidgets(db, userId(req), snapshot);
  });

  app.put('/api/dashboard/layout', auth, async (req, reply) => {
    const { items } = LayoutBody.parse(req.body);
    await repo.saveLayout(db, userId(req), items);
    return reply.status(204).send();
  });

  app.post('/api/dashboard/reset', auth, async (req) => {
    const dashboard = await repo.resetDashboard(db, userId(req));
    await history.recordVersion(db, userId(req), 'reset');
    return dashboard;
  });

  // ---- version history (REQUIREMENTS §6.9)

  /** Closes an edit session (on Done, and on page load for a session left unfinished). */
  app.post('/api/dashboard/versions', auth, async (req) => ({
    version: await history.recordVersion(db, userId(req), 'edit_session'),
  }));

  app.get('/api/dashboard/versions', auth, async (req) => ({
    versions: await history.listVersions(db, userId(req)),
  }));

  app.get<IdParams>('/api/dashboard/versions/:id', auth, async (req) =>
    history.getVersion(db, userId(req), req.params.id),
  );

  app.post<IdParams>('/api/dashboard/versions/:id/restore', auth, async (req) =>
    repo.restoreVersion(db, userId(req), req.params.id),
  );
}
