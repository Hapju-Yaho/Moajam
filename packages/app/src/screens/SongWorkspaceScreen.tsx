import { theme } from '@moajam/ui';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { WorkspaceSyncControls } from '../components/WorkspaceSyncControls';
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
import { SongActions } from '../components/SongActions';
import { ReferenceVideo } from '../components/ReferenceVideo';
import { Discussion } from '../components/Discussion';
import { SongPdfLibrary } from '../components/SongPdfLibrary';
import { SongScoreViewer } from '../components/SongScoreViewer';
import { PracticeStudio } from '../components/PracticeStudio';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { buildAppPath, type ScreenProps, type SongTab } from '../navigation';
import { shareLink } from '../lib/platformActions';
import { SongOverview, type Arrangement } from '../components/song/SongOverview';
import { SongHistory } from '../components/song/SongHistory';
import type { SongCheck } from '../components/song/SongChecks';

const tabs = [
  ['discussion', '곡 의견'],
  ['scores', '악보 보기'],
  ['tracks', '사운드 트랙'],
  ['overview', '곡 정보·합주 기록'],
] as const;
export function SongWorkspaceScreen({
  navigate,
  entityId,
  songTab: requestedTab = 'main',
  feedback,
  focusId,
  focusTime,
  assetId,
}: ScreenProps) {
  const tab: SongTab =
    requestedTab === 'main'
      ? 'discussion'
      : requestedTab === 'resources'
        ? 'scores'
        : requestedTab === 'practice'
          ? 'tracks'
          : requestedTab === 'history'
            ? 'overview'
            : requestedTab;
  const { adoptedSongs, workspace, workspaceId, currentUserId, rehearsals } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === entityId);
  const [arrangement] = useWorkspaceValue<Arrangement>(`song/${entityId}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  const [checks, setChecks] = useWorkspaceValue<SongCheck[]>(`song/${entityId}/checks`, []);
  const [message, setMessage] = useState('');
  const { width } = useWindowDimensions();
  const wideHero = width >= 720;
  if (!song)
    return (
      <AppShell activeRoute="song" onNavigate={navigate}>
        <Surface>
          <Heading>곡을 찾을 수 없어요</Heading>
          <ActionButton onPress={() => navigate('songs', { workspaceId })}>
            참여곡 목록으로
          </ActionButton>
        </Surface>
      </AppShell>
    );
  const selectTab = (songTab: SongTab) => navigate('song', { id: song.id, workspaceId, songTab });
  const sessions = rehearsals.filter((event) => event.songIds?.includes(song.id));
  const nextSession = sessions
    .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) >= new Date())
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  return (
    <AppShell
      activeRoute="song"
      onNavigate={navigate}
      entityId={song.id}
      songTab={tab}
      hideSyncControls
    >
      <Surface>
        <WorkspaceSyncControls>
          <Meta style={{ color: theme.colors.primary }}>
            {workspace?.name} · 참여곡{song.archived ? ' · 보관됨' : ''}
          </Meta>
        </WorkspaceSyncControls>
        <View style={{ flexDirection: wideHero ? 'row' : 'column', gap: 20 }}>
          {!!song.referenceUrl && (
            <View style={{ width: 220, maxWidth: '100%', flexShrink: 0 }}>
              <ReferenceVideo
                key={song.referenceUrl}
                referenceUrl={song.referenceUrl}
                thumbnailUrl={song.thumbnailUrl}
                title={song.title}
                aspectRatio={1}
                showOriginalLink={false}
              />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
            <FlexBetween>
              <PageHeading style={{ flex: 1 }}>{song.title}</PageHeading>
              <SongActions song={song} onDeleted={() => navigate('songs', { workspaceId })} />
            </FlexBetween>
            <Copy>
              {song.artist} · 내 파트 {song.participants?.[currentUserId]?.part || '미배정'} · Key{' '}
              {arrangement.key || '미정'} · BPM {arrangement.bpm || '미정'}
            </Copy>
            <FlexRow>
              <ActionButton
                secondary
                compact
                onPress={() =>
                  void shareLink(
                    buildAppPath(
                      'song',
                      { id: song.id, workspaceId, songTab: tab },
                      { route: 'song', workspaceId },
                    ),
                  )
                    .then(() => setMessage('곡 링크를 공유했어요. 밴드 멤버만 볼 수 있어요.'))
                    .catch(() =>
                      setMessage('링크를 공유하지 못했어요. 주소창의 링크를 복사해주세요.'),
                    )
                }
              >
                곡 링크 공유
              </ActionButton>
            </FlexRow>
            {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
          </View>
        </View>
      </Surface>
      <FlexRow wrap>
        {tabs.map(([value, label]) => (
          <Pill
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === value }}
            active={tab === value}
            onPress={() => selectTab(value)}
          >
            <PillText active={tab === value}>{label}</PillText>
          </Pill>
        ))}
      </FlexRow>
      {tab === 'discussion' && (
        <>
          <FlexBetween>
            <Heading>곡 의견</Heading>
            <ActionButton secondary compact onPress={() => selectTab('tracks')}>
              시간별 피드백 →
            </ActionButton>
          </FlexBetween>
          <Discussion
            documentKey={`song/${song.id}/discussion`}
            focusId={focusId}
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
                        label: (item.text || '의견에 첨부된 자료 확인').slice(0, 2000),
                        done: false,
                        assigneeId: currentUserId,
                        sourceOpinionId: item.id,
                      },
                    ],
              );
              setMessage('준비할 일에 추가했어요. 곡 정보에서 확인할 수 있어요.');
            }}
          />
          {nextSession && (
            <Surface>
              <Heading>다음 합주</Heading>
              <Copy>{nextSession.title}</Copy>
              <Meta>
                {nextSession.date} · {nextSession.start}–{nextSession.end} ·{' '}
                {nextSession.place || '장소 미정'}
              </Meta>
              <ActionButton
                secondary
                onPress={() => navigate('rehearsals', { id: nextSession.id, workspaceId })}
              >
                합주 일정 보기
              </ActionButton>
            </Surface>
          )}
        </>
      )}
      {tab === 'scores' && (
        <>
          <Surface>
            <Heading>외부 PDF 악보</Heading>
            <Meta>파트별 PDF를 추가하고 참고하세요. PDF 원본을 음표로 편집하지는 않아요.</Meta>
            <SongPdfLibrary
              key={`${song.id}/${assetId ?? ''}`}
              songId={song.id}
              title={song.title}
              assetId={assetId}
            />
          </Surface>
          <SongScoreViewer songId={song.id} navigate={navigate} />
        </>
      )}
      {tab === 'tracks' && (
        <PracticeStudio
          key={`${workspaceId}/${song.id}`}
          scopeKey={`${workspaceId}/${song.id}`}
          bpm={Number(arrangement.bpm) || 120}
          readOnly
          feedback={feedback}
          focusId={focusId}
          focusTime={focusTime}
          onOpenEditor={() => navigate('track-editor', { id: song.id, workspaceId })}
        />
      )}
      {tab === 'overview' && (
        <>
          <SongOverview song={song} />
          <SongHistory songId={song.id} navigate={navigate} />
        </>
      )}
    </AppShell>
  );
}
