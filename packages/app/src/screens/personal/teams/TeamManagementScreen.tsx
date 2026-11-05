import styledNative from '@emotion/native';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { AppIcon } from '@component/shared/icons';
import {
  ActionButton,
  Copy,
  FlexRow,
  FlexBetween,
  Heading,
  Meta,
  PageDescription,
  PageHeading,
  PageTop,
  Surface,
} from '@component/shared/ui/ProductUI';
import { WorkspaceScopeProvider, useMockAppState } from '@state/MockAppState';
import { useIdentity } from '@state/Identity';
import type { ScreenProps } from '@app/navigation';
import { SpaceMenuReveal } from '@component/shared/layout/SpaceMenuReveal';
import { ScheduleDialog } from '@component/shared/ui/ScheduleDialog';
import { BandSettings } from '@component/shared/band/BandSettings';
import { InvitationPanel } from '@component/shared/band/InvitationPanel';
import { SortableSongList } from '@component/shared/songs/SortableSongList';

function sessionColor(part: string) {
  if (/^(vocal|보컬)/i.test(part)) return '#c4477a';
  if (/^(guitar|기타)/i.test(part)) return '#3976cd';
  if (/^(bass|베이스)/i.test(part)) return '#238356';
  if (/^(drums?|percussion|드럼|퍼커션)/i.test(part)) return '#8252c8';
  if (/^(keyboard|piano|키보드|건반|피아노)/i.test(part)) return '#a66c00';
  return '#64748b';
}

