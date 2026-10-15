import { formatIstDateTime, type WidgetConfig } from '@insightflow/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Cloud,
  FileDown,
  History,
  LayoutGrid,
  MoreVertical,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CHAT_PANEL_WIDTH, ChatPanel } from '../ai/ChatPanel';
import { useAiStatus, useChat } from '../ai/useChat';
import { useMe } from '../auth/useAuth';
import { AppHeader } from '../components/layout/AppHeader';
import { Button, IconButton, Spinner } from '../components/ui/Button';
import { DateFilterPicker } from '../components/ui/DateFilterPicker';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../components/ui/Menu';
import { ConfirmDialog } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';
import { WidgetError } from '../widgets/WidgetStates';
import { ADD_OPTIONS, AddWidgetMenu } from '../dashboard/AddWidgetMenu';
import { DashboardGrid } from '../dashboard/DashboardGrid';
import {
  emptyUndo,
  historyShortcut,
  popRedo,
  popUndo,
  pushStep,
  type UndoState,
  type UndoStep,
} from '../dashboard/undoStack';
import {
  changedItems,
  tempId,
  toSnapshot,
  useDashboard,
  useDashboardActions,
  useDebouncedLayoutSave,
  useSaveState,
  VERSIONS_KEY,
  type LayoutItem,
  type Widget,
} from '../dashboard/useDashboard';
import { HISTORY_PANEL_WIDTH, HistoryPanel } from '../history/HistoryPanel';
import { compareToCurrent, type VersionSummary } from '../history/historyView';
import { closeOpenSession, useRestoreVersion, useVersion } from '../history/useVersions';
import { VersionBanner } from '../history/VersionBanner';
import { cn } from '../lib/cn';

// The builder (drag & drop, date picker…) is loaded on first use.
const WidgetBuilder = lazy(() =>
  import('../builder/WidgetBuilder').then((m) => ({ default: m.WidgetBuilder })),
);

type BuilderState =
  | { mode: 'add' }
  | { mode: 'edit'; widget: Widget }
  /** "Edit" on an Insight AI preview: pre-filled, saved as a new widget at the bottom. */
  | { mode: 'ai'; previewId: string; config: WidgetConfig }
  | null;

const isWide = () => window.matchMedia('(min-width: 1024px)').matches;

