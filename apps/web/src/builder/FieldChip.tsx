import { useDraggable } from '@dnd-kit/core';
import { getAttribute, getMeasure, type PoolItem } from '@insightflow/shared';
import { Calendar, Check, Clock, Hash, Percent, Tag, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from '../components/ui/Tooltip';
import { cn } from '../lib/cn';

export function fieldIcon(item: PoolItem): ReactNode {
  if (item.kind === 'attribute') return getAttribute(item.key).kind === 'date' ? <Calendar /> : <Tag />;
  switch (getMeasure(item.key).format) {
    case 'currency':
      return <span className="text-[11px] leading-none font-semibold">₹</span>;
    case 'percent':
      return <Percent />;
    case 'days':
      return <Clock />;
    default:
      return <Hash />;
  }
}

export function fieldLabel(item: PoolItem) {
  return item.kind === 'measure' ? getMeasure(item.key).label : getAttribute(item.key).label;
}

const tone = {
  measure: 'border-teal-200 bg-primary-soft text-teal-800 hover:border-teal-300 hover:bg-teal-50',
  attribute: 'border-amber-200 bg-accent-soft text-amber-900 hover:border-amber-300 hover:bg-amber-50',
};

/** Chip body (also used inside slots and the drag overlay). */
export function ChipFace({
  item,
  onRemove,
  muted,
  added,
  className,
}: {
  item: PoolItem;
  onRemove?: () => void;
  muted?: boolean;
  added?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-[13px] font-medium transition-colors select-none',
        tone[item.kind],
        muted && 'opacity-45',
        onRemove && 'pr-1',
        className,
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center opacity-80 [&>svg]:size-3.5">
        {fieldIcon(item)}
      </span>
      <span className="truncate">{fieldLabel(item)}</span>
      {added ? <Check className="size-3.5 shrink-0" /> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${fieldLabel(item)}`}
          className="no-drag ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-black/10"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/** A clickable, draggable chip in the Data fields panel. */
export function FieldChip({
  item,
  description,
  blockReason,
  onAdd,
}: {
  item: PoolItem;
  description: string;
  blockReason: string | null;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${item.kind}:${item.key}`,
    data: { item },
    disabled: Boolean(blockReason),
  });
  const added = blockReason === 'Already added';
  return (
    <Tooltip content={blockReason && !added ? `${description} — ${blockReason}` : description} side="right">
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        role="button"
        aria-disabled={Boolean(blockReason)}
        onClick={() => !blockReason && onAdd()}
        className={cn(
          'max-w-full rounded-full',
          blockReason ? 'cursor-not-allowed' : 'cursor-pointer',
          isDragging && 'opacity-30',
        )}
      >
        <ChipFace
          item={item}
          muted={Boolean(blockReason) && !added}
          added={added}
          className={added ? 'opacity-60' : undefined}
        />
      </button>
    </Tooltip>
  );
}
