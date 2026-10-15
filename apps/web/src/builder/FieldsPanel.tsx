import {
  ATTRIBUTES,
  ATTRIBUTE_GROUP_LABELS,
  MEASURES,
  matchesSearch,
  type AttributeGroup,
  type PoolItem,
} from '@insightflow/shared';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { SearchInput } from '../components/ui/Controls';
import { chipBlockReason, type BuilderState } from './builderState';
import { FieldChip } from './FieldChip';

const GROUPS: AttributeGroup[] = ['time', 'product', 'customer', 'order'];

export function FieldsPanel({ state, onAdd }: { state: BuilderState; onAdd: (item: PoolItem) => void }) {
  const [q, setQ] = useState('');
  const measures = useMemo(() => MEASURES.filter((m) => matchesSearch(m, q)), [q]);
  const attributes = useMemo(() => ATTRIBUTES.filter((a) => matchesSearch(a, q)), [q]);
  const chip = (item: PoolItem, description: string) => (
    <FieldChip
      key={item.key}
      item={item}
      description={description}
      blockReason={chipBlockReason(state, item)}
      onAdd={() => onAdd(item)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-3">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Data fields</h3>
        <SearchInput value={q} onChange={setQ} placeholder="Search fields…" label="Search fields" />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {measures.length === 0 && attributes.length === 0 ? (
          <p className="text-sm text-muted">No fields match “{q}”.</p>
        ) : null}
        {measures.length ? (
          <Group title="Measures" count={measures.length} dot="bg-teal-500">
            {measures.map((m) => chip({ kind: 'measure', key: m.key }, m.description))}
          </Group>
        ) : null}
        {attributes.length ? (
          <Group title="Attributes" count={attributes.length} dot="bg-amber-500">
            <div className="space-y-3">
              {GROUPS.map((g) => {
                const list = attributes.filter((a) => a.group === g);
                if (!list.length) return null;
                return (
                  <div key={g}>
                    <div className="mb-1.5 text-[11px] font-medium text-slate-500">
                      {ATTRIBUTE_GROUP_LABELS[g]}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((a) => chip({ kind: 'attribute', key: a.key }, a.description))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Group>
        ) : null}
        <p className="text-[11px] leading-relaxed text-slate-500">
          Click a field to add it, or drag it into a slot.
        </p>
      </div>
    </div>
  );
}

function Group({
  title,
  count,
  dot,
  children,
}: {
  title: string;
  count: number;
  dot: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-2 text-left text-[13px] font-semibold text-ink"
      >
        <span className={`size-2 rounded-full ${dot}`} />
        {title}
        <span className="text-xs font-normal text-slate-500">{count}</span>
        <ChevronDown
          className={`ml-auto size-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open ? (
        title === 'Measures' ? (
          <div className="flex flex-wrap gap-1.5">{children}</div>
        ) : (
          children
        )
      ) : null}
    </section>
  );
}
