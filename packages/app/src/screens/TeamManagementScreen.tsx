import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { AppIcon } from '../components/icons';
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
} from '../components/ProductUI';
import { WorkspaceScopeProvider, useMockAppState } from '../state/MockAppState';
import { useIdentity } from '../state/Identity';
import type { ScreenProps } from '../navigation';
import { SpaceMenuReveal } from '../components/SpaceMenuReveal';
import { ScheduleDialog } from '../components/ScheduleDialog';
import { BandSettings } from '../components/BandSettings';
import { InvitationPanel } from '../components/InvitationPanel';
import { SortableSongList } from '../components/SortableSongList';

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
    <AppShell activeRoute="personal-songs" onNavigate={navigate}>
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
    </AppShell>
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
    <Surface style={{ paddingVertical: 14, gap: 8 }}>
      <FlexRow wrap gap={12}>
        {dragHandle}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${team.name} 팀 홈`}
          onPress={() => navigate('home', { workspaceId: team.id })}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            flex: 1,
            minWidth: 180,
          }}
        >
          {team.photo ? (
            <Image
              source={{ uri: team.photo }}
              style={{ width: 48, height: 48, borderRadius: 12 }}
            />
          ) : (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: '#edf3ff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name="users" size={24} color={team.color} />
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Heading>{team.name}</Heading>
            {!!team.description && <Copy>{team.description}</Copy>}
          </View>
        </Pressable>
        <FlexRow wrap gap={8}>
          {canManage && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${team.name} 밴드 설정`}
              onPress={() => setModal('settings')}
              style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
            >
              <AppIcon name="settings" size={20} color="#64748b" />
            </Pressable>
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
      <FlexBetween style={{ paddingLeft: width >= 650 ? (dragHandle ? 102 : 62) : 0 }}>
        <Meta numberOfLines={1} style={{ flex: 1 }}>
          멤버 {members.length}명{part ? ` · 내 파트 ${part}` : ''}
        </Meta>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${team.name} ${detailsVisible ? '간략히 보기' : '자세히 보기'}`}
          aria-expanded={detailsVisible}
          disabled={sorting}
          onPress={() => setExpanded((value) => !value)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-end',
            gap: 5,
            paddingVertical: 2,
          }}
        >
          <Meta>{detailsVisible ? '간략히 보기' : '자세히 보기'}</Meta>
          <View style={{ transform: [{ rotate: detailsVisible ? '180deg' : '0deg' }] }}>
            <AppIcon name="chevron-down" size={16} color="#64748b" />
          </View>
        </Pressable>
      </FlexBetween>
      <SpaceMenuReveal id={`team-details-${team.id}`} visible={detailsVisible} animate={!sorting}>
        <View
          style={{
            flexDirection: width >= 900 ? 'row' : 'column',
            gap: 24,
            borderTopWidth: 1,
            borderTopColor: '#e4eaf1',
            paddingTop: 16,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
            <Heading style={{ fontSize: 15 }}>연주 곡</Heading>
            <View style={{ paddingLeft: 12, gap: 10 }}>
              {songs.map((song) => (
                <View key={song.id}>
                  <Copy>- {song.title}</Copy>
                  <Meta style={{ paddingLeft: 12 }}>{song.artist}</Meta>
                </View>
              ))}
              {!songs.length && <Meta>등록된 연주 곡이 없어요.</Meta>}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 24 }}>
            <View style={{ gap: 10 }}>
              <Heading style={{ fontSize: 15 }}>멤버</Heading>
              <View style={{ paddingLeft: 12 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 10 }}>
                  {members.map((member) => (
                    <View
                      key={member.id}
                      style={{
                        flexBasis: 180,
                        flexGrow: 1,
                        flexShrink: 1,
                        minWidth: 0,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Copy numberOfLines={1} style={{ flexShrink: 1 }}>
                        {member.name}
                      </Copy>
                      <Meta
                        numberOfLines={1}
                        style={{
                          color: sessionColor(member.part || ''),
                          fontWeight: '600',
                          flexShrink: 0,
                        }}
                      >
                        {member.part || '미지정'}
                      </Meta>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <Heading style={{ fontSize: 15 }}>다가오는 일정</Heading>
              {upcoming.length ? (
                <ScrollView
                  accessibilityLabel={`${team.name} 다가오는 일정`}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={upcoming.length > 2}
                  style={{
                    marginLeft: 12,
                    height: Math.min(upcoming.length, 2) * 84,
                    maxHeight: 168,
                  }}
                >
                  {upcoming.map((event) => (
                    <View
                      key={event.id}
                      style={{
                        height: 84,
                        gap: 3,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: '#edf1f6',
                      }}
                    >
                      <Copy numberOfLines={1}>{event.title}</Copy>
                      <Meta>
                        {event.date} · {event.start}–{event.end}
                      </Meta>
                      {!!event.place && <Meta numberOfLines={1}>{event.place}</Meta>}
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Meta style={{ paddingLeft: 12 }}>예정된 일정이 없어요.</Meta>
              )}
            </View>
          </View>
        </View>
      </SpaceMenuReveal>
      <ScheduleDialog
        visible={!!modal}
        label={modal === 'settings' ? '밴드 설정' : modal === 'invite' ? '초대하기' : '팀 나가기'}
        onClose={close}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#0f172a80',
            padding: 20,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Pressable
            accessibilityLabel="창 닫기"
            onPress={close}
            style={{ position: 'absolute', inset: 0 }}
          />
          <ScrollView
            style={{ width: '100%', maxWidth: modal === 'leave' ? 460 : 580, maxHeight: '90%' }}
          >
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
                  <Copy style={{ color: '#be3b4b' }}>
                    마지막 멤버가 나가면 곡, 일정, 메모와 첨부 파일 등 밴드의 모든 데이터가 영구
                    삭제됩니다.
                  </Copy>
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
                {!!error && (
                  <Copy accessibilityRole="alert" style={{ color: '#be3b4b' }}>
                    {error}
                  </Copy>
                )}
                <FlexRow wrap style={{ justifyContent: 'flex-end' }}>
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
                </FlexRow>
              </Surface>
            )}
          </ScrollView>
        </View>
      </ScheduleDialog>
    </Surface>
  );
}
