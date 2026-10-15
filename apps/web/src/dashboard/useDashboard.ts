/**
 * The current user's dashboard: one GET, then optimistic mutations that roll back on failure.
 * See ARCHITECTURE §5.8.
 */
import {
  DEFAULT_SIZES,
  describeStep,
  snapshotsEqual,
  type DateFilter,
  type Layout,
  type WidgetConfig,
  type WidgetSnapshot,
} from '@insightflow/shared';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../api/client';
import type { UndoStep } from './undoStack';

export interface Widget {
  id: string;
  layout: Layout;
  config: WidgetConfig;
  updatedAt: string;
}

export interface Dashboard {
  dateFilter: DateFilter;
  widgets: Widget[];
}

export interface LayoutItem extends Layout {
  id: string;
}

export const DASHBOARD_KEY = ['dashboard'] as const;
export const VERSIONS_KEY = ['dashboard-versions'] as const;
export const SAVE_KEY = ['dashboard-save'] as const;
const TEMP_PREFIX = 'temp-';

export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

/** Puts a widget at the top and pushes every other widget down by its height. */
export function insertAtTop(dashboard: Dashboard, widget: Widget): Dashboard {
  return {
    ...dashboard,
    widgets: [
      widget,
      ...dashboard.widgets.map((w) => ({ ...w, layout: { ...w.layout, y: w.layout.y + widget.layout.h } })),
    ],
  };
}

/** Puts a widget below the lowest one (Insight AI adds, REQUIREMENTS §17.7). */
export function insertAtBottom(dashboard: Dashboard, widget: Widget): Dashboard {
  const y = dashboard.widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  return {
    ...dashboard,
    widgets: [...dashboard.widgets, { ...widget, layout: { ...widget.layout, x: 0, y } }],
  };
}

/** Puts a copy directly below its original, pushing widgets at or below that row down. */
export function insertBelow(dashboard: Dashboard, originalId: string, copy: Widget): Dashboard {
  const original = dashboard.widgets.find((w) => w.id === originalId);
  if (!original) return dashboard;
  const y = original.layout.y + original.layout.h;
  const placed: Widget = { ...copy, layout: { ...original.layout, y } };
  return {
    ...dashboard,
    widgets: [
      ...dashboard.widgets.map((w) =>
        w.layout.y >= y ? { ...w, layout: { ...w.layout, y: w.layout.y + original.layout.h } } : w,
      ),
      placed,
    ],
  };
}

export function applyLayout(dashboard: Dashboard, items: LayoutItem[]): Dashboard {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((w) => {
      const i = byId.get(w.id);
      return i ? { ...w, layout: { x: i.x, y: i.y, w: i.w, h: i.h } } : w;
    }),
  };
}

/** Only items whose position or size actually changed. */
export function changedItems(dashboard: Dashboard, items: LayoutItem[]): LayoutItem[] {
  const byId = new Map(dashboard.widgets.map((w) => [w.id, w.layout]));
  return items.filter((i) => {
    const l = byId.get(i.id);
    return l && (l.x !== i.x || l.y !== i.y || l.w !== i.w || l.h !== i.h);
  });
}

export const toSnapshot = (widgets: Widget[]): WidgetSnapshot[] =>
  widgets.map(({ id, config, layout }) => ({ id, config, layout }));

/** Shows a snapshot (e.g. while undoing) with the dashboard's current date filter. */
export function withSnapshot(dashboard: Dashboard, snapshot: WidgetSnapshot[]): Dashboard {
  const updated = new Map(dashboard.widgets.map((w) => [w.id, w.updatedAt]));
  return {
    ...dashboard,
    widgets: snapshot.map((w) => ({ ...w, updatedAt: updated.get(w.id) ?? new Date().toISOString() })),
  };
}

/** Resolves once no dashboard save is in flight. */
function whenSaved(qc: QueryClient): Promise<void> {
  if (qc.isMutating({ mutationKey: SAVE_KEY }) === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = qc.getMutationCache().subscribe(() => {
      if (qc.isMutating({ mutationKey: SAVE_KEY }) === 0) {
        unsubscribe();
        resolve();
      }
    });
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: () => api.get<Dashboard>('/api/dashboard'),
    staleTime: Infinity,
  });
}

