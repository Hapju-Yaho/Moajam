import { useState } from 'react';
import { useIdentity } from '../state/Identity';
import { Pressable, View, ScrollView } from 'react-native';
import { useMockAppState } from '../state/MockAppState';
import {
  useNotificationActions,
  useNotificationFeed,
  useNotificationSummary,
  type NotificationItem,
} from '../state/notifications';
import type { ScreenProps, NavigationOptions, AppRoute } from '../navigation';
import { api, serverConfigured } from '../lib/remote';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  Pill,
  PillText,
  Surface,
} from './ProductUI';
import { AppIcon, type AppIconName } from './icons';

const types: Record<string, { label: string; icon: AppIconName }> = {
  RECOMMENDATION: { label: '곡 추천', icon: 'songs' },
  SONG_ADOPTED: { label: '곡 채택', icon: 'songs' },
  SONG_OPINION: { label: '곡 의견', icon: 'message' },
  SONG_REPLY: { label: '내 의견의 답글', icon: 'message' },
  TRACK_FEEDBACK: { label: '트랙 피드백', icon: 'message' },
  PDF_SHARED: { label: 'PDF 악보', icon: 'songs' },
  SCORE_SHARED: { label: '악보 공유', icon: 'songs' },
  TRACKS_SHARED: { label: '트랙 공유', icon: 'rehearsal' },
  REHEARSAL: { label: '새 합주', icon: 'calendar' },
  REHEARSAL_UPDATED: { label: '합주 변경', icon: 'calendar' },
  REHEARSAL_CANCELLED: { label: '합주 취소', icon: 'calendar' },
  NOTICE: { label: '밴드 공지', icon: 'bell' },
};
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
function dayGroup(value: string) {
  const date = new Date(value).toDateString(),
    today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  return date === today.toDateString()
    ? '오늘'
    : date === yesterday.toDateString()
      ? '어제'
      : '이전';
}
export function Notifications({
  title = '알림',
  height,
  workspaceId,
  navigate,
  panel = false,
  onClose,
}: {
  title?: string;
  height?: number;
  workspaceId?: string;
  navigate: ScreenProps['navigate'];
  panel?: boolean;
  onClose?: () => void;
}) {
  const { workspaces } = useMockAppState();
  const currentUserId = useIdentity();
  const [band, setBand] = useState(workspaceId ?? '');
  const [unread, setUnread] = useState(false);
  const scope = panel ? band || undefined : workspaceId;
  const feed = useNotificationFeed(scope, unread),
    summary = useNotificationSummary(),
    actions = useNotificationActions();
  const [error, setError] = useState(''),
    [opening, setOpening] = useState<string | null>(null);
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const [unavailable, setUnavailable] = useState<NotificationItem | null>(null);
  const items = [
    ...new Map(
      (feed.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item]),
    ).values(),
  ];
  const unreadCount = scope
    ? (summary.data?.workspaceCounts[scope] ?? 0)
    : (summary.data?.unreadCount ?? 0);
  const go = (route: AppRoute, options?: NavigationOptions) => {
    onClose?.();
    navigate(route, options);
  };
  const open = async (item: NotificationItem) => {
    if (opening) return;
    setError('');
    setDetail(null);
    setUnavailable(null);
    setOpening(item.id);
    // Reading failure must not prevent opening the content.
    if (!item.readAt)
      void actions
        .mutateAsync({ item })
        .catch(() =>
          setError('화면은 열 수 있지만 읽음 상태를 저장하지 못했어요. 다시 시도해주세요.'),
        );
    try {
      if (item.kind === 'NOTICE' || item.kind === 'REHEARSAL_CANCELLED') {
        setDetail(item);
        return;
      }
      const target = await api<{ available: boolean }>(
        `/notifications/${item.id}/target`,
        'GET',
        undefined,
        currentUserId,
      );
      if (!target.available) {
        setUnavailable(item);
        return;
      }
      const metadata = item.metadata;
      const route: AppRoute =
        item.kind === 'RECOMMENDATION'
          ? 'recommendation'
          : item.kind.startsWith('REHEARSAL')
            ? 'rehearsals'
            : 'song';
      go(route, {
        workspaceId: item.workspaceId,
        id: item.entityId ?? undefined,
        songTab: ['PDF_SHARED', 'SCORE_SHARED'].includes(item.kind)
          ? 'scores'
          : ['TRACKS_SHARED', 'TRACK_FEEDBACK'].includes(item.kind)
            ? 'tracks'
            : 'discussion',
        focusId: metadata?.focusId,
        focusTime: metadata?.time,
        assetId: metadata?.assetId,
        feedback: item.kind === 'TRACK_FEEDBACK',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '알림을 열지 못했어요.');
    } finally {
      setOpening(null);
    }
  };
  return (
    <Surface
      style={
        panel
          ? { flex: 1, minHeight: 0, borderWidth: 0, borderRadius: 0 }
          : height
            ? { height }
            : undefined
      }
    >
      <FlexBetween>
        <FlexRow>
          <Heading>{title}</Heading>
          {unreadCount > 0 && (
            <Meta style={{ color: '#386ce4', fontWeight: '600' }}>{unreadCount}</Meta>
          )}
        </FlexRow>
        <FlexRow>
          {panel && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="알림 설정"
              onPress={() => go('settings')}
            >
              <AppIcon name="settings" size={19} color="#72819a" />
            </Pressable>
          )}
          {onClose && (
            <ActionButton secondary compact onPress={onClose}>
              닫기
            </ActionButton>
          )}
        </FlexRow>
      </FlexBetween>
      <FlexBetween style={{ flexWrap: 'wrap' }}>
        <FlexRow>
          {[false, true].map((value) => (
            <Pill
              key={String(value)}
              active={unread === value}
              accessibilityRole="button"
              accessibilityState={{ selected: unread === value }}
              onPress={() => setUnread(value)}
            >
              <PillText active={unread === value}>{value ? '읽지 않음' : '전체'}</PillText>
            </Pill>
          ))}
        </FlexRow>
        <Pressable
          accessibilityRole="button"
          disabled={actions.isPending || !unreadCount}
          onPress={() => {
            setError('');
            void actions
              .mutateAsync({ workspaceId: scope })
              .catch(() => setError('읽음 처리에 실패했어요. 다시 시도해주세요.'));
          }}
        >
          <Meta style={{ color: unreadCount ? '#386ce4' : '#94a3b8' }}>
            {scope ? '이 밴드 모두 읽음' : '모든 밴드 모두 읽음'}
          </Meta>
        </Pressable>
      </FlexBetween>
      {panel && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ gap: 6 }}
        >
          {[{ id: '', name: '모든 밴드' }, ...workspaces].map((item) => (
            <Pill
              key={item.id}
              active={band === item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: band === item.id }}
              onPress={() => {
                setBand(item.id);
                setDetail(null);
                setUnavailable(null);
              }}
            >
              <PillText active={band === item.id}>{item.name}</PillText>
            </Pill>
          ))}
        </ScrollView>
      )}
      {!!error && (
        <Meta accessibilityRole="alert" style={{ color: '#be3b4b' }}>
          {error}
        </Meta>
      )}
      {unavailable && (
        <Surface tint="#fff8ec">
          <Copy>삭제되었거나 접근할 수 없는 내용이에요.</Copy>
          <ActionButton
            secondary
            compact
            onPress={() =>
              go(unavailable.kind.startsWith('REHEARSAL') ? 'rehearsals' : 'songs', {
                workspaceId: unavailable.workspaceId,
              })
            }
          >
            관련 목록으로
          </ActionButton>
        </Surface>
      )}
      {detail && (
        <Surface tint="#f4f7ff">
          <Heading>{detail.kind === 'NOTICE' ? '밴드 공지' : '합주 취소 안내'}</Heading>
          <Copy>{detail.metadata?.title}</Copy>
          <Copy>{detail.message}</Copy>
          {detail.metadata?.date && (
            <Meta>
              {detail.metadata.date} {detail.metadata.start} · {detail.metadata.place}
            </Meta>
          )}
          <ActionButton secondary compact onPress={() => setDetail(null)}>
            목록으로
          </ActionButton>
        </Surface>
      )}
      <ScrollView
        style={panel || height ? { flex: 1, minHeight: 0 } : { maxHeight: 440 }}
        contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
      >
        {!serverConfigured ? (
          <Meta>서버 로그인 후 알림을 받을 수 있어요.</Meta>
        ) : feed.isPending ? (
          <Meta>알림 불러오는 중…</Meta>
        ) : null}
        {feed.isError && (
          <Surface>
            <Meta accessibilityRole="alert">알림을 불러오지 못했어요.</Meta>
            <ActionButton secondary compact onPress={() => void feed.refetch()}>
              다시 불러오기
            </ActionButton>
          </Surface>
        )}
        {serverConfigured && !feed.isPending && !feed.isError && !items.length && (
          <View style={{ paddingVertical: 38, alignItems: 'center', gap: 12 }}>
            <AppIcon name="bell" size={28} color="#9aa8bd" />
            <Copy>{unread ? '읽지 않은 알림이 없어요.' : '아직 도착한 알림이 없어요.'}</Copy>
            <Meta>참여곡과 합주의 새로운 소식을 여기서 확인하세요.</Meta>
          </View>
        )}
        {items.map((item, index) => {
          const type = types[item.kind] ?? types.NOTICE;
          const group = dayGroup(item.createdAt);
          return (
            <View key={item.id} style={{ gap: 8 }}>
              {(index === 0 || group !== dayGroup(items[index - 1].createdAt)) && (
                <Meta style={{ marginTop: 10, marginBottom: 3 }}>{group}</Meta>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.readAt ? '읽음' : '읽지 않음'} · ${item.message}`}
                disabled={!!opening}
                onPress={() => void open(item)}
                style={{
                  padding: 13,
                  borderRadius: 12,
                  backgroundColor: item.readAt ? '#f8fafc' : '#eef4ff',
                  flexDirection: 'row',
                  gap: 11,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: item.readAt ? '#eaf0f6' : '#dfebff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon name={type.icon} size={17} color="#5476b8" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <FlexBetween>
                    <Meta numberOfLines={1} style={{ flex: 1 }}>
                      {workspaces.find((value) => value.id === item.workspaceId)?.name ?? '밴드'} ·{' '}
                      {type.label}
                    </Meta>
                    {!item.readAt && (
                      <View
                        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#386ce4' }}
                      />
                    )}
                  </FlexBetween>
                  {!!item.metadata?.title && (
                    <Copy numberOfLines={1} style={{ fontSize: 13, fontWeight: '600' }}>
                      {item.metadata.title}
                    </Copy>
                  )}
                  <Copy numberOfLines={2} style={{ fontSize: 13, lineHeight: 19 }}>
                    {item.message}
                  </Copy>
                  {!!item.metadata?.excerpt && (
                    <Meta numberOfLines={2}>{item.metadata.excerpt}</Meta>
                  )}
                  <Meta style={{ fontSize: 11 }}>
                    {opening === item.id ? '여는 중…' : relativeTime(item.createdAt)}
                  </Meta>
                </View>
              </Pressable>
            </View>
          );
        })}
        {feed.hasNextPage && (
          <ActionButton
            secondary
            compact
            disabled={feed.isFetchingNextPage}
            onPress={() => void feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? '불러오는 중…' : '더 불러오기'}
          </ActionButton>
        )}
      </ScrollView>
    </Surface>
  );
}
