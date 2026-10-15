import { BRAND, CHART_PALETTE, isHexColor } from '@insightflow/shared';
import * as Popover from '@radix-ui/react-popover';
import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '../components/ui/Controls';
import { cn } from '../lib/cn';

export const SWATCHES = [...CHART_PALETTE, BRAND.danger, BRAND.success, '#475569', '#0F172A'];

export interface ColorPickRequest {
  title: string;
  color: string;
  /** Viewport point or element rect to anchor the popover to. */
  anchor: { x: number; y: number; width?: number; height?: number };
  isOverridden: boolean;
  onChange: (color: string | null) => void;
}

/** Colour picker anchored to a click position (preview marks) or a swatch button. */
export function ColorPopover({
  request,
  onClose,
}: {
  request: ColorPickRequest | null;
  onClose: () => void;
}) {
  const [hex, setHex] = useState('');
  useEffect(() => setHex(request?.color ?? ''), [request]);
  if (!request) return null;
  const { anchor } = request;
  const apply = (c: string | null) => {
    request.onChange(c);
    onClose();
  };
  return (
    <Popover.Root open onOpenChange={(o) => !o && onClose()}>
      <Popover.Anchor asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: anchor.x,
            top: anchor.y,
            width: anchor.width ?? 1,
            height: anchor.height ?? 1,
            pointerEvents: 'none',
          }}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          collisionPadding={12}
          className="z-[80] w-60 animate-pop-in rounded-xl border border-line bg-surface p-3 shadow-pop"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className="size-4 rounded-full ring-1 ring-black/10"
              style={{ background: request.color }}
            />
            <span className="truncate text-sm font-medium text-ink">{request.title}</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5" role="listbox" aria-label="Colours">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={c.toLowerCase() === request.color.toLowerCase()}
                aria-label={c}
                onClick={() => apply(c)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full ring-1 ring-black/10 transition-transform hover:scale-110',
                  c.toLowerCase() === request.color.toLowerCase() && 'ring-2 ring-ink ring-offset-1',
                )}
                style={{ background: c }}
              >
                {c.toLowerCase() === request.color.toLowerCase() ? (
                  <Check className="size-3.5 text-white" strokeWidth={3} />
                ) : null}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = hex.startsWith('#') ? hex : `#${hex}`;
              if (isHexColor(v)) apply(v.toUpperCase());
            }}
          >
            <Input
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              aria-label="Hex colour"
              placeholder="#0D9488"
              className="h-8 font-mono text-xs"
            />
            <button
              type="submit"
              disabled={!isHexColor(hex.startsWith('#') ? hex : `#${hex}`)}
              className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-white disabled:opacity-40"
            >
              Apply
            </button>
          </form>
          {request.isOverridden ? (
            <button
              type="button"
              onClick={() => apply(null)}
              className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <RotateCcw className="size-3" /> Reset to default
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
