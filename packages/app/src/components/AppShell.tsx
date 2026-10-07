import { BandListReveal } from './BandListReveal';
import { ProfilePhoto } from './ProfilePhoto';
import styled from '@emotion/native';
import { Stack, theme } from '@moajam/ui';
import { useState, type PropsWithChildren } from 'react';
import { useIdentity } from '../state/Identity';
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import moajamLogo from '../../assets/logo.png';
import type { AppRoute, ScreenProps } from '../navigation';
import { BandJoinModal } from './BandJoinModal';
import { Notifications } from './Notifications';
import { usePreferences } from '../state/preferences';
import { useMockAppState } from '../state/MockAppState';
import { Avatar, AvatarText, Main, PageScroll, Shell } from '../styles/layout';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { Input } from '../styles/layout';
import { AppIcon, type AppIconName } from './icons';

const brandLogoSource = typeof moajamLogo === 'string' ? { uri: moajamLogo } : moajamLogo;

const Sidebar = styled.View`
  width: 232px;
  min-height: 100%;
  padding: 16px 12px;
  justify-content: space-between;
  background-color: #f8fafc;
  border-right-width: 1px;
  border-right-color: ${theme.colors.border};
`;

const BrandMark = styled.Image`
  width: 44px;
  height: 44px;
  border-radius: 12px;
`;

const BrandButton = styled.Pressable`
  align-self: flex-start;
  gap: 14px;
  flex-direction: row;
  align-items: center;
`;

const BrandName = styled.Text`
  color: #1d60ee;
  font-size: 27px;
  font-weight: 900;
  letter-spacing: -1.5px;
  font-family: 'Trebuchet MS';
`;

const WorkspaceCard = styled.View`
  margin: 4px 0 10px;
  overflow: hidden;
  border: 1px solid #e1e7f0;
  border-radius: 12px;
  background-color: white;
`;

const WorkspaceSwitcher = styled.Pressable`
  padding: 12px;
  gap: 10px;
  flex-direction: row;
  align-items: center;
`;

const WorkspaceThumb = styled.View`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background-color: #f3a45b;
`;

const SidebarText = styled.Text<{ small?: boolean }>`
  color: ${({ small }) => (small ? theme.colors.textMuted : theme.colors.text)};
  font-size: ${({ small }) => (small ? 11 : 14)}px;
  font-weight: ${({ small }) => (small ? 400 : 500)};
`;

const NavItem = styled.Pressable<{ active?: boolean }>`
  padding: 7px 12px;
  gap: 12px;
  flex-direction: row;
  align-items: center;
  border-radius: 10px;
  background-color: ${({ active }) => (active ? '#eaf0fc' : 'transparent')};
`;

const NavIcon = styled.View`
  width: 20px;
  align-items: center;
  justify-content: center;
`;

const NavLabel = styled.Text<{ active?: boolean }>`
  color: ${({ active }) => (active ? theme.colors.primary : '#56657c')};
  font-size: 14px;
  font-weight: ${({ active }) => (active ? 500 : 400)};
`;

const NavGroupLabel = styled.Text`
  margin: 14px 12px 6px;
  color: #72819a;
  font-size: 11px;
  font-weight: 500;
`;

const Profile = styled.Pressable`
  padding: 12px 8px 0;
  gap: 10px;
  flex-direction: row;
  align-items: center;
  border-top-width: 1px;
  border-top-color: ${theme.colors.border};
`;

const Topbar = styled.View`
  height: 64px;
  flex-shrink: 0;
  padding: 0 24px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-color: ${theme.colors.border};
  background-color: white;
`;

const TopbarTitle = styled.Text`
  color: ${theme.colors.text};
  font-size: 14px;
  font-weight: 500;
`;

const TopbarAction = styled.Pressable`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
`;

const BottomNav = styled.View`
  padding: 9px 8px 12px;
  flex-direction: row;
  justify-content: space-around;
  border-top-width: 1px;
  border-top-color: ${theme.colors.border};
  background-color: white;
`;

const BottomItem = styled.Pressable`
  min-width: 56px;
  gap: 3px;
  align-items: center;
`;

const BottomLabel = styled.Text<{ active?: boolean }>`
  color: ${({ active }) => (active ? theme.colors.primary : theme.colors.textMuted)};
  font-size: 10px;
  font-weight: 500;
`;