export function TeamManagementScreen({ navigate }: ScreenProps) {
  const { workspaces, reorderWorkspaces, workspaceOrderSaving, workspaceOrderError } =
    useMockAppState();
  const [sorting, setSorting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const teams = workspaces.map((team) => ({ ...team, title: team.name }));
  return (
    <>
      <PageTop>
        <PageHeading>팀 관리</PageHeading>
        <PageDescription>참여 중인 팀과 멤버를 확인하세요.</PageDescription>
      </PageTop>
      <FlexBetween>
        <Heading>참여 팀 {workspaces.length}개</Heading>
        <ActionButton
          compact
          secondary={!sorting}
          disabled={(!sorting && workspaces.length < 2) || dragging || workspaceOrderSaving}
          accessibilityState={{ selected: sorting, busy: workspaceOrderSaving }}
          onPress={() => setSorting((value) => !value)}
        >
          {sorting ? '변경 완료' : '순서 변경'}
        </ActionButton>
      </FlexBetween>
      {!!workspaceOrderError && <Meta accessibilityRole="alert">{workspaceOrderError}</Meta>}
      <SortableSongList
        songs={teams}
        handleInside
        reorderEnabled={sorting}
        onDragStateChange={setDragging}
        onReorder={(ids) => {
          void reorderWorkspaces(ids).catch(() => {});
        }}
        renderSong={(team, handle) => (
          <WorkspaceScopeProvider id={team.id}>
            <TeamCard navigate={navigate} dragHandle={handle} sorting={sorting} />
          </WorkspaceScopeProvider>
        )}
      />
      {!workspaces.length && (
        <Surface>
          <Meta>아직 참여 중인 팀이 없어요.</Meta>
        </Surface>
      )}
    </>
  );
}

function TeamCard({
  navigate,
  dragHandle,
  sorting = false,
}: ScreenProps & { dragHandle?: ReactNode; sorting?: boolean }) {
  const {
    workspace: team,
    members,
    adoptedSongs,
    rehearsals,
    leaveWorkspace,
    canManage,
  } = useMockAppState();
  const user = useIdentity();
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<'invite' | 'settings' | 'leave' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  if (!team) return null;
  const detailsVisible = expanded && !sorting;
  const part = members.find((member) => member.id === user)?.part;
  const lastOwner =
    canManage &&
    members.length > 1 &&
    members.filter((member) => member.role === 'OWNER').length <= 1;
  const songs = adoptedSongs.filter((song) => !song.archived);
  const upcoming = rehearsals
    .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) >= new Date())
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  const close = () => {
    if (!leaving) {
      setModal(null);
      setConfirmDelete(false);
      setError('');
    }
  };
  const leave = async () => {
    if (leaving || lastOwner) return;
    if (members.length === 1 && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLeaving(true);
    setError('');
    try {
      await leaveWorkspace(confirmDelete);
      setModal(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '팀에서 나가지 못했어요.');
    } finally {
      setLeaving(false);
    }
  };
  return (
    <TeamCardPanel>
      <FlexRow wrap gap={12}>
        {dragHandle}
        <TeamCardButton
          accessibilityRole="button"
          accessibilityLabel={`${team.name} 팀 홈`}
          onPress={() => navigate('home', { workspaceId: team.id })}
        >
          {team.photo ? (
            <TeamCardImage source={{ uri: team.photo }} />
          ) : (
            <TeamCardContainer>
              <AppIcon name="users" size={24} color={team.color} />
            </TeamCardContainer>
          )}
          <TeamCardContainer2>
            <Heading>{team.name}</Heading>
            {!!team.description && <Copy>{team.description}</Copy>}
          </TeamCardContainer2>
        </TeamCardButton>
        <FlexRow wrap gap={8}>
          {canManage && (
            <TeamCardButton2
              accessibilityRole="button"
              accessibilityLabel={`${team.name} 밴드 설정`}
              onPress={() => setModal('settings')}
            >
              <AppIcon name="settings" size={20} color="#64748b" />
            </TeamCardButton2>
          )}
          {canManage && (
            <ActionButton secondary compact onPress={() => setModal('invite')}>
              초대하기
            </ActionButton>
          )}
          <ActionButton
            secondary
            compact
            danger
            onPress={() => {
              setError('');
              setModal('leave');
            }}
          >
            나가기
          </ActionButton>
        </FlexRow>
      </FlexRow>
      <TeamCardHeader $width={width} $dragHandle={dragHandle}>
        <TeamCardMeta numberOfLines={1}>
          멤버 {members.length}명{part ? ` · 내 파트 ${part}` : ''}
        </TeamCardMeta>
        <TeamCardButton3
          accessibilityRole="button"
          accessibilityLabel={`${team.name} ${detailsVisible ? '간략히 보기' : '자세히 보기'}`}
          aria-expanded={detailsVisible}
          disabled={sorting}
          onPress={() => setExpanded((value) => !value)}
        >
          <Meta>{detailsVisible ? '간략히 보기' : '자세히 보기'}</Meta>
          <TeamCardContainer3 $detailsVisible={detailsVisible}>
            <AppIcon name="chevron-down" size={16} color="#64748b" />
          </TeamCardContainer3>
        </TeamCardButton3>
      </TeamCardHeader>
      <SpaceMenuReveal id={`team-details-${team.id}`} visible={detailsVisible} animate={!sorting}>
        <TeamCardContainer4 $width={width}>
          <TeamCardContainer5>
            <TeamCardHeading>연주 곡</TeamCardHeading>
            <TeamCardContainer6>
              {songs.map((song) => (
                <View key={song.id}>
                  <Copy>- {song.title}</Copy>
                  <TeamCardMeta2>{song.artist}</TeamCardMeta2>
                </View>
              ))}
              {!songs.length && <Meta>등록된 연주 곡이 없어요.</Meta>}
            </TeamCardContainer6>
          </TeamCardContainer5>
          <TeamCardContainer7>
            <TeamCardContainer8>
              <TeamCardHeading>멤버</TeamCardHeading>
              <TeamCardContainer9>
                <TeamCardContainer10>
                  {members.map((member) => (
                    <TeamCardContainer11 key={member.id}>
                      <TeamCardCopy numberOfLines={1}>{member.name}</TeamCardCopy>
                      <TeamCardMeta3
                        numberOfLines={1}
                        $sessionColor={sessionColor(member.part || '')}
                      >
                        {member.part || '미지정'}
                      </TeamCardMeta3>
                    </TeamCardContainer11>
                  ))}
                </TeamCardContainer10>
              </TeamCardContainer9>
            </TeamCardContainer8>
            <TeamCardContainer8>
              <TeamCardHeading>다가오는 일정</TeamCardHeading>
              {upcoming.length ? (
                <TeamCardScroll
                  accessibilityLabel={`${team.name} 다가오는 일정`}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={upcoming.length > 2}
                  $min={Math.min(upcoming.length, 2)}
                >
                  {upcoming.map((event) => (
                    <TeamCardContainer12 key={event.id}>
                      <Copy numberOfLines={1}>{event.title}</Copy>
                      <Meta>
                        {event.date} · {event.start}–{event.end}
                      </Meta>
                      {!!event.place && <Meta numberOfLines={1}>{event.place}</Meta>}
                    </TeamCardContainer12>
                  ))}
                </TeamCardScroll>
              ) : (
                <TeamCardMeta2>예정된 일정이 없어요.</TeamCardMeta2>
              )}
            </TeamCardContainer8>
          </TeamCardContainer7>
        </TeamCardContainer4>
      </SpaceMenuReveal>
      <ScheduleDialog
        visible={!!modal}
        label={modal === 'settings' ? '밴드 설정' : modal === 'invite' ? '초대하기' : '팀 나가기'}
        onClose={close}
      >
        <TeamCardContainer13>
          <TeamCardButton4 accessibilityLabel="창 닫기" onPress={close} />
          <TeamCardScroll2 $modal={modal}>
            {modal === 'settings' ? (
              <BandSettings onClose={close} />
            ) : modal === 'invite' ? (
              <Surface>
                <FlexBetween>
                  <Heading>{team.name} 초대하기</Heading>
                  <ActionButton secondary compact onPress={close}>
                    닫기
                  </ActionButton>
                </FlexBetween>
                <InvitationPanel workspaceId={team.id} canManage={canManage} />
              </Surface>
            ) : (
              <Surface>
                <Heading>
                  {confirmDelete ? '밴드 공간도 삭제할까요?' : '정말 나가실 건가요?'}
                </Heading>
                <Copy>
                  {team.name}에서 나가면 공유 자료에 접근할 수 없고 참여 팀 목록에서도 제외됩니다.
                </Copy>
                {members.length === 1 && (
                  <TeamCardCopy2>
                    마지막 멤버가 나가면 곡, 일정, 메모와 첨부 파일 등 밴드의 모든 데이터가 영구
                    삭제됩니다.
                  </TeamCardCopy2>
                )}
                {lastOwner && (
                  <>
                    <Meta>나가려면 다른 멤버를 먼저 관리자로 지정해주세요.</Meta>
                    <ActionButton
                      secondary
                      onPress={() => {
                        close();
                        navigate('members', { workspaceId: team.id });
                      }}
                    >
                      멤버 관리
                    </ActionButton>
                  </>
                )}
                {!!error && <TeamCardCopy2 accessibilityRole="alert">{error}</TeamCardCopy2>}
                <TeamCardRow wrap>
                  <ActionButton secondary disabled={leaving} onPress={close}>
                    취소
                  </ActionButton>
                  <ActionButton danger disabled={leaving || lastOwner} onPress={() => void leave()}>
                    {leaving
                      ? '나가는 중…'
                      : confirmDelete
                        ? '모든 데이터 삭제 및 나가기'
                        : '나가기'}
                  </ActionButton>
                </TeamCardRow>
              </Surface>
            )}
          </TeamCardScroll2>
        </TeamCardContainer13>
      </ScheduleDialog>
    </TeamCardPanel>
  );
}

