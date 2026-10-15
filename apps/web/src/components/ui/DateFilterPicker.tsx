import {
  PRESETS,
  PRESET_LABELS,
  formatShortDate,
  resolveDateFilter,
  todayIst,
  validateCustomRange,
  type DateFilter,
} from '@insightflow/shared';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DayPicker, type DateRange as PickerRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '../../lib/cn';
import { Button } from './Button';

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) =>
  new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

export interface DateFilterPickerProps {
  value: DateFilter;
  onChange: (f: DateFilter) => void;
  /** Extra option rendered above the presets (e.g. "Use dashboard filter"). */
  extra?: { label: string; active: boolean; onSelect: () => void };
  triggerLabel?: ReactNode;
  align?: 'start' | 'end';
  fullWidth?: boolean;
}

export function DateFilterPicker({
  value,
  onChange,
  extra,
  triggerLabel,
  align = 'start',
  fullWidth,
}: DateFilterPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<PickerRange | undefined>(
    value.preset === 'custom' ? { from: fromIso(value.from), to: fromIso(value.to) } : undefined,
  );
  const [showCalendar, setShowCalendar] = useState(value.preset === 'custom');
  const resolved = resolveDateFilter(value);
  const today = fromIso(todayIst());

  const customError =
    custom?.from && custom.to
      ? validateCustomRange(toIso(custom.from), toIso(custom.to))
      : 'Pick a start and end date';

  const choose = (f: DateFilter) => {
    onChange(f);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50',
            fullWidth && 'w-full justify-between',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-primary" />
            <span className="truncate">{triggerLabel ?? resolved.label}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className="z-[70] flex max-w-[calc(100vw-32px)] animate-pop-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:flex-row"
        >
          <div className="flex flex-col p-1.5 sm:w-48 sm:border-r sm:border-line">
            {extra ? (
              <>
                <PresetButton
                  active={extra.active}
                  onClick={() => {
                    extra.onSelect();
                    setOpen(false);
                  }}
                >
                  {extra.label}
                </PresetButton>
                <div className="my-1 h-px bg-line" />
              </>
            ) : null}
            {PRESETS.map((p) => (
              <PresetButton
                key={p}
                active={!extra?.active && value.preset === p && !showCalendar}
                onClick={() => choose({ preset: p })}
              >
                {PRESET_LABELS[p]}
              </PresetButton>
            ))}
            <PresetButton active={!extra?.active && showCalendar} onClick={() => setShowCalendar(true)}>
              Custom…
            </PresetButton>
          </div>
          {showCalendar ? (
            <div className="p-3">
              <DayPicker
                mode="range"
                selected={custom}
                onSelect={setCustom}
                disabled={{ after: today }}
                defaultMonth={custom?.from ?? today}
                weekStartsOn={1}
                className="text-sm [--rdp-accent-background-color:var(--color-primary-soft)] [--rdp-accent-color:var(--color-primary)] [--rdp-day-height:34px] [--rdp-day-width:34px] [--rdp-day_button-height:32px] [--rdp-day_button-width:32px]"
              />
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-xs text-muted">
                  {custom?.from ? formatShortDate(toIso(custom.from)) : '—'} –{' '}
                  {custom?.to ? formatShortDate(toIso(custom.to)) : '—'}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={Boolean(customError)}
                  title={customError ?? undefined}
                  onClick={() =>
                    custom?.from &&
                    custom.to &&
                    choose({ preset: 'custom', from: toIso(custom.from), to: toIso(custom.to) })
                  }
                >
                  Apply
                </Button>
              </div>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-primary-soft font-medium text-primary' : 'text-ink hover:bg-slate-100',
      )}
    >
      {children}
    </button>
  );
}
