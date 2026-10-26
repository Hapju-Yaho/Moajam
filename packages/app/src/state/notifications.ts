import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api, serverConfigured } from '../lib/remote';
import { useIdentity } from './Identity';
export type NotificationItem = {
  id: string;
  workspaceId: string;
  kind: string;
  entityId?: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
  metadata?: {
    title?: string;
    actorName?: string;
    excerpt?: string;
    focusId?: string;
    parentId?: string;
    time?: number;
    assetId?: string;
    projectId?: string;
    date?: string;
    start?: string;
    place?: string;
    changed?: string[];
  } | null;
};
type Page = { items: NotificationItem[]; nextCursor: string | null };
type Summary = { unreadCount: number; workspaceCounts: Record<string, number> };
export function useNotificationSummary() {
  const user = useIdentity();
  return useQuery({
    queryKey: ['notifications', user, 'summary'],
    queryFn: () => api<Summary>('/notifications/summary', 'GET', undefined, user),
    enabled: serverConfigured,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
export function useNotificationFeed(workspaceId?: string, unread = false) {
  const user = useIdentity();
  return useInfiniteQuery({
    queryKey: ['notifications', user, 'feed', workspaceId ?? '', unread],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (workspaceId) params.set('workspaceId', workspaceId);
      if (unread) params.set('unread', 'true');
      if (pageParam) params.set('cursor', pageParam);
      return api<Page>(`/notifications/inbox?${params}`, 'GET', undefined, user);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: serverConfigured,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
export function useNotificationActions() {
  const user = useIdentity(),
    client = useQueryClient();
  return useMutation({
    mutationKey: ['notifications', user, 'read'],
    mutationFn: async (action: { item?: NotificationItem; workspaceId?: string }) => {
      const result = action.item
        ? await api<{ count: number }>(
            `/notifications/${action.item.id}/read`,
            'POST',
            undefined,
            user,
          )
        : await api<{ count: number }>(
            `/notifications/read-all${action.workspaceId ? `?workspaceId=${encodeURIComponent(action.workspaceId)}` : ''}`,
            'POST',
            undefined,
            user,
          );
      return { ...action, changedCount: result.count };
    },
    onSuccess: async (action) => {
      await client.cancelQueries({ queryKey: ['notifications', user] });
      // Patch every cached filter/page so home, panel and badge agree immediately.
      for (const [key, data] of client.getQueriesData<InfiniteData<Page>>({
        queryKey: ['notifications', user, 'feed'],
      })) {
        if (!data) continue;
        client.setQueryData(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items
              .map((item) =>
                (
                  action.item
                    ? item.id === action.item.id
                    : !action.workspaceId || item.workspaceId === action.workspaceId
                )
                  ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
                  : item,
              )
              .filter((item) => !key[4] || !item.readAt),
          })),
        });
      }
      client.setQueryData<Summary>(['notifications', user, 'summary'], (previous) => {
        if (!previous) return previous;
        const workspaceCounts = { ...previous.workspaceCounts };
        if (action.item) {
          if (action.changedCount > 0)
            workspaceCounts[action.item.workspaceId] = Math.max(
              0,
              (workspaceCounts[action.item.workspaceId] ?? 0) - 1,
            );
        } else if (action.workspaceId) workspaceCounts[action.workspaceId] = 0;
        else for (const id of Object.keys(workspaceCounts)) workspaceCounts[id] = 0;
        return {
          workspaceCounts,
          unreadCount: Object.values(workspaceCounts).reduce((sum, count) => sum + count, 0),
        };
      });
      await client.invalidateQueries({ queryKey: ['notifications', user] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['notifications', user] });
    },
  });
}
