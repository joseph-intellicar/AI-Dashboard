import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ApiError, setUnauthorizedHandler } from './api/client';
import { clearAllChats } from './ai/chatStore';
import { ME_KEY } from './auth/useAuth';
import { FullPageSpinner, RedirectIfAuthed, RequireAuth } from './auth/RequireAuth';
import { TooltipProvider } from './components/ui/Tooltip';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

const UiPage = import.meta.env.DEV ? lazy(() => import('./pages/UiPage')) : null;
const DevWidgetsPage = import.meta.env.DEV ? lazy(() => import('./pages/DevWidgetsPage')) : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 0) && count < 1,
    },
  },
});

export function App() {
  useEffect(() => {
    // Session expired or logged out elsewhere: drop everything and let the guard redirect to /login.
    setUnauthorizedHandler(() => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, null);
      clearAllChats();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <LoginPage />
                </RedirectIfAuthed>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            {UiPage ? (
              <Route
                path="/ui"
                element={
                  <Suspense fallback={<FullPageSpinner />}>
                    <UiPage />
                  </Suspense>
                }
              />
            ) : null}
            {DevWidgetsPage ? (
              <Route
                path="/dev/widgets"
                element={
                  <RequireAuth>
                    <Suspense fallback={<FullPageSpinner />}>
                      <DevWidgetsPage />
                    </Suspense>
                  </RequireAuth>
                }
              />
            ) : null}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        {/* Lifted above the floating "Ask AI" button. */}
        <Toaster position="bottom-right" offset={{ bottom: 96, right: 24 }} richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
