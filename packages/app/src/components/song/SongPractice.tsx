import { useState } from 'react';
import { Platform } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../../state/MockAppState';
import type { WorkspaceSong } from '../../mocks/workspaces';
import { PracticeStudio } from '../PracticeStudio';
import { ActionButton, Copy, FlexRow, Heading, Meta, Pill, PillText, Surface } from '../ProductUI';
import { Input } from '../../styles/layout';
import type { Arrangement } from './SongOverview';
export function PreparationControl({ song }: { song: WorkspaceSong }) {
  const { currentUserId, workspaceId, updatePreparation } = useMockAppState();
  const participant = song.participants?.[currentUserId];
  return (
    <>
      <Copy>내 파트 · {participant?.part || (participant ? '파트 미정' : '미참여')}</Copy>
      {participant ? (
        <FlexRow wrap>
          {(['NOT_READY', 'PRACTICING', 'READY'] as const).map((status, index) => (
            <Pill
              key={status}
              accessibilityRole="button"
              accessibilityState={{ selected: participant.status === status }}
              active={participant.status === status}
              onPress={() => updatePreparation(workspaceId, song.id, status)}
            >
              <PillText active={participant.status === status}>
                {['준비 전', '연습 중', '준비 완료'][index]}
              </PillText>
            </Pill>
          ))}
        </FlexRow>
      ) : (
        <Meta>
          아직 참여 파트가 없어요. 밴드 관리자에게 배정을 요청해주세요. 개인 연습은 바로 시작할 수
          있어요.
        </Meta>
      )}
    </>
  );
}
export function SongPractice({ song }: { song: WorkspaceSong }) {
  const { workspaceId, canManage, updateSong } = useMockAppState();
  const [arrangement] = useWorkspaceValue<Arrangement>(`song/${song.id}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  const [bpm, setBpm] = useState(arrangement.bpm || '120');
  const valid = /^\d+$/.test(bpm) && Number(bpm) >= 30 && Number(bpm) <= 300;
  return (
    <>
      <Surface>
        <Heading>내 연습 준비</Heading>
        <PreparationControl song={song} />
        {song.archived && (
          <>
            <Meta>보관 중인 곡이에요. 기존 자료로 개인 연습을 이어갈 수 있어요.</Meta>
            {canManage && (
              <ActionButton secondary onPress={() => updateSong(song.id, { archived: false })}>
                밴드 연습 재개
              </ActionButton>
            )}
          </>
        )}
        <Meta>
          밴드 기준 · Key {arrangement.key || '미정'} · BPM {arrangement.bpm || '미정'}
        </Meta>
        {Platform.OS === 'web' && (
          <>
            <FlexRow wrap>
              <Copy>이번 연습 BPM</Copy>
              <Input
                accessibilityLabel="이번 연습 BPM"
                keyboardType="numeric"
                maxLength={3}
                value={bpm}
                onChangeText={setBpm}
                style={{ width: 88 }}
              />
              {arrangement.bpm && (
                <ActionButton secondary compact onPress={() => setBpm(arrangement.bpm)}>
                  밴드 기준 가져오기
                </ActionButton>
              )}
            </FlexRow>
            <Meta>
              {valid
                ? '연습 BPM은 내 메트로놈에만 적용돼요. 밴드 기준은 개요에서 관리해요.'
                : 'BPM은 30~300으로 입력해주세요. 입력 중에는 120 BPM을 사용해요.'}
            </Meta>
          </>
        )}
      </Surface>
      <PracticeStudio
        key={`${workspaceId}/${song.id}`}
        scopeKey={`${workspaceId}/${song.id}`}
        bpm={valid ? Number(bpm) : 120}
      />
    </>
  );
}
