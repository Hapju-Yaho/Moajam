import { useNotificationFocus } from '../lib/useNotificationFocus';
import { useEffect, useState } from 'react';
import { useIdentity } from '../state/Identity';
import { Image, Pressable, View } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { Input } from '../styles/layout';
import { ActionButton, Copy, FlexRow, Meta, Pill, PillText, Surface } from './ProductUI';
import { usePreferences } from '../state/preferences';
import { AppIcon } from './icons';
import { CommentInput } from './CommentInput';
import { VideoInput, VideoThumbnail } from './VideoAttachment';
import { parseVideoUrl } from '../lib/video';
type Reply = { id: string; authorId: string; text: string; date: string; videoUrl?: string };
type Opinion = Reply & { resolved: boolean; likes: string[]; replies: Reply[]; time?: number };
const oldestFirst = (a: { date?: string }, b: { date?: string }) =>
  (Date.parse(a.date ?? '') || 0) - (Date.parse(b.date ?? '') || 0);
export type DiscussionOptions = {
  onCreateTask?: (item: { id: string; text: string }) => void;
  linkedOpinionIds?: string[];
};
export function Discussion({
  documentKey,
  onCreateTask,
  linkedOpinionIds = [],
  focusId,
  timeline,
  legacyDocumentKey,
  showOpinions = true,
}: {
  documentKey: string;
  onCreateTask?: (item: { id: string; text: string }) => void;
  linkedOpinionIds?: string[];
  focusId?: string;
  timeline?: { position: number; onSeek: (time: number) => void };
  legacyDocumentKey?: string;
  showOpinions?: boolean;
}) {
  const currentUserId = useIdentity();
  const preferences = usePreferences();
  const { members, canManage } = useMockAppState();
  const [stored, setItems] = useWorkspaceValue<Opinion[]>(documentKey, []);
  const [legacy, setLegacy] = useWorkspaceValue<Opinion[]>(
    legacyDocumentKey ?? `${documentKey}/timeline`,
    [],
  );
  const legacyIds = new Set(
    legacy
      .filter((item) => !stored.some((current) => current.id === item.id))
      .map((item) => item.id),
  );
  const items = [...stored, ...legacy.filter((item) => legacyIds.has(item.id))]
    .map((item) => ({
      ...item,
      date: item.date ?? new Date(0).toISOString(),
      likes: item.likes ?? [],
      replies: item.replies ?? [],
      resolved: item.resolved ?? false,
    }))
    .sort(oldestFirst);
  const focusExists = items.some(
    (item) => item.id === focusId || item.replies.some((reply) => reply.id === focusId),
  );
  useNotificationFocus(focusId ? `discussion-${focusId}` : undefined, focusExists);
  const [draft, setDraft] = useState('');
  const [attachTime, setAttachTime] = useState(false);
  const timeLabel = (time: number) =>
    `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  const [videoUrl, setVideoUrl] = useState('');
  const [editVideo, setEditVideo] = useState('');
  const [replyVideo, setReplyVideo] = useState('');
  const [filter, setFilter] = useState('전체');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const author = (id: string) => members.find((member) => member.id === id)?.name ?? '탈퇴한 멤버';
  const photo = (id: string) =>
    id === currentUserId ? preferences.photo : members.find((member) => member.id === id)?.photo;
  const update = (id: string, changes: Partial<Opinion>) => {
    const setter = legacyIds.has(id) ? setLegacy : setItems;
    setter((all) => all.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };
  const visible = timeline
    ? items
    : items.filter(
        (item) =>
          (filter === '전체' ||
            (filter === '내 의견'
              ? item.authorId === currentUserId
              : item.resolved === (filter === '결정됨'))) &&
          `${item.text} ${author(item.authorId)} ${item.replies.map((r) => r.text).join(' ')}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      );
  return (
    <>
      {showOpinions && (
        <>
          {!timeline && (
            <>
              <Input
                accessibilityLabel="의견 검색"
                value={query}
                onChangeText={setQuery}
                placeholder="의견, 답글 또는 작성자 검색"
              />
              <FlexRow wrap>
                {['전체', '논의 중', '결정됨', '내 의견'].map((value) => (
                  <Pill
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === value }}
                    active={filter === value}
                    onPress={() => setFilter(value)}
                  >
                    <PillText active={filter === value}>{value}</PillText>
                  </Pill>
                ))}
              </FlexRow>
              <Meta>표시 중 {visible.length}개</Meta>
            </>
          )}
          {focusId && !focusExists && <Meta>해당 의견이 삭제되었거나 아직 불러오는 중이에요.</Meta>}
          {visible.map((item, index) => (
            <Surface
              key={item.id}
              nativeID={`discussion-${item.id}`}
              tint={focusId === item.id ? '#e4efff' : index % 2 === 0 ? '#f7f9fc' : '#eef3f9'}
              style={focusId === item.id ? { borderColor: '#5986ed', borderWidth: 2 } : undefined}
            >
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 16 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
                  <FlexRow wrap>
                    <CommentPhoto name={author(item.authorId)} photo={photo(item.authorId)} />
                    <Copy>{author(item.authorId)}</Copy>
                    <Meta>
                      {legacyIds.has(item.id) && !legacy.find((note) => note.id === item.id)?.date
                        ? '기존 피드백'
                        : new Date(item.date).toLocaleString('ko-KR')}
                    </Meta>
                    {item.resolved ? <Meta>결정됨</Meta> : null}
                  </FlexRow>
                  {editing === item.id ? (
                    <>
                      <Input multiline value={editText} onChangeText={setEditText} />
                      <VideoInput value={editVideo} onChange={setEditVideo} />
                      <ActionButton
                        disabled={
                          (!editText.trim() && !editVideo.trim()) ||
                          (!!editVideo.trim() && !parseVideoUrl(editVideo))
                        }
                        onPress={() => {
                          update(item.id, {
                            text: editText.trim(),
                            videoUrl: parseVideoUrl(editVideo)?.url,
                          });
                          setEditing(null);
                        }}
                      >
                        수정 저장
                      </ActionButton>
                      <ActionButton secondary onPress={() => setEditing(null)}>
                        취소
                      </ActionButton>
                    </>
                  ) : (
                    <FlexRow style={{ alignItems: 'flex-start' }}>
                      {timeline && typeof item.time === 'number' && Number.isFinite(item.time) && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${timeLabel(item.time)} 구간으로 이동`}
                          onPress={() => timeline.onSeek(item.time!)}
                          style={{ paddingVertical: 2 }}
                        >
                          <Copy style={{ color: '#2563eb', fontWeight: '600' }}>
                            {timeLabel(item.time)}
                          </Copy>
                        </Pressable>
                      )}
                      <Copy style={{ flex: 1 }}>{item.text}</Copy>
                    </FlexRow>
                  )}

                  <FlexRow wrap>
                    <ActionButton
                      secondary
                      compact
                      onPress={() =>
                        update(item.id, {
                          likes: item.likes.includes(currentUserId)
                            ? item.likes.filter((id) => id !== currentUserId)
                            : [...item.likes, currentUserId],
                        })
                      }
                    >
                      <Copy style={{ color: '#e53935' }}>♥ {item.likes.length}</Copy>
                    </ActionButton>
                    <ActionButton
                      secondary
                      compact
                      onPress={() => {
                        setReplyTo(replyTo === item.id ? null : item.id);
                        setReply('');
                        setReplyVideo('');
                      }}
                    >
                      답글 {item.replies.length}
                    </ActionButton>
                    {item.resolved && onCreateTask && (
                      <ActionButton
                        secondary
                        compact
                        disabled={linkedOpinionIds.includes(item.id)}
                        onPress={() => onCreateTask(item)}
                      >
                        {linkedOpinionIds.includes(item.id) ? '할 일에 연결됨' : '할 일로 만들기'}
                      </ActionButton>
                    )}
                    {item.authorId === currentUserId ? (
                      <ActionButton
                        secondary
                        compact
                        onPress={() => {
                          setEditing(item.id);
                          setEditText(item.text);
                          setEditVideo(item.videoUrl ?? '');
                        }}
                      >
                        수정
                      </ActionButton>
                    ) : null}
                    {canManage || item.authorId === currentUserId ? (
                      <ActionButton
                        secondary
                        compact
                        onPress={() =>
                          (legacyIds.has(item.id) ? setLegacy : setItems)((all) =>
                            all.filter((value) => value.id !== item.id),
                          )
                        }
                      >
                        삭제
                      </ActionButton>
                    ) : null}
                  </FlexRow>
                </View>
                {editing !== item.id && item.videoUrl && (
                  <View style={{ justifyContent: 'center' }}>
                    <VideoThumbnail value={item.videoUrl} compact />
                  </View>
                )}
              </View>
              {[...item.replies].sort(oldestFirst).map((r) => (
                <View
                  key={r.id}
                  nativeID={`discussion-${r.id}`}
                  style={{
                    padding: 12,
                    backgroundColor: focusId === r.id ? '#e4efff' : '#f5f7fb',
                    borderRadius: 8,
                    borderWidth: focusId === r.id ? 2 : 0,
                    borderColor: '#5986ed',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 16 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
                      <FlexRow>
                        <CommentPhoto name={author(r.authorId)} photo={photo(r.authorId)} />
                        <Meta>{author(r.authorId)}</Meta>
                      </FlexRow>
                      <FlexRow style={{ alignItems: 'flex-start' }}>
                        <Copy style={{ flex: 1 }}>{r.text}</Copy>
                      </FlexRow>

                      {r.authorId === currentUserId || canManage ? (
                        <ActionButton
                          secondary
                          compact
                          onPress={() =>
                            update(item.id, { replies: item.replies.filter((v) => v.id !== r.id) })
                          }
                        >
                          답글 삭제
                        </ActionButton>
                      ) : null}
                    </View>
                    {r.videoUrl && (
                      <View style={{ justifyContent: 'center' }}>
                        <VideoThumbnail value={r.videoUrl} compact />
                      </View>
                    )}
                  </View>
                </View>
              ))}
              {replyTo === item.id ? (
                <>
                  <Input value={reply} onChangeText={setReply} placeholder="답글 입력" />
                  <VideoInput value={replyVideo} onChange={setReplyVideo} />
                  <ActionButton
                    disabled={
                      (!reply.trim() && !replyVideo.trim()) ||
                      (!!replyVideo.trim() && !parseVideoUrl(replyVideo))
                    }
                    onPress={() => {
                      update(item.id, {
                        replies: [
                          ...item.replies,
                          {
                            id: `reply-${Date.now()}`,
                            authorId: currentUserId,
                            text: reply.trim(),
                            videoUrl: parseVideoUrl(replyVideo)?.url,
                            date: new Date().toISOString(),
                          },
                        ],
                      });
                      setReply('');
                      setReplyVideo('');
                      setReplyTo(null);
                    }}
                  >
                    답글 등록
                  </ActionButton>
                </>
              ) : null}
            </Surface>
          ))}
          {!visible.length ? (
            <Meta>
              {items.length
                ? '조건에 맞는 의견이 없어요. 검색어나 필터를 바꿔보세요.'
                : '첫 의견을 남겨보세요. 의견과 결정은 화면을 이동해도 유지됩니다.'}
            </Meta>
          ) : null}
        </>
      )}
      <Surface>
        <FlexRow style={{ alignItems: 'flex-start' }}>
          <View style={{ paddingTop: 5 }}>
            <CommentPhoto name={preferences.name} photo={preferences.photo} />
          </View>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              position: 'relative',
              borderWidth: 1,
              borderColor: '#dce4ef',
              borderRadius: 12,
            }}
          >
            <CommentInput value={draft} onChange={setDraft} />
            {(!!draft.trim() || !!videoUrl.trim()) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="의견 보내기"
                style={{
                  position: 'absolute',
                  right: 6,
                  bottom: 6,
                  width: 30,
                  height: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: '#2563eb',
                }}
                disabled={
                  (!draft.trim() && !videoUrl.trim()) ||
                  (!!videoUrl.trim() && !parseVideoUrl(videoUrl))
                }
                onPress={() => {
                  setItems((all) => [
                    {
                      id: `opinion-${Date.now()}`,
                      authorId: currentUserId,
                      text: draft.trim(),
                      videoUrl: parseVideoUrl(videoUrl)?.url,
                      date: new Date().toISOString(),
                      resolved: false,
                      likes: [],
                      replies: [],
                      ...(attachTime && timeline ? { time: timeline.position } : {}),
                    },
                    ...all,
                  ]);
                  setDraft('');
                  setVideoUrl('');
                }}
              >
                <AppIcon name="send" size={18} color="white" />
              </Pressable>
            )}
          </View>
        </FlexRow>
        <VideoInput value={videoUrl} onChange={setVideoUrl}>
          {timeline && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: attachTime }}
                onPress={() => setAttachTime((value) => !value)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 11,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: attachTime ? '#b9cdfc' : '#dce3ee',
                  backgroundColor: attachTime ? '#edf4ff' : '#f3f4f6',
                }}
              >
                <Copy
                  style={{
                    color: attachTime ? '#2563eb' : '#8490a2',
                    fontSize: 13,
                    fontWeight: '500',
                  }}
                >
                  {attachTime ? '✓ ' : ''}현재 재생 위치 첨부 · {timeLabel(timeline.position)}
                </Copy>
              </Pressable>
            </>
          )}
        </VideoInput>
      </Surface>
    </>
  );
}

function CommentPhoto({ name, photo }: { name: string; photo?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#e8eef8',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photo && !failed ? (
        <Image
          source={{ uri: photo }}
          accessibilityLabel={`${name} 프로필 사진`}
          onError={() => setFailed(true)}
          style={{ width: 32, height: 32 }}
        />
      ) : (
        <Meta>{name.slice(-2)}</Meta>
      )}
    </View>
  );
}
