import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button, IconButton } from './Button';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'full';
  /** Called instead of closing on Esc / overlay click (e.g. to confirm discarding changes). */
  onRequestClose?: () => void;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  onRequestClose,
  className,
}: ModalProps) {
  const intercept = onRequestClose
    ? (e: Event) => {
        e.preventDefault();
        onRequestClose();
      }
    : undefined;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-900/40 backdrop-blur-[2px]" />
        <Dialog.Content
          onEscapeKeyDown={intercept}
          onPointerDownOutside={intercept}
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed z-50 flex animate-pop-in flex-col bg-surface shadow-pop focus:outline-none',
            size === 'full'
              ? 'inset-0 sm:inset-[3vh_2.5vw] sm:rounded-2xl'
              : 'top-1/2 left-1/2 max-h-[85vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl',
            size === 'sm' && 'max-w-sm',
            size === 'md' && 'max-w-lg',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : null}
            </div>
            <IconButton
              label="Close"
              size="sm"
              onClick={() => (onRequestClose ? onRequestClose() : onOpenChange(false))}
            >
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-slate-900/40" />
        <Dialog.Content
          role="alertdialog"
          className="fixed top-1/2 left-1/2 z-[61] w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-2xl bg-surface p-5 shadow-pop focus:outline-none"
        >
          <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted">{description ?? ' '}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant={tone}
              autoFocus
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