const bandItems: Array<{ icon: AppIconName; label: string; route: AppRoute }> = [
  { icon: 'home', label: '홈', route: 'home' },
  { icon: 'songs', label: '참여 곡', route: 'songs' },
  { icon: 'rehearsal', label: '연습실', route: 'practice' },
  { icon: 'calendar', label: '합주', route: 'rehearsals' },
  { icon: 'users', label: '멤버', route: 'members' },
];
const personalItems: typeof bandItems = [
  { icon: 'home', label: '홈', route: 'personal-home' },
  { icon: 'calendar', label: '합주 일정', route: 'personal-rehearsals' },
  { icon: 'songs', label: '참여 곡', route: 'personal-songs' },
  { icon: 'rehearsal', label: '연습실', route: 'personal-practice' },
];
const pageTitles: Record<AppRoute, string> = {
  'personal-home': '홈',
  'personal-rehearsals': '합주 일정',
  'personal-songs': '참여 곡',
  'personal-practice': '연습실',
  home: '홈',
  recommendations: '곡 추천',
  recommendation: '곡 추천 상세',
  songs: '참여 곡',
  song: '곡 상세',
  practice: '연습실',
  rehearsals: '합주',
  members: '멤버',
  instrument: '내 악기 추출',
  'score-editor': '악보 편집',
  'band-score-editor': '밴드 악보 편집',
  settings: '설정',
  help: '도움말',
};