/** Shared optimistic-update plumbing: snapshot → apply → roll back with a toast on error. */
export interface AddWidgetVars {
  config: WidgetConfig;
  tempId: string;
  /** Builder adds at the top; Insight AI at the bottom. */
  position?: 'top' | 'bottom';
  /** "ai" records the version as "Added by Insight AI". */
  source?: 'ai';
}

interface Tracking {
  /** Inside an edit session: changes become undo steps and are not recorded as versions yet. */
  editing: () => boolean;
  onStep?: (step: UndoStep) => void;
}

function useOptimistic<TVars, TResult>(
  mutationFn: (vars: TVars) => Promise<TResult>,
  apply: (d: Dashboard, vars: TVars) => Dashboard,
  {
    onSuccess,
    errorMessage,
    tracking,
  }: {
    onSuccess?: (result: TResult, vars: TVars) => void;
    errorMessage: string;
    /** Widget changes: undoable in edit mode, recorded as a version otherwise. */
    tracking?: Tracking;
  },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SAVE_KEY,
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: DASHBOARD_KEY });
      const previous = qc.getQueryData<Dashboard>(DASHBOARD_KEY);
      if (previous) qc.setQueryData(DASHBOARD_KEY, apply(previous, vars));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(DASHBOARD_KEY, ctx.previous);
      toast.error(errorMessage, { description: err.message });
    },
    onSuccess: (result, vars, ctx) => {
      onSuccess?.(result, vars);
      if (!tracking) return;
      if (!tracking.editing()) {
        void qc.invalidateQueries({ queryKey: VERSIONS_KEY, exact: true });
        return;
      }
      const after = qc.getQueryData<Dashboard>(DASHBOARD_KEY);
      if (!ctx?.previous || !after || !tracking.onStep) return;
      const before = toSnapshot(ctx.previous.widgets);
      const next = toSnapshot(after.widgets);
      // A step must only reference saved widgets; skip in the rare case another save is still pending.
      if ([...before, ...next].some((w) => isTempId(w.id)) || snapshotsEqual(before, next)) return;
      tracking.onStep({ label: describeStep(before, next), before, after: next });
    },
  });
}

