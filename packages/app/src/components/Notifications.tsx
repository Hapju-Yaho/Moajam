import { ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { api, serverConfigured } from '../lib/remote';
import { ActionButton, Copy, Heading, Meta, Surface } from './ProductUI';
type Notification = { id: string; message: string; readAt: string | null; createdAt: string };
export function Notifications({
  title = '내 알림',
  height,
  workspaceId,
}: {
  title?: string;
  height?: number;
  workspaceId?: string;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(serverConfigured);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(serverConfigured);
    setItems([]);
    setError('');
    const poll = () =>
      api<Notification[]>(
        `/notifications${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`,
      )
        .then((items) => {
          if (active) {
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
    if (serverConfigured) void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspaceId]);
  return (
    <Surface style={height ? { height } : undefined}>
      <Heading>{title}</Heading>
      <ScrollView
        style={height ? { flex: 1 } : { maxHeight: 440 }}
        contentContainerStyle={{ gap: 12 }}
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
          <Surface key={item.id} tint={item.readAt ? 'white' : '#eef4ff'}>
            <Copy>{item.message}</Copy>
            <Meta>{new Date(item.createdAt).toLocaleString('ko-KR')}</Meta>
            {!item.readAt ? (
              <ActionButton
                secondary
                compact
                onPress={() =>
                  void api(`/notifications/${item.id}/read`, 'POST')
                    .then(() =>
                      setItems((all) =>
                        all.map((value) =>
                          value.id === item.id
                            ? { ...value, readAt: new Date().toISOString() }
                            : value,
                        ),
                      ),
                    )
                    .catch((error: Error) => setError(error.message))
                }
              >
                읽음으로 표시
              </ActionButton>
            ) : null}
          </Surface>
        ))}
      </ScrollView>
    </Surface>
  );
}
