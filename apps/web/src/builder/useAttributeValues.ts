import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useAttributeValues(key: string | null) {
  return useQuery({
    queryKey: ['attribute-values', key],
    queryFn: () =>
      api.get<{ values: string[] }>(`/api/catalog/attributes/${key}/values`).then((r) => r.values),
    enabled: Boolean(key),
    staleTime: 10 * 60_000,
  });
}