export function useDashboardActions({
  editMode = false,
  onStep,
}: { editMode?: boolean; onStep?: (step: UndoStep) => void } = {}) {
  const qc = useQueryClient();
  const set = (fn: (d: Dashboard) => Dashboard) =>
    qc.setQueryData<Dashboard>(DASHBOARD_KEY, (d) => (d ? fn(d) : d));

  // Refs so in-flight mutations see the current mode and callback.
  const editing = useRef(editMode);
  editing.current = editMode;
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const tracking: Tracking = { editing: () => editing.current, onStep: (s) => stepRef.current?.(s) };
  /** `?record=false` inside an edit session: the session is recorded as one version on Done. */
  const rec = () => (editing.current ? '?record=false' : '');

  const setDateFilter = useOptimistic(
    (dateFilter: DateFilter) => api.patch('/api/dashboard', { dateFilter }),
    (d, dateFilter) => ({ ...d, dateFilter }),
    { errorMessage: "Couldn't save the date filter" },
  );

  const addWidget = useOptimistic(
    ({ config, position, source }: AddWidgetVars) => {
      const params = new URLSearchParams();
      if (editing.current) params.set('record', 'false');
      if (source === 'ai') params.set('source', 'ai');
      const qs = params.toString();
      return api.post<Widget>(`/api/dashboard/widgets${qs ? `?${qs}` : ''}`, { config, position });
    },
    (d, { config, tempId, position }) => {
      const widget = {
        id: tempId,
        config,
        layout: { x: 0, y: 0, ...DEFAULT_SIZES[config.type] },
        updatedAt: new Date().toISOString(),
      };
      return position === 'bottom' ? insertAtBottom(d, widget) : insertAtTop(d, widget);
    },
    {
      errorMessage: "Couldn't add the widget",
      tracking,
      onSuccess: (saved, { tempId }) =>
        set((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === tempId ? saved : w)) })),
    },
  );

  const updateWidget = useOptimistic(
    ({ id, config }: { id: string; config: WidgetConfig }) =>
      api.patch<Widget>(`/api/dashboard/widgets/${id}${rec()}`, { config }),
    (d, { id, config }) => ({ ...d, widgets: d.widgets.map((w) => (w.id === id ? { ...w, config } : w)) }),
    {
      errorMessage: "Couldn't save changes",
      tracking,
      onSuccess: (saved) =>
        set((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === saved.id ? saved : w)) })),
    },
  );

  const deleteWidget = useOptimistic(
    (id: string) => api.delete(`/api/dashboard/widgets/${id}${rec()}`),
    (d, id) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) }),
    { errorMessage: "Couldn't remove the widget", tracking },
  );

  const duplicateWidget = useOptimistic(
    ({ id }: { id: string; tempId: string }) =>
      api.post<Widget>(`/api/dashboard/widgets/${id}/duplicate${rec()}`),
    (d, { id, tempId }) => {
      const original = d.widgets.find((w) => w.id === id);
      return original ? insertBelow(d, id, { ...original, id: tempId }) : d;
    },
    {
      errorMessage: "Couldn't duplicate the widget",
      tracking,
      onSuccess: (saved, { tempId }) =>
        set((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === tempId ? saved : w)) })),
    },
  );

  const saveLayoutNow = useOptimistic(
    (items: LayoutItem[]) => api.put('/api/dashboard/layout', { items }),
    (d, items) => applyLayout(d, items),
    // Layout saves never record a version themselves (edit mode only); they are undoable.
    { errorMessage: "Couldn't save the layout", tracking: { ...tracking, editing: () => true } },
  );

  /** Undo/redo: saves a whole snapshot. Rolls back (and the caller keeps the step) on failure. */
  const replaceWidgets = useOptimistic(
    (snapshot: WidgetSnapshot[]) => api.put<Dashboard>('/api/dashboard/widgets', { widgets: snapshot }),
    (d, snapshot) => withSnapshot(d, snapshot),
    {
      errorMessage: "Couldn't undo that change",
      onSuccess: (saved) => set((d) => ({ ...d, widgets: saved.widgets })),
    },
  );

  const reset = useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: () => api.post<Dashboard>('/api/dashboard/reset'),
    onSuccess: (dashboard) => {
      qc.setQueryData(DASHBOARD_KEY, dashboard);
      void qc.invalidateQueries({ queryKey: VERSIONS_KEY, exact: true });
      toast.success('Dashboard reset to default');
    },
    onError: (err) => toast.error("Couldn't reset the dashboard", { description: err.message }),
  });

  /** Ends an edit session: waits for pending saves, then records the session as one version. */
  const finishEditSession = useCallback(async () => {
    await whenSaved(qc);
    try {
      await api.post('/api/dashboard/versions');
    } catch {
      // Not critical: the session is recorded on the next page load.
    }
    void qc.invalidateQueries({ queryKey: VERSIONS_KEY, exact: true });
  }, [qc]);

  return {
    setDateFilter,
    addWidget,
    updateWidget,
    deleteWidget,
    duplicateWidget,
    saveLayoutNow,
    replaceWidgets,
    reset,
    finishEditSession,
  };
}

/** Collapses a burst of drag/resize events into one save, 500 ms after the last one. */
export function useDebouncedLayoutSave(save: (items: LayoutItem[]) => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<LayoutItem[] | null>(null);
  const [pending, setPending] = useState(false);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (latest.current) save(latest.current);
    latest.current = null;
    setPending(false);
  }, [save]);

  const schedule = useCallback(
    (items: LayoutItem[]) => {
      latest.current = items;
      setPending(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  // Save anything still pending when leaving the page.
  useEffect(() => () => flush(), [flush]);
  return { schedule, flush, pending };
}

export function useSaveState(layoutPending: boolean): 'saving' | 'saved' | 'idle' {
  const saving = useIsMutating({ mutationKey: SAVE_KEY }) > 0 || layoutPending;
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (saving) setTouched(true);
  }, [saving]);
  return saving ? 'saving' : touched ? 'saved' : 'idle';
}

let counter = 0;
export function tempId(): string {
  counter += 1;
  return `${TEMP_PREFIX}${Date.now()}-${counter}`;
}
