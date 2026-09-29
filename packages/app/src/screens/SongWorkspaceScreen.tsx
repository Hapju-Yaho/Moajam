import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  CheckItem,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Progress,
  ProgressValue,
  Surface,
  ResponsiveGrid,
  Stack,
} from '../components/ProductUI';
import { ReferenceVideo } from '../components/ReferenceVideo';
import { Discussion } from '../components/Discussion';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { songTabs, buildAppPath, type ScreenProps, type SongTab } from '../navigation';
import { shareLink } from '../lib/platformActions';
import { SongOverview, type Arrangement } from '../components/song/SongOverview';
import { SongResources, type SongLink } from '../components/song/SongResources';
import { SongHistory } from '../components/song/SongHistory';
import { PreparationControl, SongPractice } from '../components/song/SongPractice';
import type { SongCheck } from '../components/song/SongChecks';

const labels: Record<SongTab, string> = {
  main: '메인',
  overview: '개요',
  discussion: '의견',
  resources: '자료',
  practice: '연습',
  history: '합주 기록',
};
export function SongWorkspaceScreen({ navigate, entityId, songTab = 'main' }: ScreenProps) {
  const { width } = useWindowDimensions();
  const { adoptedSongs, workspaceId, members, currentUserId, rehearsals, syncStatus } =
    useMockAppState();
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
  const [links] = useWorkspaceValue<SongLink[]>(`song/${entityId}/links`, []);
  const [message, setMessage] = useState('');
  const [showVideo, setShowVideo] = useState(false);
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
  const pending = checks
    .filter((item) => !item.done)
    .sort(
      (a, b) => Number(b.assigneeId === currentUserId) - Number(a.assigneeId === currentUserId),
    );
  const decisions = opinions.filter((item) => item.resolved);
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
        <FlexRow wrap>
          <PageHeading>{song.title}</PageHeading>
          <Pill>
            <PillText>
              {song.archived
                ? '보관 중'
                : !song.total
                  ? '파트 배정 필요'
                  : song.status === 'READY'
                    ? '합주 준비 완료'
                    : '함께 연습 중'}
            </PillText>
          </Pill>
        </FlexRow>
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
        <ResponsiveGrid stacked={width < 900}>
          <Stack style={{ flex: 1.35 }}>
            <Surface tint="#f5f7ff">
              <Heading>지금 준비할 것</Heading>
              <PreparationControl song={song} />
              <Meta>
                남은 할 일 {pending.length}개 · 내 담당{' '}
                {pending.filter((item) => item.assigneeId === currentUserId).length}개
              </Meta>
              {pending.slice(0, 3).map((item) => (
                <View key={item.id} style={{ gap: 4 }}>
                  <CheckItem
                    checked={false}
                    label={item.label}
                    onPress={() =>
                      setChecks((all) =>
                        all.map((value) =>
                          value.id === item.id ? { ...value, done: true } : value,
                        ),
                      )
                    }
                  />
                  <Meta>
                    {members.find((member) => member.id === item.assigneeId)?.name ??
                      '담당자 미지정'}
                  </Meta>
                </View>
              ))}
              {!pending.length && (
                <Copy>
                  {checks.length
                    ? '등록된 할 일을 모두 마쳤어요.'
                    : '개요에서 다음 합주까지 할 일을 정해보세요.'}
                </Copy>
              )}
              <ActionButton secondary onPress={() => selectTab('overview')}>
                개요·할 일 관리 →
              </ActionButton>
            </Surface>
            {width < 900 && upcomingCard}
            <Surface>
              <Heading>우리의 연주 방향</Heading>
              <Copy>{song.goal || song.reason || '개요에서 이 곡의 연주 목표를 정해보세요.'}</Copy>
              <Meta>{arrangement.structure || '아직 정해진 곡 구성과 편곡이 없어요.'}</Meta>
              {!!song.referenceUrl && (
                <>
                  <ActionButton secondary onPress={() => setShowVideo(!showVideo)}>
                    {showVideo ? '대표 영상 접기' : '대표 영상 보기'}
                  </ActionButton>
                  {showVideo && (
                    <ReferenceVideo
                      referenceUrl={song.referenceUrl}
                      thumbnailUrl={song.thumbnailUrl}
                      title={song.title}
                    />
                  )}
                </>
              )}
            </Surface>
            <Surface>
              <Heading>최근 결정과 의견</Heading>
              <Meta>
                결정 {decisions.length}개 · 전체 의견 {opinions.length}개 · 자료 링크 {links.length}
                개
              </Meta>
              {(decisions.length ? decisions : opinions).slice(0, 3).map((item) => (
                <View key={item.id} style={{ gap: 4 }}>
                  <Meta>
                    {item.resolved ? '결정됨' : '논의 중'}
                    {item.videoUrl ? ' · 영상 첨부' : ''}
                  </Meta>
                  <Copy numberOfLines={2}>{item.text || '영상으로 남긴 의견'}</Copy>
                </View>
              ))}
              {!opinions.length && (
                <Copy>아직 의견이 없어요. 편곡 아이디어나 참고 영상을 나눠보세요.</Copy>
              )}
              <ActionButton secondary onPress={() => selectTab('discussion')}>
                의견 이어가기 →
              </ActionButton>
            </Surface>
          </Stack>
          <Stack style={{ flex: 1 }}>
            {width >= 900 && upcomingCard}
            <Surface>
              <Heading>팀 준비 현황</Heading>
              <Copy>
                {song.ready} / {song.total} 파트 준비 완료
              </Copy>
              <Progress>
                <ProgressValue value={song.total ? (song.ready / song.total) * 100 : 0} />
              </Progress>
              {members
                .filter((member) => song.participants?.[member.id])
                .map((member) => {
                  const part = song.participants![member.id];
                  return (
                    <FlexBetween key={member.id}>
                      <Copy>{member.name}</Copy>
                      <Meta>
                        {part.part || '파트 미정'} ·{' '}
                        {part.status === 'READY'
                          ? '준비 완료'
                          : part.status === 'PRACTICING'
                            ? '연습 중'
                            : '준비 전'}
                      </Meta>
                    </FlexBetween>
                  );
                })}
              {!song.total && <Meta>개요에서 참여 멤버와 파트를 배정해주세요.</Meta>}
              <ActionButton secondary onPress={() => selectTab('overview')}>
                파트 배정 보기 →
              </ActionButton>
            </Surface>
          </Stack>
        </ResponsiveGrid>
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
      {songTab === 'resources' && <SongResources songId={song.id} navigate={navigate} />}
      {songTab === 'practice' && <SongPractice song={song} />}
      {songTab === 'history' && <SongHistory songId={song.id} navigate={navigate} />}
    </AppShell>
  );
}
