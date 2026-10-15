import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui/Button';
import { useMe } from './useAuth';

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-primary">
      <Spinner className="size-6" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullPageSpinner />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to="/" replace />;
  return <>{children}</>;
}