const TeamCardPanel = styledNative(Surface)({
  paddingTop: 14,
  paddingBottom: 14,
  rowGap: 8,
  columnGap: 8,
});

const TeamCardButton = styledNative(Pressable)({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 14,
  columnGap: 14,
  flex: 1,
  minWidth: 180,
});

const TeamCardImage = styledNative(Image)({
  width: 48,
  height: 48,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
});

const TeamCardContainer = styledNative(View)({
  width: 48,
  height: 48,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  backgroundColor: '#edf3ff',
  alignItems: 'center',
  justifyContent: 'center',
});

const TeamCardContainer2 = styledNative(View)({ flex: 1, rowGap: 4, columnGap: 4 });

const TeamCardButton2 = styledNative(Pressable)({
  width: 34,
  height: 34,
  alignItems: 'center',
  justifyContent: 'center',
});

const TeamCardHeader = styledNative(FlexBetween, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number; $dragHandle: ReactNode }>(({ $width, $dragHandle }) => ({
  paddingLeft: $width >= 650 ? ($dragHandle ? 102 : 62) : 0,
}));

const TeamCardMeta = styledNative(Meta)({ flex: 1 });

const TeamCardButton3 = styledNative(Pressable)({
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-end',
  rowGap: 5,
  columnGap: 5,
  paddingTop: 2,
  paddingBottom: 2,
});

