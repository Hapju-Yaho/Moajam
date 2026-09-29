import { useState } from 'react';
import { View } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../../state/MockAppState';
import type { Rehearsal } from '../../mocks/workspaces';
import type { ScreenProps } from '../../navigation';
import { Input } from '../../styles/layout';
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
} from '../ProductUI';
export function SongHistory({
  songId,
  navigate,
}: {
  songId: string;
  navigate: ScreenProps['navigate'];
}) {
  const { rehearsals, canManage, saveRehearsal } = useMockAppState();
  const [filter, setFilter] = useState('예정');
  const sessions = rehearsals.filter((event) => event.songIds?.includes(songId));
  const state = (event: Rehearsal) =>
    event.cancelled
      ? '취소'
      : new Date(`${event.date}T${event.end}`) < new Date()
        ? '완료'
        : '예정';
  const visible = sessions
    .filter((event) => state(event) === filter)
    .sort(
      (a, b) =>
        (filter === '예정' ? 1 : -1) * `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
    );
  const candidates = rehearsals
    .filter((event) => state(event) === '예정' && !event.songIds?.includes(songId))
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  return (
    <>
      <Surface>
        <Heading>이 곡의 합주 기록</Heading>
        <Meta>예정된 합주를 준비하고, 완료한 합주는 곡별 회고로 남겨요.</Meta>
        <FlexRow wrap>
          {['예정', '완료', '취소'].map((value) => (
            <Pill
              key={value}
              accessibilityRole="button"
              active={filter === value}
              onPress={() => setFilter(value)}
            >
              <PillText active={filter === value}>
                {value} {sessions.filter((event) => state(event) === value).length}
              </PillText>
            </Pill>
          ))}
        </FlexRow>
      </Surface>
      {visible.map((event) => (
        <SessionCard
          key={event.id}
          event={event}
          songId={songId}
          navigate={navigate}
          completed={filter === '완료'}
        />
      ))}
      {!visible.length && (
        <Surface>
          <Copy>{filter}된 합주가 없어요.</Copy>
          <Meta>합주의 세트리스트에 이 곡을 추가하면 이곳에서도 확인할 수 있어요.</Meta>
        </Surface>
      )}
      {canManage && !!candidates.length && (
        <Surface>
          <Heading>예정된 합주에 이 곡 추가</Heading>
          {candidates.map((event) => (
            <FlexRow wrap key={event.id}>
              <View style={{ flex: 1 }}>
                <Copy>{event.title}</Copy>
                <Meta>
                  {event.date} · {event.start} · {event.place}
                </Meta>
              </View>
              <ActionButton
                secondary
                compact
                onPress={() => {
                  saveRehearsal({ ...event, songIds: [...(event.songIds ?? []), songId] });
                  setFilter('예정');
                }}
              >
                이 곡 추가
              </ActionButton>
            </FlexRow>
          ))}
        </Surface>
      )}
      <ActionButton secondary onPress={() => navigate('rehearsals')}>
        밴드 합주 전체 보기
      </ActionButton>
    </>
  );
}
function SessionCard({
  event,
  songId,
  navigate,
  completed,
}: {
  event: Rehearsal;
  songId: string;
  navigate: ScreenProps['navigate'];
  completed: boolean;
}) {
  const { workspace, workspaceId } = useMockAppState();
  const [memo, setMemo] = useWorkspaceValue(`song/${songId}/session/${event.id}/memo`, '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo);
  const sharedMemo = workspace?.documents?.[`session/${event.id}/memo`];
  return (
    <Surface>
      <FlexBetween>
        <Heading>{event.title}</Heading>
        <Meta>{event.date}</Meta>
      </FlexBetween>
      <Meta>
        {event.start}–{event.end} · {event.place || '장소 미정'}
      </Meta>
      {!!event.goal && <Copy>목표 · {event.goal}</Copy>}
      {typeof sharedMemo === 'string' && !!sharedMemo && (
        <>
          <Meta>합주 전체 메모</Meta>
          <Copy numberOfLines={3}>{sharedMemo}</Copy>
        </>
      )}
      {completed && (
        <>
          <Heading style={{ fontSize: 15 }}>이 곡의 회고</Heading>
          {editing ? (
            <>
              <Input
                accessibilityLabel={`${event.title} 곡별 회고`}
                multiline
                value={draft}
                onChangeText={setDraft}
                maxLength={50000}
                style={{ minHeight: 130, textAlignVertical: 'top' }}
                placeholder="잘 맞았던 부분, 다음에 보완할 부분을 적어주세요."
              />
              <FlexRow>
                <ActionButton
                  compact
                  onPress={() => {
                    setMemo(draft.trim());
                    setEditing(false);
                  }}
                >
                  회고 적용
                </ActionButton>
                <ActionButton secondary compact onPress={() => setEditing(false)}>
                  취소
                </ActionButton>
              </FlexRow>
            </>
          ) : (
            <>
              <Copy>{memo || '아직 회고가 없어요.'}</Copy>
              <ActionButton
                secondary
                compact
                onPress={() => {
                  setDraft(memo);
                  setEditing(true);
                }}
              >
                {memo ? '곡별 회고 수정' : '곡별 회고 작성'}
              </ActionButton>
            </>
          )}
        </>
      )}
      <ActionButton secondary onPress={() => navigate('rehearsals', { id: event.id, workspaceId })}>
        녹음·참석·전체 기록 보기 →
      </ActionButton>
    </Surface>
  );
}
