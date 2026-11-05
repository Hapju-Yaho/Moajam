import styledNative from '@emotion/native';
import { ScreenHelpButton } from '@component/shared/help/ScreenHelpButton';
import { AppIcon } from '@component/shared/icons';
import { BandSettings } from '@component/shared/band/BandSettings';
import { useIdentity } from '@state/Identity';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import {
  ActionButton,
  Copy,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  ResponsiveGrid,
  Stack,
  Surface,
} from '@component/shared/ui/ProductUI';
import { useMockAppState } from '@state/MockAppState';
import type { ScreenProps } from '@app/navigation';
import { Avatar, AvatarText } from '@styles/layout';
import { HomeHeader } from '@component/home/HomeHeader';
import { HomeSongsCard } from '@component/home/HomeSongsCard';
import { HomeUpcomingCard } from '@component/home/HomeUpcomingCard';
import { HomeScheduleSection } from '@component/home/HomeScheduleSection';
import { RehearsalCalendar } from '@component/shared/schedule/RehearsalCalendar';
import { Notifications } from '@component/shared/notifications/Notifications';

export function HomeScreen({ navigate }: ScreenProps) {
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const { workspace, members, adoptedSongs, recommendations, rehearsals, leaveWorkspace } =
    useMockAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const closeLeave = () => {
    if (!leaving) {
      setConfirmLeave(false);
      setConfirmDelete(false);
      setLeaveError('');
    }
  };
  const lastOwner =
    members.length > 1 &&
    members.find((member) => member.id === currentUserId)?.role === 'OWNER' &&
    members.filter((member) => member.role === 'OWNER').length <= 1;
  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    setLeaveError('');
    setConfirmDelete(false);
    try {
      await leaveWorkspace(confirmDelete);
      setConfirmLeave(false);
      navigate('personal-home');
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : '탈퇴하지 못했습니다. 다시 시도해주세요.',
      );
    } finally {
      setLeaving(false);
    }
  };
  const events = rehearsals
    .filter((event) => !event.cancelled)
    .map((event) => ({
      ...event,
      workspaceId: workspace!.id,
      bandName: workspace!.name,
      bandColor: workspace!.color,
    }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const upcoming = events.filter((event) => new Date(event.date + 'T' + event.end) >= new Date());
  const next = upcoming[0];
  const candidates = recommendations.filter(
    (song) => !adoptedSongs.some((adopted) => adopted.id === song.id),
  );
  return (
    <>
      <HomeHeader
        title={workspace?.name ?? ''}
        description={workspace?.description}
        photo={workspace?.photo}
        stackAt={650}
        smallTitle={false}
        actions={
          <HomeScreenRow>
            <ScreenHelpButton />
            <FlexRow nativeID="tour-band-manage">
              <HomeScreenButton
                accessibilityRole="button"
                accessibilityLabel="밴드 설정"
                onPress={() => setSettingsOpen(true)}
              >
                <AppIcon name="settings" size={20} color="#52647b" />
              </HomeScreenButton>
              <ActionButton secondary onPress={() => navigate('members')}>
                멤버 보기
              </ActionButton>
            </FlexRow>
            <ActionButton
              secondary
              danger
              onPress={() => {
                setLeaveError('');
                setConfirmDelete(false);
                setConfirmLeave(true);
              }}
            >
              나가기
            </ActionButton>
          </HomeScreenRow>
        }
      />
      <ResponsiveGrid stacked={width < 1050}>
        <TourBandNext
          featured
          nativeID="tour-band-next"
          title="다음 합주"
          events={next ? [next] : []}
          navigate={navigate}

          emptyMessage="아직 예정된 합주가 없어요."
          onOpenEvent={(event) => navigate('rehearsals', { id: event.id })}
          onCreateEvent={() => navigate('rehearsals')}
        />
        <HomeScreenPanel>
          <Heading>함께 준비하는 음악</Heading>
          <HomeScreenPageHeading>
            {adoptedSongs.length}곡 · {members.length}명
          </HomeScreenPageHeading>
          <FlexRow wrap>
            {members.map((member) => (
              <Avatar key={member.id} color={member.color} size={34}>
                <AvatarText>{member.initials}</AvatarText>
              </Avatar>
            ))}
          </FlexRow>
        </HomeScreenPanel>
      </ResponsiveGrid>
      <Heading>밴드 일정</Heading>
      <Meta>이 밴드의 모든 멤버가 함께 확인하는 팀 일정이에요.</Meta>
      <HomeScheduleSection
        stacked={width < 1100}
        calendarFlex={1.65}
        calendar={
          <RehearsalCalendar
            events={events}
            navigate={navigate}
            workspaceId={workspace?.id}
            allowPersonal={!!workspace?.id}
            compact
          />
        }
        renderSidebar={(height, stacked) => {
          const cardHeight = stacked ? 270 : Math.max(230, (height - 16) / 2);
          return (
            <>
              <HomeUpcomingCard
                events={upcoming}
                navigate={navigate}
                height={cardHeight}
                emptyMessage="예정된 일정이 없어요. 캘린더에서 다음 일정을 등록해보세요."
              />
              <Notifications
                navigate={navigate}
                key={workspace?.id ?? 'personal'}
                title="최근 알림"
                height={cardHeight}
                workspaceId={workspace?.id}
              />
            </>
          );
        }}
      />
      <ResponsiveGrid stacked={width < 1050}>
        <HomeScreenStack>
          <HomeSongsCard
            title="함께 연습할 곡"
            songs={adoptedSongs.map(({ id, title, artist, thumbnailUrl, referenceUrl }) => ({
              id,
              title,
              artist,
              thumbnailUrl,
              referenceUrl,
              workspaceId: workspace?.id ?? '',
            }))}
            coverSize={50}
            onViewAll={() => navigate('songs')}
            onOpenSong={(song) => navigate('song', { id: song.id, workspaceId: song.workspaceId })}
            emptyMessage="곡 추천에서 첫 연습곡을 골라보세요."
          />
        </HomeScreenStack>
        <HomeScreenStack2>
          <Surface nativeID="tour-band-candidates">
            <Heading>다음 채택 후보</Heading>
            {candidates.length ? (
              candidates.slice(0, 3).map((song) => (
                <HomeScreenContainer key={song.id}>
                  <HomeScreenCopy>{song.title}</HomeScreenCopy>
                  <FlexRow wrap gap={8}>
                    <Meta>
                      {song.artist} · 좋아요 {song.likes} · 채택 추천 {song.votes}
                    </Meta>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={song.title + ' 후보 상세 보기'}
                      onPress={() => navigate('recommendation', { id: song.id })}
                    >
                      <HomeScreenMeta>후보 상세 보기 →</HomeScreenMeta>
                    </Pressable>
                  </FlexRow>
                </HomeScreenContainer>
              ))
            ) : (
              <Meta>새로운 곡을 추천하고 의견을 나눠보세요.</Meta>
            )}
            <ActionButton secondary onPress={() => navigate('recommendations')}>
              곡 추천 보기 →
            </ActionButton>
          </Surface>
          <Surface>
            <Heading>우리 밴드</Heading>
            <Copy>
              {members.find((member) => member.id === currentUserId)?.part} 파트로 함께하고 있어요.
            </Copy>
            <Meta>다른 밴드의 일정과 참여 곡은 개인 공간에서 함께 확인할 수 있어요.</Meta>
            <ActionButton secondary onPress={() => navigate('personal-home')}>
              개인 홈으로 →
            </ActionButton>
          </Surface>
        </HomeScreenStack2>
      </ResponsiveGrid>
      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <HomeScreenContainer2>
          <HomeScreenButton2
            accessibilityLabel="밴드 설정 닫기"
            onPress={() => setSettingsOpen(false)}
          />
          <HomeScreenScroll>
            <BandSettings key={workspace?.id} onClose={() => setSettingsOpen(false)} />
          </HomeScreenScroll>
        </HomeScreenContainer2>
      </Modal>
      <Modal visible={confirmLeave} transparent animationType="fade" onRequestClose={closeLeave}>
        <HomeScreenContainer3>
          <HomeScreenPanel2 scrollable>
            <Heading>{confirmDelete ? '밴드 공간도 삭제할까요?' : '정말 나가실 건가요?'}</Heading>
            <Copy>
              {workspace?.name} 밴드를 탈퇴하면 밴드의 공유 자료에 접근할 수 없고, 내 밴드
              목록에서도 제외됩니다.
            </Copy>
            {members.length === 1 && (
              <HomeScreenCopy2>
                멤버가 없으면 밴드 공간도 지워집니다. 곡, 일정, 메모와 첨부 파일 등 관련 데이터가
                모두 영구 삭제되며 복구할 수 없습니다.
              </HomeScreenCopy2>
            )}
            {lastOwner && (
              <Meta>탈퇴하려면 멤버 보기에서 다른 멤버를 먼저 관리자로 지정해주세요.</Meta>
            )}
            {!!leaveError && (
              <HomeScreenCopy2 accessibilityRole="alert">{leaveError}</HomeScreenCopy2>
            )}
            <HomeScreenRow2>
              <ActionButton secondary disabled={leaving} onPress={closeLeave}>
                취소
              </ActionButton>
              <ActionButton
                danger
                disabled={leaving || lastOwner}
                onPress={() => {
                  if (members.length === 1 && !confirmDelete) setConfirmDelete(true);
                  else void leave();
                }}
              >
                {leaving ? '탈퇴 중…' : confirmDelete ? '모든 데이터 삭제 및 탈퇴' : '밴드 탈퇴'}
              </ActionButton>
            </HomeScreenRow2>
          </HomeScreenPanel2>
        </HomeScreenContainer3>
      </Modal>
    </>
  );
}

const HomeScreenRow = styledNative(FlexRow)({ flexShrink: 0 });

const HomeScreenButton = styledNative(Pressable)({
  width: 40,
  height: 40,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: '#dce3ed',
  borderRightColor: '#dce3ed',
  borderBottomColor: '#dce3ed',
  borderLeftColor: '#dce3ed',
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  borderBottomRightRadius: 8,
  borderBottomLeftRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
});

const TourBandNext = styledNative(HomeUpcomingCard)({ flex: 1.6 });

const HomeScreenPanel = styledNative(Surface)({ flex: 1 });

const HomeScreenPageHeading = styledNative(PageHeading)({ fontSize: 25 });

const HomeScreenStack = styledNative(Stack)({ flex: 1.4 });

const HomeScreenStack2 = styledNative(Stack)({ flex: 1 });

const HomeScreenContainer = styledNative(View)({
  rowGap: 8,
  columnGap: 8,
  paddingTop: 14,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: '#dce4f0',
  borderRightColor: '#dce4f0',
  borderBottomColor: '#dce4f0',
  borderLeftColor: '#dce4f0',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  backgroundColor: '#f7f9fc',
});

const HomeScreenCopy = styledNative(Copy)({ fontWeight: '500' });

const HomeScreenMeta = styledNative(Meta)({ color: '#416bd1', fontWeight: '500' });

const HomeScreenContainer2 = styledNative(View)({
  flex: 1,
  backgroundColor: '#0006',
  justifyContent: 'center',
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
});

const HomeScreenButton2 = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const HomeScreenScroll = styledNative(ScrollView)({
  maxHeight: '90%',
  width: '100%',
  maxWidth: 580,
  alignSelf: 'center',
});

const HomeScreenContainer3 = styledNative(View)({
  flex: 1,
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(16,29,53,0.48)',
});

const HomeScreenPanel2 = styledNative(Surface)({ width: '100%', maxWidth: 440 });

const HomeScreenCopy2 = styledNative(Copy)({ color: '#be3b4b' });

const HomeScreenRow2 = styledNative(FlexRow)({ justifyContent: 'flex-end' });
