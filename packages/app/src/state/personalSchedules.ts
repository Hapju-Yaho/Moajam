import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIdentity } from './Identity';
import { loadPreferences, savePreferences } from './preferencesStorage';
import { api, serverConfigured } from '../lib/remote';
import type { Rehearsal } from '../mocks/workspaces';

export function usePersonalSchedules() {
  const user = useIdentity();
  const client = useQueryClient();
  const key = ['personal-schedules', user];
  const scope = `schedules/${user}`;
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Rehearsal[]> => {
      if (serverConfigured) return api('/me/schedules', 'GET', undefined, user);
      const stored = loadPreferences(scope).events;
      return Array.isArray(stored) ? (stored as Rehearsal[]) : [];
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ event, remove }: { event: Rehearsal; remove?: boolean }) => {
      await client.cancelQueries({ queryKey: key });
      if (serverConfigured) {
        await api(
          `/me/schedules/${encodeURIComponent(event.id)}`,
          remove ? 'DELETE' : 'PUT',
          remove ? undefined : { value: event },
          user,
        );
      } else {
        const stored = loadPreferences(scope).events;
        const events = (Array.isArray(stored) ? (stored as Rehearsal[]) : []).filter(
          (item) => item.id !== event.id,
        );
        savePreferences({ events: remove ? events : [...events, event] }, scope);
      }
      client.setQueryData<Rehearsal[]>(key, (previous = []) => {
        const events = previous.filter((item) => item.id !== event.id);
        return remove ? events : [...events, event];
      });
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return {
    events: query.data ?? [],
    error: query.error,
    loading: query.isPending,
    save: (event: Rehearsal) => mutation.mutateAsync({ event }),
    remove: (event: Rehearsal) => mutation.mutateAsync({ event, remove: true }),
  };
}
