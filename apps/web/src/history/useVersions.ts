import { formatIstDateTime } from '@insightflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { DASHBOARD_KEY, SAVE_KEY, VERSIONS_KEY, type Dashboard } from '../dashboard/useDashboard';
import type { VersionDetail, VersionSummary } from './historyView';

export function useVersions(enabled: boolean) {
  return useQuery({
    queryKey: VERSIONS_KEY,
    queryFn: async () => (await api.get<{ versions: VersionSummary[] }>('/api/dashboard/versions')).versions,
    enabled,
    staleTime: 0,
  });
}

export function useVersion(id: string | null) {
  return useQuery({
    queryKey: [...VERSIONS_KEY, id],
    queryFn: () => api.get<VersionDetail>(`/api/dashboard/versions/${id}`),
    enabled: id !== null,
    // A version never changes once recorded.
    staleTime: Infinity,
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: (version: VersionSummary) =>
      api.post<{ dashboard: Dashboard; skipped: number }>(`/api/dashboard/versions/${version.id}/restore`),
    onSuccess: ({ dashboard, skipped }, version) => {
      qc.setQueryData(DASHBOARD_KEY, dashboard);
      void qc.invalidateQueries({ queryKey: VERSIONS_KEY, exact: true });
      const when = formatIstDateTime(version.createdAt);
      toast.success(`Restored the version from ${when}`, {
        description: skipped
          ? `${skipped} widget${skipped === 1 ? '' : 's'} skipped because ${skipped === 1 ? 'its' : 'their'} fields no longer exist`
          : undefined,
      });
    },
    onError: (err) => toast.error("Couldn't restore that version", { description: err.message }),
  });
}

/** Records an unfinished edit session left by a closed tab (once per page load). */
export async function closeOpenSession(): Promise<void> {
  try {
    await api.post('/api/dashboard/versions');
  } catch {
    // Best effort.
  }
}
