import { useState } from 'react';
import { useIdentity } from '../state/Identity';
import { View } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { Input } from '../styles/layout';
import { ActionButton, Copy, FlexRow, Heading, Meta, Pill, PillText, Surface } from './ProductUI';
import { ReferenceVideo } from './ReferenceVideo';
import { parseVideoUrl } from '../lib/video';
type Reply = { id: string; authorId: string; text: string; date: string; videoUrl?: string };
type Opinion = Reply & { resolved: boolean; likes: string[]; replies: Reply[] };
export function Discussion({
  documentKey,
  onCreateTask,
  linkedOpinionIds = [],
}: {
  documentKey: string;
  onCreateTask?: (item: { id: string; text: string }) => void;
  linkedOpinionIds?: string[];
}) {
  const currentUserId = useIdentity();
  const { members, canManage } = useMockAppState();
  const [stored, setItems] = useWorkspaceValue<Opinion[]>(documentKey, []);
  const items = stored.map((item) => ({
    ...item,
    date: item.date ?? new Date(0).toISOString(),
    likes: item.likes ?? [],
    replies: item.replies ?? [],
    resolved: item.resolved ?? false,
  }));
  const [draft, setDraft] = useState('');
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
  const update = (id: string, changes: Partial<Opinion>) =>
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  const visible = items.filter(
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
      <Surface>
        <Heading>의견 남기기</Heading>
        <Input
          multiline
          accessibilityLabel="의견 내용"
          maxLength={20000}
          style={{ minHeight: 110, textAlignVertical: 'top' }}
          value={draft}
          onChangeText={setDraft}
          placeholder="편곡, 톤, 연주 방식에 대한 의견"
        />
        <VideoInput value={videoUrl} onChange={setVideoUrl} />
        <ActionButton
          disabled={
            (!draft.trim() && !videoUrl.trim()) || (!!videoUrl.trim() && !parseVideoUrl(videoUrl))
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
              },
              ...all,
            ]);
            setDraft('');
            setVideoUrl('');
          }}
        >
          등록
        </ActionButton>
        <Meta>
          의견 {items.length} · 결정 {items.filter((item) => item.resolved).length} · 참여{' '}
          {
            new Set(
              items.flatMap((item) => [item.authorId, ...item.replies.map((r) => r.authorId)]),
            ).size
          }
          명
        </Meta>
      </Surface>
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
      {visible.map((item) => (
        <Surface key={item.id}>
          <FlexRow wrap>
            <Copy>{author(item.authorId)}</Copy>
            <Meta>{new Date(item.date).toLocaleString('ko-KR')}</Meta>
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
            <Copy>{item.text}</Copy>
          )}
          {editing !== item.id && item.videoUrl && (
            <ReferenceVideo
              key={item.videoUrl}
              referenceUrl={item.videoUrl}
              title={`${author(item.authorId)}의 의견 영상`}
            />
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
              ♥ {item.likes.length}
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
            {canManage ? (
              <ActionButton
                secondary
                compact
                onPress={() => update(item.id, { resolved: !item.resolved })}
              >
                {item.resolved ? '다시 논의' : '결정으로 표시'}
              </ActionButton>
            ) : null}
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
                onPress={() => setItems((all) => all.filter((value) => value.id !== item.id))}
              >
                삭제
              </ActionButton>
            ) : null}
          </FlexRow>
          {item.replies.map((r) => (
            <View key={r.id} style={{ padding: 12, backgroundColor: '#f5f7fb', borderRadius: 8 }}>
              <Meta>{author(r.authorId)}</Meta>
              <Copy>{r.text}</Copy>
              {r.videoUrl && (
                <ReferenceVideo
                  referenceUrl={r.videoUrl}
                  title={`${author(r.authorId)}의 답글 영상`}
                />
              )}
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
  );
}

function VideoInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const video = parseVideoUrl(value);
  return (
    <>
      <Input
        accessibilityLabel="첨부 영상 링크"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        placeholder="영상 링크 (선택): YouTube, Vimeo, MP4 / WebM / MOV"
      />
      {!!value.trim() && !video && (
        <Meta accessibilityRole="alert">지원하는 영상 주소를 입력해주세요.</Meta>
      )}
      {video && (
        <ReferenceVideo key={video.url} referenceUrl={video.url} title="첨부 영상 미리보기" />
      )}
    </>
  );
}