const TeamCardContainer3 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $detailsVisible: boolean }>(({ $detailsVisible }) => ({
  transform: [{ rotate: $detailsVisible ? '180deg' : '0deg' }],
}));

const TeamCardContainer4 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ({
  flexDirection: $width >= 900 ? 'row' : 'column',
  rowGap: 24,
  columnGap: 24,
  borderTopWidth: 1,
  borderTopColor: '#e4eaf1',
  paddingTop: 16,
}));

const TeamCardContainer5 = styledNative(View)({ flex: 1, minWidth: 0, rowGap: 10, columnGap: 10 });

const TeamCardHeading = styledNative(Heading)({ fontSize: 15 });

const TeamCardContainer6 = styledNative(View)({ paddingLeft: 12, rowGap: 10, columnGap: 10 });

const TeamCardMeta2 = styledNative(Meta)({ paddingLeft: 12 });

const TeamCardContainer7 = styledNative(View)({ flex: 1, minWidth: 0, rowGap: 24, columnGap: 24 });

const TeamCardContainer8 = styledNative(View)({ rowGap: 10, columnGap: 10 });

const TeamCardContainer9 = styledNative(View)({ paddingLeft: 12 });

const TeamCardContainer10 = styledNative(View)({
  flexDirection: 'row',
  flexWrap: 'wrap',
  columnGap: 16,
  rowGap: 10,
});

const TeamCardContainer11 = styledNative(View)({
  flexBasis: 180,
  flexGrow: 1,
  flexShrink: 1,
  minWidth: 0,
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 8,
  columnGap: 8,
});

const TeamCardCopy = styledNative(Copy)({ flexShrink: 1 });

const TeamCardMeta3 = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $sessionColor: '#c4477a' | '#3976cd' | '#238356' | '#8252c8' | '#a66c00' | '#64748b' }>(
  ({ $sessionColor }) => ({
    color: $sessionColor,
    fontWeight: '600',
    flexShrink: 0,
  }),
);

const TeamCardScroll = styledNative(ScrollView, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $min: number }>(({ $min }) => ({
  marginLeft: 12,
  height: $min * 84,
  maxHeight: 168,
}));

const TeamCardContainer12 = styledNative(View)({
  height: 84,
  rowGap: 3,
  columnGap: 3,
  paddingTop: 8,
  paddingBottom: 8,
  borderBottomWidth: 1,
  borderBottomColor: '#edf1f6',
});

const TeamCardContainer13 = styledNative(View)({
  flex: 1,
  backgroundColor: '#0f172a80',
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  justifyContent: 'center',
  alignItems: 'center',
});

const TeamCardButton4 = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const TeamCardScroll2 = styledNative(ScrollView, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $modal: 'settings' | 'invite' | 'leave' | null }>(({ $modal }) => ({
  width: '100%',
  maxWidth: $modal === 'leave' ? 460 : 580,
  maxHeight: '90%',
}));

const TeamCardCopy2 = styledNative(Copy)({ color: '#be3b4b' });

const TeamCardRow = styledNative(FlexRow)({ justifyContent: 'flex-end' });
