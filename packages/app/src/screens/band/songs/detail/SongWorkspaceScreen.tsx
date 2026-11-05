import styledNative from '@emotion/native';
import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { AppIcon } from '@component/shared/icons';
import { WorkspaceSyncControls } from '@component/shared/layout/WorkspaceSyncControls';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Surface,
} from '@component/shared/ui/ProductUI';
import { SongActions } from '@component/song-detail/SongActions';
import { SongAudioPlayer } from '@component/shared/media/SongAudioPlayer';
import { ReferenceVideo } from '@component/shared/media/ReferenceVideo';
import { BandSongPractice } from '@component/song-detail/BandSongPractice';
import { useMockAppState, useWorkspaceValue } from '@state/MockAppState';
import { buildAppPath, type ScreenProps, type SongTab } from '@app/navigation';
import { shareLink } from '@lib/platformActions';
import { SongOverview, type Arrangement } from '@component/song-detail/SongOverview';
import { SongHistory } from '@component/song-detail/SongHistory';
import type { SongCheck } from '@component/song-detail/SongChecks';

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
      <>
        <Surface>
          <Heading>곡을 찾을 수 없어요</Heading>
          <ActionButton onPress={() => navigate('songs', { workspaceId })}>
            참여곡 목록으로
          </ActionButton>
        </Surface>
      </>
    );
  const sessions = rehearsals.filter((event) => event.songIds?.includes(song.id));
  const nextSession = sessions
    .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) >= new Date())
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  return (
    <>
      <WorkspaceSyncControls>
        <ActionButton secondary compact onPress={() => navigate('songs', { workspaceId })}>
          곡 변경
        </ActionButton>
      </WorkspaceSyncControls>
      <Surface>
        <SongWorkspaceScreenContainer $wideHero={wideHero}>
          {!!song.referenceUrl && (
            <SongWorkspaceScreenContainer2>
              <ReferenceVideo
                key={song.referenceUrl}
                referenceUrl={song.referenceUrl}
                thumbnailUrl={song.thumbnailUrl}
                title={song.title}
                aspectRatio={1}
                showOriginalLink={false}
                openExternally
              />
            </SongWorkspaceScreenContainer2>
          )}
          <SongWorkspaceScreenContainer3>
            <SongWorkspaceScreenHeader>
              <SongWorkspaceScreenPageHeading>{song.title}</SongWorkspaceScreenPageHeading>
              <FlexRow wrap>
                <SongWorkspaceScreenButton
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
                >
                  <AppIcon name="share" size={18} color="#566b8c" />
                </SongWorkspaceScreenButton>
                <SongActions song={song} onDeleted={() => navigate('songs', { workspaceId })} />
              </FlexRow>
            </SongWorkspaceScreenHeader>
            <Copy>{song.artist}</Copy>
            {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
            <SongWorkspaceScreenContainer4>
              <SongAudioPlayer songId={song.id} />
            </SongWorkspaceScreenContainer4>
            <SongWorkspaceScreenContainer5>
              <SongWorkspaceScreenButton2
                accessibilityRole="button"
                accessibilityState={{ expanded: overviewOpen }}
                onPress={() => setOverviewOpen((open) => !open)}
              >
                <SongWorkspaceScreenContainer6 $overviewOpen={overviewOpen}>
                  <AppIcon name="chevron-down" size={18} color="#566b8c" />
                </SongWorkspaceScreenContainer6>
                <Meta>{overviewOpen ? '곡 정보·합주 기록 닫기' : '곡 정보·합주 기록 보기'}</Meta>
              </SongWorkspaceScreenButton2>
            </SongWorkspaceScreenContainer5>
          </SongWorkspaceScreenContainer3>
        </SongWorkspaceScreenContainer>

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
      <BandSongPractice
        songId={song.id}
        title={song.title}
        workspaceId={workspaceId}
        navigate={navigate}
        assetId={assetId}
        initialView={tab === 'scores' || assetId ? 'pdf' : 'recording'}
        studioProps={{
          requestedProjectId: projectId,
          discussionInitiallyOpen: tab === 'discussion',
          discussionOptions: {
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
          },

          scopeKey: `${workspaceId}/${song.id}`,
          bpm: Number(arrangement.bpm) || 120,
          feedback,
          focusId,
          focusTime,
        }}
      />
    </>
  );
}

const SongWorkspaceScreenContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $wideHero: boolean }>(({ $wideHero }) => ({
  flexDirection: $wideHero ? 'row' : 'column',
  rowGap: 20,
  columnGap: 20,
}));

const SongWorkspaceScreenContainer2 = styledNative(View)({
  width: 220,
  maxWidth: '100%',
  flexShrink: 0,
});

const SongWorkspaceScreenContainer3 = styledNative(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 14,
  columnGap: 14,
});

const SongWorkspaceScreenHeader = styledNative(FlexBetween)({
  flexWrap: 'wrap',
  rowGap: 12,
  columnGap: 12,
});

const SongWorkspaceScreenPageHeading = styledNative(PageHeading)({ flex: 1 });

const SongWorkspaceScreenButton = styledNative(Pressable)({
  width: 34,
  height: 34,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  borderBottomRightRadius: 8,
  borderBottomLeftRadius: 8,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: '#dce3ee',
  borderRightColor: '#dce3ee',
  borderBottomColor: '#dce3ee',
  borderLeftColor: '#dce3ee',
});

const SongWorkspaceScreenContainer4 = styledNative(View)({ marginTop: 'auto' });

const SongWorkspaceScreenContainer5 = styledNative(View)({
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  rowGap: 12,
  columnGap: 12,
});

const SongWorkspaceScreenButton2 = styledNative(Pressable)({
  alignSelf: 'flex-end',
  marginLeft: 'auto',
  marginTop: 'auto',
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 7,
  columnGap: 7,
  paddingTop: 10,
});

const SongWorkspaceScreenContainer6 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $overviewOpen: boolean }>(({ $overviewOpen }) => ({
  transform: [{ rotate: $overviewOpen ? '180deg' : '0deg' }],
}));
