import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { AppIcon } from '../components/icons';
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
  Surface,
} from '../components/ProductUI';
import { SongActions } from '../components/SongActions';
import { ReferenceVideo } from '../components/ReferenceVideo';
import { SongPdfLibrary } from '../components/SongPdfLibrary';
import { PracticeStudio } from '../components/PracticeStudio';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { buildAppPath, type ScreenProps, type SongTab } from '../navigation';
import { shareLink } from '../lib/platformActions';
import { SongOverview, type Arrangement } from '../components/song/SongOverview';
import { SongHistory } from '../components/song/SongHistory';
import type { SongCheck } from '../components/song/SongChecks';

export function SongWorkspaceScreen({
  navigate,
  entityId,
  songTab: requestedTab = 'main',
  feedback,
  focusId,
  focusTime,
  assetId,
  projectId,
}: ScreenProps) {
  const tab: SongTab =
    requestedTab === 'resources'
      ? 'scores'
      : requestedTab === 'practice'
        ? 'tracks'
        : requestedTab === 'history'
          ? 'overview'
          : requestedTab;
  const { adoptedSongs, workspaceId, currentUserId, rehearsals } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === entityId);
  const [arrangement] = useWorkspaceValue<Arrangement>(`song/${entityId}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  const [checks, setChecks] = useWorkspaceValue<SongCheck[]>(`song/${entityId}/checks`, []);
  const [message, setMessage] = useState('');
  const [overviewOpen, setOverviewOpen] = useState(tab === 'overview');
  useEffect(() => {
    setOverviewOpen(tab === 'overview');
  }, [entityId, tab, focusId]);
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
      <WorkspaceSyncControls>
        <ActionButton secondary compact onPress={() => navigate('songs', { workspaceId })}>
          곡 변경
        </ActionButton>
      </WorkspaceSyncControls>
      <Surface>
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
                openExternally
              />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
            <FlexBetween style={{ flexWrap: 'wrap', gap: 12 }}>
              <PageHeading style={{ flex: 1 }}>{song.title}</PageHeading>
              <FlexRow wrap>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="곡 링크 공유"
                  onPress={() =>
                    void shareLink(
                      buildAppPath(
                        'song',
                        { id: song.id, workspaceId },
                        { route: 'song', workspaceId },
                      ),
                    )
                      .then(() => setMessage('곡 링크를 공유했어요. 밴드 멤버만 볼 수 있어요.'))
                      .catch(() =>
                        setMessage('링크를 공유하지 못했어요. 주소창의 링크를 복사해주세요.'),
                      )
                  }
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#dce3ee',
                  }}
                >
                  <AppIcon name="share" size={18} color="#566b8c" />
                </Pressable>
                <SongActions song={song} onDeleted={() => navigate('songs', { workspaceId })} />
              </FlexRow>
            </FlexBetween>
            <Copy>
              {song.artist} · 내 파트 {song.participants?.[currentUserId]?.part || '미배정'} · Key{' '}
              {arrangement.key || '미정'} · BPM {arrangement.bpm || '미정'}
            </Copy>
            <FlexRow wrap>
              <SongPdfLibrary
                key={`${song.id}/${assetId ?? ''}`}
                songId={song.id}
                title={song.title}
                assetId={assetId}
                buttonLabel="악보 보기"
                initialOpen={tab === 'scores'}
              />
              <ActionButton
                secondary
                compact
                onPress={() => navigate('band-score-editor', { id: song.id, workspaceId })}
              >
                악보 작업
              </ActionButton>
            </FlexRow>
            {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: overviewOpen }}
              onPress={() => setOverviewOpen((open) => !open)}
              style={{
                alignSelf: 'flex-end',
                marginTop: 'auto',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingTop: 10,
              }}
            >
              <View style={{ transform: [{ rotate: overviewOpen ? '180deg' : '0deg' }] }}>
                <AppIcon name="chevron-down" size={18} color="#566b8c" />
              </View>
              <Meta>{overviewOpen ? '곡 정보·합주 기록 닫기' : '곡 정보·합주 기록 보기'}</Meta>
            </Pressable>
          </View>
        </View>

        {overviewOpen && (
          <>
            <SongOverview song={song} />
            <SongHistory songId={song.id} navigate={navigate} />
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
      </Surface>
      <PracticeStudio
        requestedProjectId={projectId}
        discussionInitiallyOpen={tab === 'discussion'}
        discussionOptions={{
          linkedOpinionIds: checks
            .map((item) => item.sourceOpinionId)
            .filter((id): id is string => !!id),
          onCreateTask: (item) => {
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
          },
        }}
        key={`${workspaceId}/${song.id}`}
        scopeKey={`${workspaceId}/${song.id}`}
        bpm={Number(arrangement.bpm) || 120}
        feedback={feedback}
        focusId={focusId}
        focusTime={focusTime}
      />
    </AppShell>
  );
}
