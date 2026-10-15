import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { clearAllChats } from '../ai/chatStore';
import { ApiError, api } from '../api/client';

export interface User {
  id: string;
  email: string;
  name: string;
}

export const ME_KEY = ['me'] as const;

/** The logged-in user, or null when there is no session. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/api/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<{ user: User }>('/api/auth/login', body),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(ME_KEY, user);
      navigate('/', { replace: true });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post<void>('/api/auth/logout'),
    onSettled: () => {
      // Wipe every cached query so the next user on this browser never sees this user's data.
      qc.clear();
      qc.setQueryData(ME_KEY, null);
      // Insight AI conversations never outlive the session (REQUIREMENTS §17.11).
      clearAllChats();
      navigate('/login', { replace: true });
    },
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
