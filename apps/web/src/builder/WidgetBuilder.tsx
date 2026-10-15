import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  parseWidgetConfig,
  validateForBuilder,
  type DateFilter,
  type PoolItem,
  type WidgetConfig,
} from '@insightflow/shared';
import { Info } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/Controls';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { cn } from '../lib/cn';
import { withOverride } from '../widgets/colors';
import type { WidgetPickHandler } from '../widgets/types';
import { builderReducer, initBuilder, isDirty } from './builderState';
import { ColorPopover, type ColorPickRequest } from './ColorPopover';
import { ColorsPanel } from './ColorsPanel';
import { ChipFace } from './FieldChip';
import { FieldSlots, SLOT_ACCEPTS, type SlotId } from './FieldSlots';
import { FieldsPanel } from './FieldsPanel';
import { OptionsPanel } from './OptionsPanel';
import { Preview } from './Preview';
import { VisualizationPicker } from './VisualizationPicker';

export interface BuilderProps {
  open: boolean;
  initial: WidgetConfig | null;
  dashboardFilter: DateFilter;
  onClose: () => void;
  onSave: (config: WidgetConfig) => void;
  /** Defaults to "edit" when `initial` is set. A chat preview opens pre-filled in "create" mode. */
  mode?: 'create' | 'edit';
}

type Tab = 'fields' | 'preview' | 'settings';

export function WidgetBuilder({ open, initial, dashboardFilter, onClose, onSave, mode }: BuilderProps) {
  const [state, dispatch] = useReducer(builderReducer, initial, initBuilder);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragging, setDragging] = useState<PoolItem | null>(null);
  const [picker, setPicker] = useState<ColorPickRequest | null>(null);
  const [tab, setTab] = useState<Tab>('fields');

  // Start fresh every time the builder opens.
  useEffect(() => {
    if (open) {
      dispatch({ type: 'reset', initial });
      setTab(initial ? 'preview' : 'fields');
    }
  }, [open, initial]);

  const validation = validateForBuilder(state.config);
  const editing = mode ? mode === 'edit' : initial !== null;
  const requestClose = () => (isDirty(state) ? setConfirmDiscard(true) : onClose());
  const save = () => {
    if (validation.valid) onSave(parseWidgetConfig(state.config));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Space picks a chip/column up for keyboard dragging; Enter stays a click (adds the chip).
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current?.item as PoolItem) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const overId = e.over ? String(e.over.id) : null;
    const item = e.active.data.current?.item as PoolItem | undefined;
    if (item && overId?.startsWith('slot:')) {
      const slot = overId.slice(5) as SlotId;
      if (SLOT_ACCEPTS[slot].includes(item.kind)) dispatch({ type: 'addField', item });
      return;
    }
    const from = e.active.data.current?.column as string | undefined;
    const to = e.over?.data.current?.column as string | undefined;
    if (from && to && from !== to) {
      const cols = state.config.fields.columns ?? [];
      dispatch({
        type: 'moveColumn',
        from: cols.findIndex((c) => c.key === from),
        to: cols.findIndex((c) => c.key === to),
      });
    }
  };

  const onPick: WidgetPickHandler = (target, color, anchor) => {
    const colors = state.config.appearance.colors;
    const overridden =
      target.kind === 'value'
        ? Boolean(colors.values?.[target.key])
        : target.kind === 'series'
          ? Boolean(colors.series?.[target.key])
          : Boolean(colors[target.kind]);
    const title =
      target.kind === 'value' || target.kind === 'series'
        ? target.key.replace(/_/g, ' ')
        : target.kind === 'accent'
          ? 'Accent'
          : 'Data bar';
    const a =
      'width' in anchor ? { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height } : anchor;
    setPicker({
      title,
      color,
      anchor: a,
      isOverridden: overridden,
      onChange: (c) =>
        dispatch({ type: 'setColors', colors: withOverride(state.config.appearance.colors, target, c) }),
    });
  };

  // Ctrl/⌘ + Enter saves from anywhere in the builder (focus may sit on <body> after editing the title).
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!open || confirmDiscard) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmDiscard]);

  const message = state.note && validation.valid ? state.note : validation.reason;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => !o && requestClose()}
        onRequestClose={requestClose}
        size="full"
        title={editing ? 'Edit widget' : 'Create widget'}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {message ? (
              <p
                role="status"
                className={cn(
                  'mr-auto flex items-center gap-1.5 text-sm',
                  validation.valid ? 'text-muted' : 'text-amber-700',
                )}
              >
                <Info className="size-4 shrink-0" />
                {message}
              </p>
            ) : null}
            <span className="hidden text-xs text-slate-500 lg:inline">Ctrl/⌘ + Enter to save</span>
            <Button onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!validation.valid}
              onClick={save}
              title={validation.reason ?? undefined}
            >
              {editing ? 'Save changes' : 'Add to dashboard'}
            </Button>
          </div>
        }
      >
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-line px-4 py-2 lg:hidden">
              <SegmentedControl
                label="Builder section"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'fields', label: 'Fields' },
                  { value: 'preview', label: 'Preview' },
                  { value: 'settings', label: 'Settings' },
                ]}
              />
            </div>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[272px_minmax(0,1fr)_360px]">
              <aside
                className={cn(
                  'min-h-0 border-line lg:block lg:border-r',
                  tab === 'fields' ? 'block' : 'hidden',
                )}
              >
                <FieldsPanel state={state} onAdd={(item) => dispatch({ type: 'addField', item })} />
              </aside>
              <div className={cn('min-h-0 lg:block', tab === 'preview' ? 'block' : 'hidden')}>
                <Preview
                  config={state.config}
                  dashboardFilter={dashboardFilter}
                  onTitle={(title) => dispatch({ type: 'setTitle', title })}
                  onResetTitle={() => dispatch({ type: 'resetTitle' })}
                  onPick={onPick}
                />
              </div>
              <aside
                className={cn(
                  'min-h-0 overflow-y-auto border-line lg:block lg:border-l',
                  tab === 'settings' ? 'block' : 'hidden',
                )}
              >
                <div className="space-y-5 p-4">
                  <section className="space-y-2.5">
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">
                      Visualization
                    </h4>
                    <VisualizationPicker
                      state={state}
                      onSelect={(widgetType) => dispatch({ type: 'setType', widgetType })}
                    />
                  </section>
                  <section className="space-y-2.5">
                    <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Fields</h4>
                    <FieldSlots state={state} dispatch={dispatch} />
                  </section>
                  <OptionsPanel state={state} dispatch={dispatch} dashboardFilter={dashboardFilter} />
                  <ColorsPanel
                    state={state}
                    dispatch={dispatch}
                    dashboardFilter={dashboardFilter}
                    previewEnabled={validation.valid}
                    openPicker={setPicker}
                  />
                </div>
              </aside>
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging ? <ChipFace item={dragging} className="shadow-pop" /> : null}
          </DragOverlay>
        </DndContext>
        {/* Inside the modal so Esc closes only the popover (Radix nests the dismiss layers). */}
        <ColorPopover request={picker} onClose={() => setPicker(null)} />
      </Modal>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description="Your changes to this widget won’t be saved."
        confirmLabel="Discard"
        onConfirm={onClose}
      />
    </>
  );
}