export function DashboardPage() {
  const qc = useQueryClient();
  const dashboard = useDashboard();
  const [editMode, setEditMode] = useState(false);
  const [undo, setUndo] = useState<UndoState>(emptyUndo);
  const actions = useDashboardActions({
    editMode,
    onStep: useCallback((s: UndoStep) => setUndo((u) => pushStep(u, s)), []),
  });
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [removing, setRemoving] = useState<Widget | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<VersionSummary | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const version = useVersion(viewing?.id ?? null);
  const restore = useRestoreVersion();
  const [chatOpen, setChatOpen] = useState(false);
  const me = useMe();
  const aiStatus = useAiStatus();
  const chat = useChat(me.data?.id ?? 'anonymous', () =>
    dashboard.data
      ? {
          dateFilter: dashboard.data.dateFilter,
          widgetTitles: dashboard.data.widgets.map((w) => w.config.title),
        }
      : null,
  );

  const { saveLayoutNow } = actions;
  const layoutSave = useDebouncedLayoutSave(
    useCallback((items: LayoutItem[]) => saveLayoutNow.mutate(items), [saveLayoutNow]),
  );
  const saveState = useSaveState(layoutSave.pending);
  const saving = saveState === 'saving';

  // An edit session left unfinished (tab closed before Done) is recorded once the dashboard loads.
  const loaded = Boolean(dashboard.data);
  const sessionChecked = useRef(false);
  useEffect(() => {
    if (!loaded || sessionChecked.current) return;
    sessionChecked.current = true;
    void closeOpenSession().then(() => qc.invalidateQueries({ queryKey: VERSIONS_KEY, exact: true }));
  }, [loaded, qc]);

  const highlight = useCallback((id: string) => {
    setHighlightId(id);
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-widget-id="${id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
  }, []);
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(t);
  }, [highlightId]);

  // ---- edit session: undo / redo / done

  const startEditing = () => {
    setUndo(emptyUndo);
    setHistoryOpen(false);
    // Insight AI is not available in edit mode (REQUIREMENTS §17.11); the conversation is kept.
    setChatOpen(false);
    setViewing(null);
    setEditMode(true);
  };

  const finishEditing = useCallback(async () => {
    layoutSave.flush();
    setEditMode(false);
    setUndo(emptyUndo);
    await actions.finishEditSession();
  }, [layoutSave, actions]);

  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      if (saving) return;
      const popped = direction === 'undo' ? popUndo(undo) : popRedo(undo);
      if (!popped) return;
      const target = direction === 'undo' ? popped.step.before : popped.step.after;
      actions.replaceWidgets.mutate(target, {
        onSuccess: () => {
          setUndo(popped.state);
          toast(`${direction === 'undo' ? 'Undone' : 'Redone'}: ${popped.step.label}`);
        },
      });
    },
    [saving, undo, actions.replaceWidgets],
  );

  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector('[role=dialog],[role=alertdialog]'));
      const action = historyShortcut(e, dialogOpen);
      if (!action) return;
      e.preventDefault();
      step(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, step]);

  // ---- version preview

  const backToCurrent = useCallback(() => setViewing(null), []);
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog],[role=alertdialog]')) backToCurrent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing, backToCurrent]);

  const data = dashboard.data;
  const comparison = useMemo(
    () => (data && version.data ? compareToCurrent(toSnapshot(data.widgets), version.data.widgets) : null),
    [data, version.data],
  );
  const versionWidgets = useMemo<Widget[]>(
    () => version.data?.widgets.map((w) => ({ ...w, updatedAt: version.data.createdAt })) ?? [],
    [version.data],
  );

  const selectVersion = (v: VersionSummary | null) => {
    setViewing(v);
    if (v && !isWide()) setHistoryOpen(false);
    window.scrollTo({ top: 0 });
  };

  // ----

  const onLayoutCommit = (items: LayoutItem[]) => {
    if (!data) return;
    // Only send a save when something actually moved; temp (unsaved) widgets aren't on the server yet.
    if (changedItems(data, items).length === 0) return;
    layoutSave.schedule(items.filter((i) => !i.id.startsWith('temp-')));
  };

  // ---- Insight AI

  const openChat = () => {
    setHistoryOpen(false);
    setViewing(null);
    setChatOpen(true);
  };

  /** Adds a chat preview at the bottom of the dashboard (REQUIREMENTS §17.7). */
  const addFromChat = (previewId: string, config: WidgetConfig) => {
    const temp = tempId();
    chat.markPreview(previewId, 'added');
    actions.addWidget.mutate(
      { config, tempId: temp, position: 'bottom', source: 'ai' },
      {
        onSuccess: (saved) => highlight(saved.id),
        onError: () => chat.markPreview(previewId, 'open'),
      },
    );
    // On small screens the panel covers the dashboard: close it so the new widget is visible.
    if (!isWide()) setChatOpen(false);
    highlight(temp);
  };

  /** Add widget → Create with AI: always a fresh conversation; the previous one moves to Recent chats. */
  const createWithAi = () => {
    chat.newChat();
    openChat();
  };

  /** "Ask Insight AI about this": a fresh conversation about that widget (previous one → Recent chats). */
  const askAboutWidget = (w: Widget) => {
    chat.newChat();
    chat.setWidget({ widgetId: w.id, title: w.config.title, config: w.config });
    openChat();
  };

  const saveFromBuilder = (config: WidgetConfig) => {
    if (builder?.mode === 'ai') {
      addFromChat(builder.previewId, config);
    } else if (builder?.mode === 'edit') {
      const id = builder.widget.id;
      actions.updateWidget.mutate({ id, config }, { onSuccess: () => highlight(id) });
    } else {
      const temp = tempId();
      actions.addWidget.mutate({ config, tempId: temp }, { onSuccess: (saved) => highlight(saved.id) });
      highlight(temp);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setBuilder(null);
  };

  const undoLabel = undo.past[undo.past.length - 1]?.label;
  const redoLabel = undo.future[0]?.label;

  return (
    <div className="min-h-full">
      <AppHeader>
        {data ? (
          <>
            <SaveIndicator state={saveState} />
            <DateFilterPicker
              value={data.dateFilter}
              onChange={(f) => actions.setDateFilter.mutate(f)}
              align="end"
            />
            {/* Moving and resizing is desktop-only; phones show a single stacked column. */}
            {viewing ? null : (
              <div className="hidden items-center gap-1 md:flex">
                {editMode ? (
                  <>
                    <Tooltip content={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'} side="bottom">
                      <span>
                        <IconButton
                          label="Undo"
                          disabled={!undoLabel || saving}
                          onClick={() => step('undo')}
                          title={undefined}
                        >
                          <Undo2 className="size-4" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip content={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'} side="bottom">
                      <span>
                        <IconButton
                          label="Redo"
                          disabled={!redoLabel || saving}
                          onClick={() => step('redo')}
                          title={undefined}
                        >
                          <Redo2 className="size-4" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                ) : null}
                <Button
                  variant={editMode ? 'primary' : 'secondary'}
                  icon={editMode ? <Check className="size-4" /> : <LayoutGrid className="size-4" />}
                  onClick={() => (editMode ? void finishEditing() : startEditing())}
                  aria-pressed={editMode}
                >
                  {editMode ? 'Done' : 'Edit dashboard'}
                </Button>
              </div>
            )}
            {viewing ? null : (
              // Two ways to add: the builder, or Insight AI (which replaces the old header AI button).
              <AddWidgetMenu
                variant={editMode ? 'secondary' : 'primary'}
                aiDisabledReason={editMode ? 'Click Done first to use Insight AI' : null}
                onManual={() => setBuilder({ mode: 'add' })}
                onAi={createWithAi}
              />
            )}
            <Tooltip content={editMode ? 'Click Done to see the history' : null} side="bottom">
              <span>
                <IconButton
                  label="Version history"
                  title={editMode ? undefined : 'Version history'}
                  disabled={editMode}
                  aria-pressed={historyOpen}
                  className={cn(
                    historyOpen && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                  )}
                  onClick={() => {
                    if (historyOpen) setViewing(null);
                    else setChatOpen(false);
                    setHistoryOpen((o) => !o);
                  }}
                >
                  <History className="size-4" />
                </IconButton>
              </span>
            </Tooltip>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More options">
                  <MoreVertical className="size-4" />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                {/* Placeholder: PDF export is not implemented yet. */}
                <MenuItem icon={<FileDown />} onSelect={() => {}}>
                  Save as PDF
                </MenuItem>
                <MenuItem icon={<RotateCcw />} onSelect={() => setConfirmReset(true)}>
                  Reset to default
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        ) : null}
      </AppHeader>

      <div className={cn(historyOpen && HISTORY_PANEL_WIDTH, chatOpen && CHAT_PANEL_WIDTH)}>
        <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
          {dashboard.isPending ? (
            <div className="flex h-64 items-center justify-center text-primary">
              <Spinner className="size-6" />
            </div>
          ) : dashboard.isError ? (
            <div className="h-64">
              <WidgetError message={dashboard.error.message} onRetry={() => dashboard.refetch()} />
            </div>
          ) : data && viewing ? (
            <>
              <VersionBanner
                version={viewing}
                notInVersion={comparison?.notInVersion ?? []}
                restoring={restore.isPending}
                onRestore={() => setConfirmRestore(true)}
                onBack={backToCurrent}
              />
              {version.isPending ? (
                <div className="flex h-64 items-center justify-center text-primary">
                  <Spinner className="size-6" />
                </div>
              ) : version.isError ? (
                <div className="h-64">
                  <WidgetError message={version.error.message} onRetry={() => version.refetch()} />
                </div>
              ) : versionWidgets.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted">This version had no widgets.</p>
              ) : (
                <DashboardGrid
                  widgets={versionWidgets}
                  dashboardFilter={data.dateFilter}
                  editMode={false}
                  readOnly
                  badges={comparison?.badges}
                  highlightId={null}
                  onLayoutCommit={() => {}}
                  onEdit={() => {}}
                  onDuplicate={() => {}}
                  onRemove={() => {}}
                />
              )}
            </>
          ) : data && data.widgets.length === 0 ? (
            <EmptyDashboard onManual={() => setBuilder({ mode: 'add' })} onAi={createWithAi} />
          ) : data ? (
            <>
              {editMode ? (
                <p className="mb-3 hidden text-sm text-muted md:block">
                  Drag widgets to move them, drag the corner to resize. Changes save automatically — use Undo
                  (Ctrl/⌘+Z) to step back.
                </p>
              ) : null}
              <DashboardGrid
                widgets={data.widgets}
                dashboardFilter={data.dateFilter}
                editMode={editMode}
                highlightId={highlightId}
                onLayoutCommit={onLayoutCommit}
                onEdit={(widget) => setBuilder({ mode: 'edit', widget })}
                onDuplicate={(w) => {
                  const temp = tempId();
                  actions.duplicateWidget.mutate(
                    { id: w.id, tempId: temp },
                    { onSuccess: (saved) => highlight(saved.id) },
                  );
                }}
                onRemove={setRemoving}
                onAskAi={askAboutWidget}
              />
            </>
          ) : null}
        </main>
      </div>

      {historyOpen && data ? (
        <HistoryPanel
          selectedId={viewing?.id ?? null}
          onSelect={selectVersion}
          onClose={() => {
            setHistoryOpen(false);
            setViewing(null);
          }}
        />
      ) : null}

      {/* Floating "Ask AI" button (like a chat widget); opens the same panel as the header button. */}
      {data && !chatOpen && !editMode && !viewing && !historyOpen && builder === null ? (
        <Tooltip content="Ask Insight AI" side="left">
          <button
            type="button"
            aria-label="Ask AI"
            onClick={openChat}
            className="group fixed right-5 bottom-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-white shadow-pop transition-all hover:bg-primary-hover focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none sm:right-6 sm:bottom-6"
          >
            <Sparkles className="size-6 transition-transform group-hover:rotate-12" />
            <span className="text-sm font-semibold">Ask AI</span>
          </button>
        </Tooltip>
      ) : null}

      {chatOpen && data ? (
        <ChatPanel
          chat={chat}
          configured={aiStatus.data ? aiStatus.data.configured : null}
          dashboardFilter={data.dateFilter}
          onClose={() => setChatOpen(false)}
          onAdd={addFromChat}
          onEdit={(previewId, config) => setBuilder({ mode: 'ai', previewId, config })}
        />
      ) : null}

      {data && builder !== null ? (
        <Suspense fallback={null}>
          <WidgetBuilder
            open={builder !== null}
            mode={builder?.mode === 'edit' ? 'edit' : 'create'}
            initial={
              builder?.mode === 'edit'
                ? builder.widget.config
                : builder?.mode === 'ai'
                  ? builder.config
                  : null
            }
            dashboardFilter={data.dateFilter}
            onClose={() => setBuilder(null)}
            onSave={saveFromBuilder}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove '${removing?.config.title ?? ''}'?`}
        description={
          editMode
            ? 'You can bring it back with Undo.'
            : 'It will be removed from your dashboard. You can bring it back from Version history.'
        }
        confirmLabel="Remove"
        onConfirm={() => removing && actions.deleteWidget.mutate(removing.id)}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset your dashboard?"
        description="Your widgets and layout will be replaced with the default dashboard. Your current dashboard is kept in Version history. Other users are not affected."
        confirmLabel="Reset"
        onConfirm={async () => {
          setViewing(null);
          if (editMode) await finishEditing();
          actions.reset.mutate();
        }}
      />
      <ConfirmDialog
        open={confirmRestore && viewing !== null}
        onOpenChange={setConfirmRestore}
        title={viewing ? `Restore the version from ${formatIstDateTime(viewing.createdAt)}?` : ''}
        description="Your current dashboard will be saved in the history, so you can switch back."
        confirmLabel="Restore"
        tone="primary"
        onConfirm={() => viewing && restore.mutate(viewing, { onSuccess: () => setViewing(null) })}
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: 'saving' | 'saved' | 'idle' }) {
  if (state === 'idle') return null;
  return (
    <span
      role="status"
      className={cn(
        'hidden items-center gap-1.5 text-xs lg:inline-flex',
        state === 'saving' ? 'text-muted' : 'text-slate-500',
      )}
    >
      {state === 'saving' ? <Spinner className="size-3" /> : <Cloud className="size-3.5" />}
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  );
}

function EmptyDashboard({ onManual, onAi }: { onManual: () => void; onAi: () => void }) {
  return (
    <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line text-center">
      <LayoutGrid className="size-8 text-slate-300" />
      <div>
        <p className="font-medium text-ink">Your dashboard is empty</p>
        <p className="mt-1 text-sm text-muted">
          Add a widget, reset to the default dashboard from the ⋮ menu, or restore an earlier version.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" icon={<SlidersHorizontal className="size-4" />} onClick={onManual}>
          {ADD_OPTIONS.manual.label}
        </Button>
        <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={onAi}>
          {ADD_OPTIONS.ai.label}
        </Button>
      </div>
    </div>
  );
}
