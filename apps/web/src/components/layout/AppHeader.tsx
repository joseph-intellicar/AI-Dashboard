import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';

/** Sticky app header: logo · page controls · user menu. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">{children}</div>
        <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
