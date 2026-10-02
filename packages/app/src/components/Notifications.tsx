import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import { Pressable, View, ScrollView } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { api, serverConfigured } from '../lib/remote';
import { Copy, FlexBetween, FlexRow, Heading, Meta, Surface } from './ProductUI';
type Notification = {
  id: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  workspaceId: string;
  kind?: string;
  entityId?: string;
};
export function Notifications({
  title = '내 알림',
  height,
  workspaceId,
  navigate,
}: {
  title?: string;
  height?: number;
  workspaceId?: string;
  navigate: ScreenProps['navigate'];
}) {
  const { workspaces } = useMockAppState();
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const mutationVersion = useRef(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(serverConfigured);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(serverConfigured);
    setItems([]);
    setError('');
    const poll = () => {
      const version = mutationVersion.current;
      return api<Notification[]>(
        `/notifications${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,
      )
        .then((items) => {
          if (active && version === mutationVersion.current) {
            setItems([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
            setError('');
          }
        })
        .catch((error: Error) => {
          if (active) setError(error.message);
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            timer = setTimeout(() => void poll(), 15000);
          }
        });
    };
    if (serverConfigured) void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspaceId]);
  const bulk = async (remove: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    ++mutationVersion.current;
    try {
      const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      await api(`/notifications${remove ? '' : '/read-all'}${query}`, remove ? 'DELETE' : 'POST');
      ++mutationVersion.current;
      setItems((all) =>
        remove
          ? []
          : all.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : '알림을 변경하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Surface style={height ? { height } : undefined}>
      <FlexBetween style={{ flexWrap: 'wrap', gap: 8 }}>
        <Heading>{title}</Heading>
        <FlexRow gap={12}>
          <Pressable
            accessibilityRole="button"
            disabled={busy || loading || !items.length}
            onPress={() => void bulk(false)}
          >
            <Meta style={{ color: busy || loading || !items.length ? '#94a3b8' : '#416bd1' }}>
              알림 전체 읽기
            </Meta>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy || loading || !items.length}
            onPress={() => void bulk(true)}
          >
            <Meta style={{ color: busy || loading || !items.length ? '#94a3b8' : '#be3b4b' }}>
              알림 전체 삭제
            </Meta>
          </Pressable>
        </FlexRow>
      </FlexBetween>
      <ScrollView
        style={height ? { flex: 1 } : { maxHeight: 440 }}
        contentContainerStyle={{ gap: 4 }}
      >
        {!serverConfigured ? (
          <Meta>서버 로그인 후 밴드 알림을 받을 수 있습니다.</Meta>
        ) : loading ? (
          <Meta>알림 불러오는 중…</Meta>
        ) : !error && !items.length ? (
          <Meta>새로운 알림이 없습니다.</Meta>
        ) : null}
        {error ? <Meta>{error}</Meta> : null}
        {items.map((item) => (
          <Pressable
            key={item.id}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${item.readAt ? '읽음' : '읽지 않음'} · ${item.message}`}
            onPress={() => {
              const open = () =>
                navigate(
                  item.kind === 'RECOMMENDATION'
                    ? 'recommendation'
                    : item.kind === 'REHEARSAL' || item.kind === 'REHEARSAL_CANCELLED'
                      ? 'rehearsals'
                      : 'home',
                  {
                    workspaceId: item.workspaceId,
                    id: item.kind === 'REHEARSAL_CANCELLED' ? undefined : item.entityId,
                  },
                );
              if (item.readAt) {
                open();
                return;
              }
              ++mutationVersion.current;
              void api(`/notifications/${item.id}/read`, 'POST')
                .then(() => {
                  ++mutationVersion.current;
                  setItems((all) =>
                    all.map((value) =>
                      value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value,
                    ),
                  );
                  open();
                })
                .catch((error: Error) => setError(error.message));
            }}
          >
            <Surface
              tint={item.readAt ? 'white' : '#eef4ff'}
              style={{ padding: 9, gap: 3, borderRadius: 8 }}
            >
              <Meta>
                {workspaces.find((band) => band.id === item.workspaceId)?.name ?? '밴드 알림'}
              </Meta>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!item.readAt && (
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#e53935' }}
                  />
                )}
                <Copy numberOfLines={2} style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                  {item.message}
                </Copy>
              </View>
              <Meta style={{ fontSize: 11, lineHeight: 14 }}>
                {new Date(item.createdAt).toLocaleString('ko-KR')} ·{' '}
                {item.readAt ? '읽음' : '읽지 않음'}
              </Meta>
            </Surface>
          </Pressable>
        ))}
      </ScrollView>
    </Surface>
  );
}
