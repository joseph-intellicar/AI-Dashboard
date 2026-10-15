import { cn } from '../../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" fill="#0F766E" />
      <path
        d="M8 21.5 13 16l4 3.5L24 11"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="11" r="2.4" fill="#F59E0B" />
    </svg>
  );
}

export function Logo({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="hidden leading-tight sm:block">
        <div className="text-[15px] font-semibold tracking-tight text-ink">InsightFlow</div>
        {subtitle ? <div className="text-[11px] font-medium text-muted">Nivora Home</div> : null}
      </div>
    </div>
  );
}
