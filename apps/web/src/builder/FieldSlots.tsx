import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MAX_LINE_MEASURES, MAX_TABLE_COLUMNS, type GrainOption, type PoolItem } from '@insightflow/shared';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { SegmentedControl } from '../components/ui/Controls';
import { cn } from '../lib/cn';
import type { BuilderAction, BuilderState } from './builderState';
import { ChipFace } from './FieldChip';

export type SlotId = 'measures' | 'attributes' | 'columns';

/** Which chip kinds a slot accepts. */
export const SLOT_ACCEPTS: Record<SlotId, PoolItem['kind'][]> = {
  measures: ['measure'],
  attributes: ['attribute'],
  columns: ['measure', 'attribute'],
};

const GRAIN_OPTIONS: { value: GrainOption; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Qtr' },
];

export function FieldSlots({
  state,
  dispatch,
}: {
  state: BuilderState;
  dispatch: (a: BuilderAction) => void;
}) {
  const c = state.config;
  const remove = (key: string) => dispatch({ type: 'removeField', key });
  const measures = c.fields.measures.map((m) => ({ kind: 'measure' as const, key: m.key }));
  const attrs = c.fields.attributes.map((a) => ({ kind: 'attribute' as const, ...a }));

  if (c.type === 'table') {
    const columns = c.fields.columns ?? [];
    return (
      <Slot
        id="columns"
        label={`Columns (${columns.length}/${MAX_TABLE_COLUMNS})`}
        hint="Any mix of measures and attributes — drag to reorder"
        empty={columns.length === 0}
      >
        <SortableContext
          items={columns.map((col) => `col:${col.key}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1.5">
            {columns.map((col) => (
              <SortableColumn key={col.key} item={col} onRemove={() => remove(col.key)} />
            ))}
          </div>
        </SortableContext>
      </Slot>
    );
  }

  const measureLabel = c.type === 'line' ? `Measures (1–${MAX_LINE_MEASURES})` : 'Measure';
  const attrLabel = c.type === 'line' ? 'Date' : 'Group by';
  return (
    <div className="space-y-3">
      <Slot
        id="measures"
        label={measureLabel}
        empty={measures.length === 0}
        hint="Click or drag a measure here"
      >
        <div className="flex flex-wrap gap-1.5">
          {measures.map((m) => (
            <ChipFace key={m.key} item={m} onRemove={() => remove(m.key)} />
          ))}
        </div>
      </Slot>
      {c.type !== 'kpi' ? (
        <Slot
          id="attributes"
          label={attrLabel}
          empty={attrs.length === 0}
          hint={c.type === 'line' ? 'Click or drag Date here' : 'Click or drag an attribute here'}
        >
          <div className="space-y-2">
            {attrs.map((a) => (
              <div key={a.key} className="flex flex-wrap items-center gap-2">
                <ChipFace item={a} onRemove={() => remove(a.key)} />
                {a.grain ? (
                  <SegmentedControl
                    size="sm"
                    label="Date grain"
                    value={a.grain}
                    onChange={(grain) => dispatch({ type: 'setGrain', key: a.key, grain })}
                    options={GRAIN_OPTIONS}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </Slot>
      ) : null}
    </div>
  );
}

function Slot({
  id,
  label,
  hint,
  empty,
  children,
}: {
  id: SlotId;
  label: string;
  hint: string;
  empty: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `slot:${id}` });
  const dragged = active?.data.current?.item as PoolItem | undefined;
  const accepts = dragged ? SLOT_ACCEPTS[id].includes(dragged.kind) : false;
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-600">{label}</div>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-11 rounded-xl border p-2 transition-colors',
          empty ? 'border-dashed border-slate-300 bg-slate-50/60' : 'border-line bg-white',
          dragged && accepts && 'border-primary/60 bg-primary-soft/50',
          isOver && accepts && 'border-solid border-primary bg-primary-soft ring-2 ring-primary/20',
        )}
      >
        {empty ? <div className="flex h-7 items-center px-1 text-xs text-slate-500">{hint}</div> : children}
      </div>
    </div>
  );
}

function SortableColumn({ item, onRemove }: { item: PoolItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col:${item.key}`,
    data: { column: item.key },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-1', isDragging && 'z-10 opacity-60')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reorder column"
        className="cursor-grab rounded p-0.5 text-slate-400 hover:text-slate-600 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <ChipFace item={item} onRemove={onRemove} />
    </div>
  );
}