const activeGroup = (current: AppRoute, target: AppRoute) => {
  if (target === 'practice') return current === target || current === 'band-score-editor';
  if (target === 'recommendations') return current === target || current === 'recommendation';
  if (target === 'songs')
    return ['songs', 'song', 'recommendations', 'recommendation'].includes(current);
  if (target === 'personal-practice')
    return ['personal-practice', 'instrument', 'score-editor'].includes(current);
  return current === target;
};
interface AppShellProps {
  activeRoute: AppRoute;
  onNavigate: ScreenProps['navigate'];
}
export function AppShell({ children, activeRoute, onNavigate }: PropsWithChildren<AppShellProps>) {
  const profile = usePreferences();
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const {
    workspaces,
    workspace,
    members,
    selectWorkspace,
    createWorkspace,
    storageError,
    actionError,
    clearActionError,
    syncStatus,
    serverConfigured,
    reloadRemote,
  } = useMockAppState();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createContent, setCreateContent] = useState(false);
  const [bandDescription, setBandDescription] = useState('');
  const [bandPhoto, setBandPhoto] = useState('');
  const [name, setName] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [confirmReload, setConfirmReload] = useState(false);
  const personal =
    activeRoute.startsWith('personal-') || ['instrument', 'score-editor'].includes(activeRoute);
  const accountPage = activeRoute === 'settings' || activeRoute === 'help';
  const scoreEditorPage = activeRoute === 'score-editor' || activeRoute === 'band-score-editor';
  const spaceLabel = accountPage
    ? 'Moajam'
    : personal
      ? '개인 공간'
      : (workspace?.name ?? '밴드 공간');
  const choose = (id: string) => {
    selectWorkspace(id);
    setSwitcherOpen(false);
    onNavigate('home', { workspaceId: id });
  };
  const openCreate = () => {
    setSwitcherOpen(false);
    setCreateError('');
    setCreateContent(true);
    setCreating(true);
  };
  const openJoin = () => {
    setSwitcherOpen(false);
    setJoining(true);
  };
  const bandActions = (
    <Stack
      gap={4}
      style={{ paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: '#e1e7f0' }}
    >
      <NavItem accessibilityRole="button" onPress={openCreate} style={{ minHeight: 40 }}>
        <NavIcon>
          <SidebarText style={{ fontSize: 20, color: theme.colors.primary }}>＋</SidebarText>
        </NavIcon>
        <NavLabel active>밴드 만들기</NavLabel>
      </NavItem>
      <NavItem accessibilityRole="button" onPress={openJoin} style={{ minHeight: 40 }}>
        <NavIcon>
          <AppIcon name="user-plus" size={18} color="#56657c" />
        </NavIcon>
        <NavLabel>밴드 참여하기</NavLabel>
      </NavItem>
    </Stack>
  );
  const emptyBand = (
    <View style={{ padding: 14, gap: 14 }}>
      <WorkspaceThumb style={{ backgroundColor: '#eaf0fc' }}>
        <AppIcon name="guitar" color={theme.colors.primary} size={20} />
      </WorkspaceThumb>
      <View style={{ gap: 6 }}>
        <SidebarText style={{ fontWeight: '600' }}>밴드와 함께 시작해요</SidebarText>
        <Meta>새 밴드를 만들거나 초대받은 밴드에 참여해보세요.</Meta>
      </View>
      <Stack gap={8}>
        <ActionButton onPress={openCreate}>밴드 만들기</ActionButton>
        <ActionButton secondary onPress={openJoin}>
          밴드 참여하기
        </ActionButton>
      </Stack>
    </View>
  );
  const nav = (items: typeof bandItems) =>
    items.map((item) => {
      const active = activeGroup(activeRoute, item.route);
      return (
        <NavItem
          key={item.route}
          active={active}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          onPress={() => onNavigate(item.route)}
          style={{ gap: 12 }}
        >
          <NavIcon>
            <AppIcon name={item.icon} color={active ? theme.colors.primary : '#56657c'} size={18} />
          </NavIcon>
          <NavLabel active={active}>{item.label}</NavLabel>
        </NavItem>
      );
    });
  const switcher = (
    <WorkspaceSwitcher
      accessibilityRole="button"
      accessibilityLabel="밴드 변경"
      accessibilityState={{ expanded: switcherOpen }}
      onPress={() => {
        setCreateContent(false);
        setSwitcherOpen((open) => !open);
      }}
      style={{ gap: 10 }}
    >
      {workspace?.photo ? (
        <Image
          source={{ uri: workspace.photo }}
          style={{ width: 36, height: 36, borderRadius: 18 }}
        />
      ) : (
        <WorkspaceThumb style={{ backgroundColor: workspace?.color ?? '#43896b' }}>
          <AppIcon name="guitar" color="white" size={20} />
        </WorkspaceThumb>
      )}
      <View style={{ flex: 1 }}>
        <SidebarText numberOfLines={1}>{workspace?.name ?? '밴드 선택'}</SidebarText>
        <SidebarText small>{members.length}명의 멤버</SidebarText>
      </View>
      <View style={{ transform: [{ rotate: switcherOpen ? '180deg' : '0deg' }] }}>
        <AppIcon name="chevron-down" color="#7b879f" size={16} />
      </View>
    </WorkspaceSwitcher>
  );
  return (
    <Shell>
      {desktop && (
        <Sidebar style={{ paddingHorizontal: 12 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <BrandButton
              accessibilityRole="button"
              accessibilityLabel="개인 홈으로 이동"
              onPress={() => onNavigate('personal-home')}
              style={{ gap: 10, paddingHorizontal: 4 }}
            >
              <BrandMark source={brandLogoSource} resizeMode="contain" />
              <BrandName>moajam</BrandName>
            </BrandButton>
            <NavGroupLabel>개인 공간</NavGroupLabel>
            <Stack gap={2}>{nav(personalItems)}</Stack>
            <NavGroupLabel>밴드 공간</NavGroupLabel>
            <WorkspaceCard>
              {workspaces.length ? switcher : emptyBand}
              {workspaces.length > 0 && switcherOpen && (
                <BandListReveal>
                  <Stack
                    gap={4}
                    style={{ padding: 6, borderTopWidth: 1, borderTopColor: '#e1e7f0' }}
                  >
                    {workspaces.map((band) => (
                      <NavItem
                        key={band.id}
                        active={workspace?.id === band.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${band.name} 선택`}
                        accessibilityState={{ selected: workspace?.id === band.id }}
                        onPress={() => choose(band.id)}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: band.color,
                          }}
                        />
                        <NavLabel
                          numberOfLines={1}
                          style={{ flex: 1 }}
                          active={workspace?.id === band.id}
                        >
                          {band.name}
                        </NavLabel>
                        {workspace?.id === band.id && <Meta>✓</Meta>}
                      </NavItem>
                    ))}
                    {bandActions}
                  </Stack>
                </BandListReveal>
              )}
            </WorkspaceCard>
            <Stack gap={2}>{workspace ? nav(bandItems) : null}</Stack>
          </ScrollView>
          <View style={{ paddingTop: 16 }}>
            <Profile
              accessibilityRole="button"
              accessibilityLabel="내 프로필과 설정"
              onPress={() => onNavigate('settings')}
              style={{ gap: 10 }}
            >
              <Avatar color="#ffd8c8">
                <>
                  {profile.photo ? (
                    <Image
                      source={{ uri: profile.photo }}
                      style={{ width: 36, height: 36, borderRadius: 18 }}
                    />
                  ) : (
                    <AvatarText>{profile.name.slice(-2)}</AvatarText>
                  )}
                </>
              </Avatar>
              <View style={{ flex: 1 }}>
                <SidebarText>{profile.name}</SidebarText>
                <SidebarText small>{'나의 음악,\n우리의 합주'}</SidebarText>
              </View>
              <AppIcon name="settings" size={19} color="#72819a" />
            </Profile>
          </View>
        </Sidebar>
      )}
      <Main>
        <Topbar style={{ paddingHorizontal: desktop ? 28 : 16 }}>
          <View
            style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            {!desktop && (
              <BrandButton
                accessibilityRole="button"
                accessibilityLabel="개인 홈으로 이동"
                onPress={() => onNavigate('personal-home')}
              >
                <BrandMark
                  source={brandLogoSource}
                  resizeMode="contain"
                  style={{ width: 32, height: 32 }}
                />
              </BrandButton>
            )}
            <View
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: desktop ? 'row' : 'column',
                alignItems: desktop ? 'center' : 'flex-start',
                gap: desktop ? 12 : 2,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={accountPage ? '개인 홈으로 이동' : '공간 변경'}
                onPress={() => {
                  setCreateContent(false);
                  if (accountPage) onNavigate('personal-home');
                  else setSwitcherOpen(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: desktop ? 260 : '100%',
                }}
              >
                <Meta numberOfLines={1} style={{ flexShrink: 1 }}>
                  {spaceLabel}
                </Meta>
                {!accountPage && (
                  <AppIcon name="chevron-down" size={13} color={theme.colors.textMuted} />
                )}
              </Pressable>
              {desktop && <AppIcon name="chevron-right" size={14} color="#b3bdcc" />}
              <TopbarTitle numberOfLines={1}>{pageTitles[activeRoute]}</TopbarTitle>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 }}>
            <ActionButton
              secondary
              compact
              onPress={() => setNotificationsOpen(!notificationsOpen)}
            >
              알림
            </ActionButton>
            <TopbarAction
              accessibilityRole="button"
              accessibilityLabel="도움말 열기"
              onPress={() => onNavigate('help')}
            >
              <AppIcon name="help" size={19} color="#7b879f" />
            </TopbarAction>
            <TopbarAction
              accessibilityRole="button"
              accessibilityLabel="내 프로필과 설정"
              onPress={() => onNavigate('settings')}
            >
              <Avatar color="#eef2f8" size={30}>
                <>
                  {profile.photo ? (
                    <Image
                      source={{ uri: profile.photo }}
                      style={{ width: 36, height: 36, borderRadius: 18 }}
                    />
                  ) : (
                    <AvatarText>{profile.name.slice(-2)}</AvatarText>
                  )}
                </>
              </Avatar>
            </TopbarAction>
          </View>
        </Topbar>
        <PageScroll
          contentContainerStyle={{
            padding: width < 620 ? 16 : 28,
            gap: 20,
            width: '100%',
            maxWidth: 1260,
            alignSelf: 'center',
          }}
        >
          {serverConfigured && !scoreEditorPage ? (
            <FlexRow wrap>
              <Meta>{syncStatus}</Meta>
              <ActionButton secondary compact onPress={() => setConfirmReload(true)}>
                서버 기록 새로 불러오기
              </ActionButton>
              {confirmReload ? (
                <Surface>
                  <Meta>
                    저장되지 않은 화면 변경을 서버 기록으로 교체합니다. 필요한 기록은 설정에서 먼저
                    백업해주세요.
                  </Meta>
                  <FlexRow>
                    <ActionButton secondary onPress={() => setConfirmReload(false)}>
                      취소
                    </ActionButton>
                    <ActionButton
                      onPress={() => {
                        setConfirmReload(false);
                        void reloadRemote().catch(() => {});
                      }}
                    >
                      서버 기록으로 교체
                    </ActionButton>
                  </FlexRow>
                </Surface>
              ) : null}
            </FlexRow>
          ) : null}
          {storageError && (
            <Meta accessibilityRole="alert" style={{ color: '#be3b4b' }}>
              브라우저에 변경 내용을 저장하지 못했어요. 새로고침하면 변경 내용이 사라질 수 있습니다.
            </Meta>
          )}
          {actionError ? (
            <Surface danger>
              <Copy accessibilityRole="alert">{actionError}</Copy>
              <ActionButton secondary onPress={clearActionError}>
                확인
              </ActionButton>
            </Surface>
          ) : null}
          {notificationsOpen ? <Notifications navigate={onNavigate} /> : null}
          {children}
        </PageScroll>
        {!desktop && (
          <BottomNav>
            {(personal ? personalItems : bandItems).map((item) => {
              const active = activeGroup(activeRoute, item.route);
              return (
                <BottomItem
                  key={item.route}
                  accessibilityRole="button"
                  onPress={() => onNavigate(item.route)}
                  style={{ gap: 3 }}
                >
                  <AppIcon
                    name={item.icon}
                    color={active ? theme.colors.primary : theme.colors.textMuted}
                    size={19}
                  />
                  <BottomLabel active={active}>{item.label}</BottomLabel>
                </BottomItem>
              );
            })}
          </BottomNav>
        )}
      </Main>
      <Modal
        visible={creating || (!desktop && switcherOpen)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSwitcherOpen(false);
          setCreating(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: 'rgba(16,29,53,0.48)',
          }}
        >
          <Pressable
            accessibilityLabel="밴드 창 닫기"
            onPress={() => {
              setSwitcherOpen(false);
              setCreating(false);
            }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          />
          <Surface style={{ width: '100%', maxWidth: 410, maxHeight: '90%' }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Heading>{createContent ? '밴드 만들기' : '공간 변경'}</Heading>
              <ActionButton
                secondary
                compact
                onPress={() => {
                  setSwitcherOpen(false);
                  setCreating(false);
                }}
              >
                닫기
              </ActionButton>
            </View>
            {!createContent && (
              <>
                <ActionButton
                  secondary
                  onPress={() => {
                    setSwitcherOpen(false);
                    onNavigate('personal-home');
                  }}
                >
                  개인 공간 · 모든 밴드 모아보기
                </ActionButton>
                {workspaces.length > 0 ? (
                  <>
                    <Meta>내 밴드</Meta>
                    <ScrollView style={{ maxHeight: 310 }} contentContainerStyle={{ gap: 8 }}>
                      {workspaces.map((band) => (
                        <Pressable
                          key={band.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${band.name} 선택`}
                          onPress={() => choose(band.id)}
                          style={{
                            padding: 14,
                            borderRadius: 12,
                            backgroundColor: band.id === workspace?.id ? '#edf3ff' : '#f7f9fc',
                            borderLeftWidth: 4,
                            borderLeftColor: band.color,
                          }}
                        >
                          <Copy style={{ fontWeight: '500' }}>
                            {band.name}
                            {band.id === workspace?.id ? ' ✓' : ''}
                          </Copy>
                          <Meta>
                            {band.members.find((member) => member.id === currentUserId)?.part} ·{' '}
                            {band.members.find((member) => member.id === currentUserId)?.role ===
                            'OWNER'
                              ? '관리자'
                              : '멤버'}{' '}
                            · {band.members.length}명
                          </Meta>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {bandActions}
                  </>
                ) : (
                  <WorkspaceCard>{emptyBand}</WorkspaceCard>
                )}
              </>
            )}
            {createContent && (
              <View style={{ gap: 8 }}>
                <Meta>밴드 프로필 이미지</Meta>
                <ProfilePhoto
                  horizontal
                  value={bandPhoto}
                  onChange={setBandPhoto}
                  disabled={creatingBusy}
                />
                <Input
                  accessibilityLabel="새 밴드 이름"
                  placeholder="새 밴드 이름"
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                />
                <Input
                  accessibilityLabel="새 밴드 설명"
                  placeholder="밴드 설명"
                  multiline
                  maxLength={2000}
                  value={bandDescription}
                  onChangeText={setBandDescription}
                  editable={!creatingBusy}
                />
                <ActionButton
                  disabled={creatingBusy || !name.trim()}
                  onPress={() => {
                    if (!name.trim()) return;
                    setCreatingBusy(true);
                    setCreateError('');
                    void createWorkspace(name, bandDescription, bandPhoto)
                      .then((id) => {
                        setCreating(false);
                        setName('');
                        setBandDescription('');
                        setBandPhoto('');
                        choose(id);
                      })
                      .catch((error: unknown) =>
                        setCreateError(
                          error instanceof Error ? error.message : '밴드를 만들지 못했습니다.',
                        ),
                      )
                      .finally(() => setCreatingBusy(false));
                  }}
                >
                  밴드 만들기
                </ActionButton>
                {createError ? <Meta accessibilityRole="alert">{createError}</Meta> : null}
              </View>
            )}
            {!desktop && (
              <ActionButton
                secondary
                onPress={() => {
                  setSwitcherOpen(false);
                  onNavigate('settings');
                }}
              >
                설정
              </ActionButton>
            )}
          </Surface>
        </View>
      </Modal>
      <BandJoinModal visible={joining} onClose={() => setJoining(false)} onJoined={choose} />
    </Shell>
  );
}
