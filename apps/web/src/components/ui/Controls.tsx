import * as Popover from '@radix-ui/react-popover';
import * as Switch from '@radix-ui/react-switch';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  forwardRef,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

export function Toggle({
  checked,
  onCheckedChange,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: ReactNode;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
      <span>{label}</span>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-primary"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fieldClass =
  'h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-500 transition-colors hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none disabled:bg-slate-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldClass, className)} {...rest} />;
});

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldClass, 'pl-8')}
      />
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldClass, 'appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      {children}
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function MultiSelect({
  values,
  options,
  onChange,
  placeholder = 'Select values',
  label,
  loading,
}: {
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  label: string;
  loading?: boolean;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase())),
    [options, q],
  );
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const summary =
    values.length === 0 ? placeholder : values.length <= 2 ? values.join(', ') : `${values.length} selected`;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(fieldClass, 'flex items-center justify-between text-left')}
        >
          <span className={cn('truncate', values.length === 0 && 'text-slate-500')}>{summary}</span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-56 animate-pop-in rounded-xl border border-line bg-surface p-2 shadow-pop"
        >
          <SearchInput value={q} onChange={setQ} placeholder="Search…" label={`Search ${label}`} />
          <div role="listbox" aria-multiselectable className="mt-2 max-h-56 overflow-auto">
            {loading ? <div className="px-2 py-3 text-sm text-muted">Loading…</div> : null}
            {!loading && shown.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted">No matches</div>
            ) : null}
            {shown.map((o) => {
              const selected = values.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggle(o)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      selected ? 'border-primary bg-primary text-white' : 'border-slate-300',
                    )}
                  >
                    {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              );
            })}
          </div>
          {values.length ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted hover:bg-slate-100"
            >
              Clear selection
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
