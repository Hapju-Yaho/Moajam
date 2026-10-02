import { SongActions } from '../components/SongActions';
import { Pressable } from 'react-native';
import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '../components/ProductUI';
import { ReferenceVideo } from '../components/ReferenceVideo';
import { Discussion } from '../components/Discussion';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { songTabs, buildAppPath, type ScreenProps, type SongTab } from '../navigation';
import { shareLink } from '../lib/platformActions';
import { SongOverview, type Arrangement } from '../components/song/SongOverview';
import { SongHistory } from '../components/song/SongHistory';
import { SongPractice } from '../components/song/SongPractice';
import type { SongCheck } from '../components/song/SongChecks';

const labels: Record<SongTab, string> = {
  main: '메인',
  overview: '개요',
  discussion: '의견',
  resources: '자료',
  practice: '연습',
  history: '합주 기록',
};
export function SongWorkspaceScreen({
  navigate,
  entityId,
  songTab: requestedTab = 'main',
}: ScreenProps) {
  const songTab = requestedTab === 'resources' ? 'main' : requestedTab;
  const { adoptedSongs, workspaceId, currentUserId, rehearsals, syncStatus } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === entityId);
  const [opinions] = useWorkspaceValue<
    { id: string; text: string; resolved?: boolean; videoUrl?: string }[]
  >(`song/${entityId}/discussion`, []);
  const [arrangement] = useWorkspaceValue<Arrangement>(`song/${entityId}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  const [checks, setChecks] = useWorkspaceValue<SongCheck[]>(`song/${entityId}/checks`, []);
  const [message, setMessage] = useState('');
  if (!song)
    return (
      <AppShell activeRoute="song" onNavigate={navigate}>
        <Surface>
          <Heading>곡을 찾을 수 없어요</Heading>
          <ActionButton onPress={() => navigate('songs')}>참여 곡 목록으로</ActionButton>
        </Surface>
      </AppShell>
    );
  const selectTab = (tab: SongTab) =>
    navigate(tab === 'practice' ? 'practice' : 'song', { id: song.id, workspaceId, songTab: tab });
  const sessions = rehearsals.filter((event) => event.songIds?.includes(song.id));
  const nextSession = sessions
    .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) >= new Date())
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const upcomingCard = (
    <Surface>
      <Heading>다음 합주</Heading>
      {nextSession ? (
        <>
          <Copy>{nextSession.title}</Copy>
          <Meta>
            {nextSession.date} · {nextSession.start}–{nextSession.end}
          </Meta>
          <Meta>{nextSession.place || '장소 미정'}</Meta>
          {!!nextSession.goal && <Copy>{nextSession.goal}</Copy>}
          <ActionButton
            secondary
            onPress={() => navigate('rehearsals', { id: nextSession.id, workspaceId })}
          >
            합주 일정 보기 →
          </ActionButton>
        </>
      ) : (
        <Copy>이 곡이 포함된 예정 합주가 없어요.</Copy>
      )}
      <ActionButton secondary onPress={() => selectTab('history')}>
        합주 연결·기록 보기 →
      </ActionButton>
    </Surface>
  );
  return (
    <AppShell activeRoute="song" onNavigate={navigate}>
      <Surface>
        <FlexBetween>
          <ActionButton secondary compact onPress={() => navigate('songs', { workspaceId })}>
            ← 참여 곡 목록
          </ActionButton>
          <Meta accessibilityLiveRegion="polite">{syncStatus}</Meta>
        </FlexBetween>
        <FlexBetween style={{ gap: 16 }}>
          <PageHeading style={{ flex: 1, minWidth: 0 }}>{song.title}</PageHeading>
          <SongActions song={song} onDeleted={() => navigate('songs', { workspaceId })} />
        </FlexBetween>
        <Copy>
          {song.artist} · Key {arrangement.key || '미정'} · BPM {arrangement.bpm || '미정'}
        </Copy>
        <FlexRow wrap>
          <ActionButton onPress={() => selectTab('practice')}>이 곡 연습하기</ActionButton>
          <ActionButton
            secondary
            onPress={() =>
              void shareLink(
                buildAppPath(
                  'song',
                  { id: song.id, workspaceId, songTab },
                  { route: 'song', workspaceId },
                ),
              )
                .then(() => setMessage('현재 탭 링크를 공유했어요. 밴드 멤버만 열 수 있어요.'))
                .catch(() => setMessage('공유하지 못했어요. 주소창의 링크를 복사해주세요.'))
            }
          >
            현재 탭 공유
          </ActionButton>
        </FlexRow>
        {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
        <FlexRow wrap>
          {songTabs
            .filter((tab) => tab !== 'resources')
            .filter((tab) => tab !== 'practice')
            .map((tab) => (
              <Pill
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: songTab === tab }}
                active={songTab === tab}
                onPress={() => selectTab(tab)}
              >
                <PillText active={songTab === tab}>
                  {labels[tab]}
                  {tab === 'discussion'
                    ? ` ${opinions.length}`
                    : tab === 'history'
                      ? ` ${sessions.length}`
                      : ''}
                </PillText>
              </Pill>
            ))}
        </FlexRow>
      </Surface>
      {songTab === 'main' && (
        <>
          <Surface>
            <Heading>곡 레퍼런스</Heading>
            <ReferenceVideo
              referenceUrl={song.referenceUrl}
              thumbnailUrl={song.thumbnailUrl}
              title={song.title}
            />
            <Copy>{song.goal || song.reason || '함께 연주할 방향을 이야기해보세요.'}</Copy>
          </Surface>
          <FlexBetween>
            <Heading>곡 전체 의견</Heading>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('practice', { id: song.id, workspaceId, feedback: true })}
            >
              <Meta style={{ color: '#416bd1' }}>곡 세부 피드백 하러가기</Meta>
            </Pressable>
          </FlexBetween>
          <Discussion documentKey={`song/${song.id}/discussion`} />
          {upcomingCard}
        </>
      )}
      {songTab === 'overview' && <SongOverview song={song} />}
      {songTab === 'discussion' && (
        <Discussion
          documentKey={`song/${song.id}/discussion`}
          linkedOpinionIds={checks
            .map((item) => item.sourceOpinionId)
            .filter((id): id is string => !!id)}
          onCreateTask={(item) => {
            setChecks((all) =>
              all.some((check) => check.sourceOpinionId === item.id)
                ? all
                : [
                    ...all,
                    {
                      id: `check-${Date.now()}`,
                      label: (item.text || '의견에 첨부된 영상 확인').slice(0, 2000),
                      done: false,
                      assigneeId: currentUserId,
                      sourceOpinionId: item.id,
                    },
                  ],
            );
            setMessage('개요의 할 일에 추가했어요. 담당자를 변경할 수 있어요.');
          }}
        />
      )}
      {songTab === 'practice' && <SongPractice song={song} />}
      {songTab === 'history' && <SongHistory songId={song.id} navigate={navigate} />}
    </AppShell>
  );
}
