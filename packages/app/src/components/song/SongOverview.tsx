import { useState } from 'react';
import { View } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../../state/MockAppState';
import type { WorkspaceSong } from '../../mocks/workspaces';
import { Input, Label } from '../../styles/layout';
import { parseVideoUrl } from '../../lib/video';
import { ActionButton, Copy, FlexBetween, FlexRow, Heading, Meta, Surface } from '../ProductUI';
import { SongChecks } from './SongChecks';
export type Arrangement = { key: string; bpm: string; structure: string };
export function SongOverview({ song }: { song: WorkspaceSong }) {
  const { canManage, members, updateSong } = useMockAppState();
  const [arrangement, setArrangement] = useWorkspaceValue<Arrangement>(
    `song/${song.id}/arrangement`,
    { key: '', bpm: '', structure: '' },
  );
  const [editing, setEditing] = useState(false);
  const [parts, setParts] = useState(false);
  const [draft, setDraft] = useState({
    title: song.title,
    artist: song.artist,
    goal: song.goal ?? '',
    referenceUrl: song.referenceUrl ?? '',
    ...arrangement,
  });
  const [error, setError] = useState('');
  return (
    <>
      <Surface>
        <FlexBetween>
          <Heading>곡 정보와 편곡</Heading>
          {canManage && !editing && (
            <ActionButton
              secondary
              compact
              onPress={() => {
                setDraft({
                  title: song.title,
                  artist: song.artist,
                  goal: song.goal ?? '',
                  referenceUrl: song.referenceUrl ?? '',
                  ...arrangement,
                });
                setEditing(true);
                setError('');
              }}
            >
              곡 정보 편집
            </ActionButton>
          )}
        </FlexBetween>
        {!editing ? (
          <>
            <Copy>
              {song.title} · {song.artist}
            </Copy>
            <Meta>
              밴드 기준 · Key {arrangement.key || '미정'} · BPM {arrangement.bpm || '미정'}
            </Meta>
            <Label>우리의 연주 목표</Label>
            <Copy>{song.goal || '아직 정해진 목표가 없어요.'}</Copy>
            <Label>곡 구성과 편곡</Label>
            <Copy>
              {arrangement.structure ||
                'Intro / Verse / Chorus처럼 곡의 흐름과 편곡 방향을 기록해보세요.'}
            </Copy>
            {!canManage && <Meta>곡 정보와 편곡은 밴드 관리자가 수정할 수 있어요.</Meta>}
          </>
        ) : (
          <>
            {(
              [
                ['title', '곡 제목'],
                ['artist', '아티스트'],
                ['goal', '우리의 연주 목표'],
                ['key', '곡 Key'],
                ['bpm', '밴드 기준 BPM'],
                ['structure', '곡 구성과 편곡'],
                ['referenceUrl', '대표 영상 링크'],
              ] as const
            ).map(([field, label]) => (
              <View key={field} style={{ gap: 6 }}>
                <Label>{label}</Label>
                <Input
                  accessibilityLabel={label}
                  value={draft[field]}
                  onChangeText={(value) =>
                    setDraft((previous) => ({ ...previous, [field]: value }))
                  }
                  multiline={field === 'goal' || field === 'structure'}
                  style={
                    field === 'goal' || field === 'structure'
                      ? { minHeight: 90, textAlignVertical: 'top' }
                      : undefined
                  }
                />
              </View>
            ))}
            {!!error && <Meta accessibilityRole="alert">{error}</Meta>}
            <FlexRow>
              <ActionButton
                onPress={() => {
                  if (
                    !draft.title.trim() ||
                    !draft.artist.trim() ||
                    (draft.bpm !== '' &&
                      (!/^\d+$/.test(draft.bpm) ||
                        Number(draft.bpm) < 30 ||
                        Number(draft.bpm) > 300))
                  ) {
                    setError('제목과 아티스트를 입력하고 BPM은 30~300으로 설정해주세요.');
                    return;
                  }
                  if (draft.referenceUrl.trim() && !parseVideoUrl(draft.referenceUrl)) {
                    setError('재생 가능한 YouTube, Vimeo 또는 영상 파일 링크를 입력해주세요.');
                    return;
                  }
                  updateSong(song.id, {
                    title: draft.title.trim(),
                    artist: draft.artist.trim(),
                    goal: draft.goal.trim(),
                    referenceUrl: parseVideoUrl(draft.referenceUrl)?.url ?? '',
                    ...(draft.referenceUrl !== song.referenceUrl
                      ? { thumbnailUrl: parseVideoUrl(draft.referenceUrl)?.thumbnail }
                      : {}),
                  });
                  setArrangement({
                    key: draft.key.trim(),
                    bpm: draft.bpm,
                    structure: draft.structure.trim(),
                  });
                  setEditing(false);
                }}
              >
                변경 적용
              </ActionButton>
              <ActionButton secondary onPress={() => setEditing(false)}>
                취소
              </ActionButton>
            </FlexRow>
          </>
        )}
      </Surface>
      <Surface>
        <FlexBetween>
          <Heading>참여 멤버와 파트</Heading>
          {canManage && (
            <ActionButton secondary compact onPress={() => setParts(!parts)}>
              {parts ? '파트 편집 닫기' : '파트 배정 편집'}
            </ActionButton>
          )}
        </FlexBetween>
        {members.map((member) => {
          const part = song.participants?.[member.id];
          return (
            <View
              key={member.id}
              style={{ gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#edf1f6' }}
            >
              <FlexBetween>
                <Copy>{member.name}</Copy>
                <Meta>
                  {part
                    ? `${part.part || '파트 미정'} · ${part.status === 'READY' ? '준비 완료' : part.status === 'PRACTICING' ? '연습 중' : '준비 전'}`
                    : '미참여'}
                </Meta>
              </FlexBetween>
              {parts && canManage && (
                <FlexRow wrap>
                  {part && (
                    <Input
                      accessibilityLabel={`${member.name} 곡 파트`}
                      value={part.part}
                      style={{ flex: 1, minWidth: 100 }}
                      onChangeText={(value) =>
                        updateSong(song.id, {
                          participants: {
                            ...song.participants,
                            [member.id]: { ...part, part: value },
                          },
                        })
                      }
                    />
                  )}
                  <ActionButton
                    secondary
                    compact
                    onPress={() => {
                      const participants = { ...song.participants };
                      if (part) delete participants[member.id];
                      else participants[member.id] = { part: member.part, status: 'NOT_READY' };
                      updateSong(song.id, { participants });
                    }}
                  >
                    {part ? '참여 해제' : '참여 배정'}
                  </ActionButton>
                </FlexRow>
              )}
            </View>
          );
        })}
      </Surface>
      <SongChecks songId={song.id} />
      {canManage && (
        <Surface>
          <Heading>곡 보관</Heading>
          <Meta>보관하면 활동 중인 곡 목록에서 제외됩니다. 의견과 자료는 유지돼요.</Meta>
          <ActionButton secondary onPress={() => updateSong(song.id, { archived: !song.archived })}>
            {song.archived ? '연습 재개' : '보관함으로 이동'}
          </ActionButton>
        </Surface>
      )}
    </>
  );
}
