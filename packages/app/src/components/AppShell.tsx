import { claimFirstHelpVisit, completeHelpVisit, type HelpScreen } from '../lib/helpVisits';
import { PracticeHelp } from './PracticeHelp';
import { ScreenHelpContext } from './ScreenHelpContext';
import { BandCreateContext } from './BandCreateContext';
import { HomeTour } from './HomeTour';
import { consumeHomeTourReplay, requestHomeTourReplay } from '../lib/homeTourSession';
import { BandListReveal } from './BandListReveal';
import { SpaceMenuReveal } from './SpaceMenuReveal';
import { ProfilePhoto } from './ProfilePhoto';
import styled from '@emotion/native';
import { Stack, theme } from '@moajam/ui';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { useIdentity } from '../state/Identity';
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import moajamLogo from '../../assets/logo.png';
import type { AppRoute, ScreenProps, SongTab } from '../navigation';
import { BandJoinModal } from './BandJoinModal';
import { NotificationPanel } from './NotificationPanel';
import { useNotificationSummary } from '../state/notifications';
import { WorkspaceSyncControls } from './WorkspaceSyncControls';
import { usePreferences } from '../state/preferences';
import { useMockAppState } from '../state/MockAppState';
import { Avatar, AvatarText, Main, PageScroll, Shell } from '../styles/layout';
import { ActionButton, Copy, Heading, Meta, Surface } from './ProductUI';
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
  { icon: 'calendar', label: '합주', route: 'rehearsals' },
  { icon: 'songs', label: '참여 곡', route: 'songs' },
  { icon: 'users', label: '멤버', route: 'members' },
];
const personalItems: typeof bandItems = [
  { icon: 'home', label: '홈', route: 'personal-home' },
  { icon: 'calendar', label: '합주 일정', route: 'personal-rehearsals' },
  { icon: 'users', label: '팀 관리', route: 'personal-songs' },
];
const toolItems: typeof bandItems = [
  { icon: 'rehearsal', label: '악보 편집', route: 'score-editor' },
  { icon: 'microphone', label: '녹음실', route: 'track-editor' },
  { icon: 'headphones', label: '연습하기', route: 'personal-practice' },
];
const pageTitles: Record<AppRoute, string> = {
  tools: '악보 편집',
  'track-editor': '녹음실',
  'work-management': '작업실',
  'personal-home': '홈',
  'personal-rehearsals': '합주 일정',
  'personal-songs': '팀 관리',
  'personal-practice': '연습하기',
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
  'band-score-editor': '악보 프로젝트',
  settings: '설정',
  help: '도움말',
};

const activeGroup = (current: AppRoute, target: AppRoute) => {
  if (target === 'tools' || target === 'score-editor')
    return ['tools', 'score-editor'].includes(current);
  if (target === 'track-editor') return ['track-editor', 'instrument'].includes(current);
  if (target === 'recommendations') return current === target || current === 'recommendation';
  if (target === 'songs')
    return ['songs', 'song', 'recommendations', 'recommendation', 'band-score-editor'].includes(
      current,
    );
  if (target === 'personal-practice') return current === 'personal-practice';
  return current === target;
};
interface AppShellProps {
  activeRoute: AppRoute;
  onNavigate: ScreenProps['navigate'];
  entityId?: string;
  songTab?: SongTab;
  hideSyncControls?: boolean;
}
export function AppShell({
  children,
  activeRoute,
  onNavigate,
  entityId,
  songTab,
  hideSyncControls = false,
}: PropsWithChildren<AppShellProps>) {
  const profile = usePreferences();
  const notificationSummary = useNotificationSummary();
  const unreadCount = notificationSummary.data?.unreadCount ?? 0;
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const {
    workspaces,
    workspace,
    canManage,
    rehearsals,
    adoptedSongs,
    recommendations,
    members,
    selectWorkspace,
    createWorkspace,
    storageError,
    actionError,
    clearActionError,
  } = useMockAppState();
  const [tourOpen, setTourOpen] = useState(false);
  const [songsOpen, setSongsOpen] = useState(activeGroup(activeRoute, 'songs'));
  const [toolsOpen, setToolsOpen] = useState(
    [
      'tools',
      'track-editor',
      'work-management',
      'personal-practice',
      'instrument',
      'score-editor',
      'band-score-editor',
    ].includes(activeRoute),
  );
  useEffect(() => {
    setSongsOpen(activeGroup(activeRoute, 'songs'));
  }, [activeRoute, entityId, workspace?.id]);
  useEffect(() => {
    let active = true;
    const screen: HelpScreen | undefined =
      activeRoute === 'personal-home'
        ? 'main-home'
        : activeRoute === 'home'
          ? 'band-home'
          : activeRoute === 'practice'
            ? 'practice'
            : undefined;
    if (!screen || !currentUserId || (screen !== 'main-home' && !workspace?.id)) return;
    if (activeRoute === 'personal-home' && consumeHomeTourReplay(currentUserId)) setTourOpen(true);
    void claimFirstHelpVisit(screen, currentUserId)
      .then((first) => {
        if (active && first) setTourOpen(true);
      })
      .catch(() => {
        // A failed visit request must not block the page or mark it as visited.
      });
    return () => {
      active = false;
    };
  }, [activeRoute, currentUserId, workspace?.id]);
  const [tourSidebar, setTourSidebar] = useState(false);
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
  const personal = activeRoute.startsWith('personal-');
  const toolsPage = [
    'tools',
    'track-editor',
    'work-management',
    'instrument',
    'score-editor',
    'personal-practice',
  ].includes(activeRoute);
  const accountPage = activeRoute === 'settings' || activeRoute === 'help';
  const bandSpace = !personal && !toolsPage && !accountPage;
  const scoreEditorPage = activeRoute === 'score-editor' || activeRoute === 'band-score-editor';
  const spaceLabel = accountPage
    ? 'Moajam'
    : toolsPage
      ? '작업실'
      : personal
        ? '개인 공간'
        : (workspace?.name ?? '밴드 공간');
  const currentSong = adoptedSongs.find((song) => song.id === entityId);
  const crumbs: Array<{ label: string; onPress?: () => void }> = [];
  if (toolsPage) {
    crumbs.push({ label: '개인 공간', onPress: () => onNavigate('personal-home') });
    crumbs.push({ label: '작업실', onPress: () => onNavigate('work-management') });
  } else {
    crumbs.push({
      label: spaceLabel,
      onPress: () =>
        onNavigate(personal || accountPage ? 'personal-home' : 'home', {
          workspaceId: workspace?.id,
        }),
    });
  }
  if (activeRoute === 'song' || activeRoute === 'band-score-editor') {
    crumbs.push({
      label: '참여 곡',
      onPress: () => onNavigate('songs', { workspaceId: workspace?.id }),
    });
    crumbs.push({
      label: currentSong?.title ?? '곡 상세',
      onPress: songTab
        ? () => onNavigate('song', { id: entityId, workspaceId: workspace?.id, songTab: 'main' })
        : undefined,
    });
    const tabLabels: Partial<Record<SongTab, string>> = {
      discussion: '곡 의견',
      scores: '악보 보기',
      tracks: '작업실',
      overview: '곡 정보·합주 기록',
    };
    if (songTab && tabLabels[songTab]) crumbs.push({ label: tabLabels[songTab]! });
  } else {
    if (activeRoute === 'recommendations' || activeRoute === 'recommendation')
      crumbs.push({ label: '참여 곡', onPress: () => onNavigate('songs') });
    if (activeRoute === 'recommendation')
      crumbs.push({ label: '곡 추천', onPress: () => onNavigate('recommendations') });
    crumbs.push({
      label: pageTitles[activeRoute],
      onPress:
        toolsPage && currentSong
          ? () => onNavigate(activeRoute === 'track-editor' ? 'track-editor' : 'tools')
          : undefined,
    });
    if (toolsPage && currentSong) crumbs.push({ label: currentSong.title });
  }
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
  const closeTour = () => {
    setTourOpen(false);
    setSwitcherOpen(false);
  };
  const completeTour = () => {
    const screen: HelpScreen =
      activeRoute === 'practice' ? 'practice' : activeRoute === 'home' ? 'band-home' : 'main-home';
    void completeHelpVisit(screen, currentUserId).catch((error) => {
      console.error('도움말 완료 기록을 저장하지 못했습니다.', error);
    });
    closeTour();
  };
  const bandActions = (
    <Stack
      nativeID="tour-band-actions"
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
      if (items === bandItems && item.route === 'songs')
        return (
          <View key={item.route}>
            <View
              nativeID="tour-band-nav-songs"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 10,
                backgroundColor: active ? '#eaf0fc' : 'transparent',
              }}
            >
              <NavItem
                active={active}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setSongsOpen(true);
                  onNavigate('songs');
                }}
                style={{ gap: 12, flex: 1, backgroundColor: 'transparent' }}
              >
                <NavIcon>
                  <AppIcon
                    name="songs"
                    color={active ? theme.colors.primary : '#56657c'}
                    size={18}
                  />
                </NavIcon>
                <NavLabel active={active}>{item.label}</NavLabel>
              </NavItem>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={songsOpen ? '참여곡 목록 접기' : '참여곡 목록 펼치기'}
                accessibilityState={{ expanded: songsOpen }}
                onPress={() => setSongsOpen((open) => !open)}
                style={{ width: 32, height: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ transform: [{ rotate: songsOpen ? '180deg' : '0deg' }] }}>
                  <AppIcon
                    name="chevron-down"
                    size={16}
                    color={active ? theme.colors.primary : '#7b879f'}
                  />
                </View>
              </Pressable>
            </View>
            <SpaceMenuReveal id="sidebar-song-list" visible={songsOpen}>
              <Stack gap={2} style={{ paddingLeft: 28, paddingBottom: 6 }}>
                {adoptedSongs
                  .filter((song) => !song.archived)
                  .map((song) => {
                    const selected = activeRoute === 'song' && entityId === song.id;
                    return (
                      <NavItem
                        key={song.id}
                        active={selected}
                        accessibilityRole="button"
                        accessibilityLabel={`${song.title} 곡 상세`}
                        accessibilityState={{ selected }}
                        onPress={() =>
                          onNavigate('song', { id: song.id, workspaceId: workspace?.id })
                        }
                        style={{ minHeight: 34, paddingVertical: 7 }}
                      >
                        <View
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            flexShrink: 0,
                            backgroundColor: selected ? theme.colors.primary : '#94a3b8',
                          }}
                        />
                        <NavLabel
                          numberOfLines={2}
                          active={selected}
                          style={{ flex: 1, fontSize: 13 }}
                        >
                          {song.title}
                        </NavLabel>
                      </NavItem>
                    );
                  })}
                {!adoptedSongs.some((song) => !song.archived) && (
                  <Meta style={{ padding: 10 }}>참여곡이 없어요.</Meta>
                )}
              </Stack>
            </SpaceMenuReveal>
          </View>
        );
      return (
        <NavItem
          key={item.route}
          nativeID={items === bandItems ? 'tour-band-nav-' + item.route : undefined}
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
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <WorkspaceSwitcher
        accessibilityRole="button"
        accessibilityLabel={`${workspace?.name ?? '밴드'} 홈으로 이동`}
        onPress={() => {
          if (workspace) choose(workspace.id);
        }}
        style={{ gap: 10, flex: 1, minWidth: 0 }}
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
      </WorkspaceSwitcher>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="밴드 목록 펼치기"
        accessibilityState={{ expanded: switcherOpen }}
        onPress={() => {
          setCreateContent(false);
          setSwitcherOpen((open) => !open);
        }}
        style={{
          width: 32,
          height: 40,
          marginRight: 6,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ transform: [{ rotate: switcherOpen ? '180deg' : '0deg' }] }}>
          <AppIcon name="chevron-down" color="#7b879f" size={16} />
        </View>
      </Pressable>
    </View>
  );
  return (
    <ScreenHelpContext.Provider
      value={() => {
        setNotificationsOpen(false);
        if (
          activeRoute !== 'personal-home' &&
          activeRoute !== 'home' &&
          activeRoute !== 'practice'
        ) {
          requestHomeTourReplay(currentUserId);
          onNavigate('personal-home');
        } else setTourOpen(true);
      }}
    >
      <Shell>
        {(desktop || (tourOpen && tourSidebar)) && (
          <Sidebar
            style={{
              paddingHorizontal: 12,
              ...(!desktop
                ? { position: 'absolute' as const, top: 0, left: 0, bottom: 0, zIndex: 20 }
                : {}),
            }}
          >
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
              <NavGroupLabel nativeID="tour-personal-space">개인 공간</NavGroupLabel>
              <Stack nativeID="tour-personal-menu" gap={2}>
                {nav(personalItems.slice(0, 1))}
                <SpaceMenuReveal
                  id="personal-extra"
                  visible={!bandSpace || (tourOpen && tourSidebar)}
                >
                  <Stack gap={2}>{nav(personalItems.slice(1))}</Stack>
                </SpaceMenuReveal>
              </Stack>
              <SpaceMenuReveal id="music-tools" visible={!bandSpace}>
                <View
                  nativeID="tour-music-tools"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 10,
                    backgroundColor: toolsPage ? '#eaf0fc' : 'transparent',
                  }}
                >
                  <NavItem
                    active={toolsPage}
                    accessibilityRole="button"
                    accessibilityLabel="작업실 메뉴"
                    onPress={() => {
                      setToolsOpen(true);
                      onNavigate('work-management');
                    }}
                    style={{ gap: 12, flex: 1, minHeight: 40, paddingRight: 0 }}
                  >
                    <NavIcon>
                      <AppIcon
                        name="studio"
                        size={18}
                        color={toolsPage ? theme.colors.primary : '#56657c'}
                      />
                    </NavIcon>
                    <NavLabel active={toolsPage} style={{ flex: 1 }}>
                      작업실
                    </NavLabel>
                  </NavItem>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="작업실 하위 메뉴 펼치기 또는 접기"
                    accessibilityState={{ expanded: toolsOpen }}
                    onPress={() => setToolsOpen((open) => !open)}
                    style={{
                      width: 32,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View style={{ transform: [{ rotate: toolsOpen ? '180deg' : '0deg' }] }}>
                      <AppIcon
                        name="chevron-down"
                        size={16}
                        color={toolsPage ? theme.colors.primary : '#7b879f'}
                      />
                    </View>
                  </Pressable>
                </View>
                <SpaceMenuReveal id="sidebar-workshop-list" visible={toolsOpen}>
                  <Stack gap={2} style={{ paddingLeft: 18, paddingBottom: 6 }}>
                    {nav(toolItems)}
                  </Stack>
                </SpaceMenuReveal>
              </SpaceMenuReveal>
              <NavGroupLabel nativeID="tour-band-space">밴드 공간</NavGroupLabel>
              <WorkspaceCard nativeID="tour-band-switcher">
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
              <SpaceMenuReveal id="band-menu" visible={bandSpace || (tourOpen && tourSidebar)}>
                <Stack nativeID="tour-band-menu" gap={2}>
                  {workspace ? nav(bandItems) : null}
                </Stack>
              </SpaceMenuReveal>
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
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1, minWidth: 0 }}
                contentContainerStyle={{ alignItems: 'center', gap: 10 }}
              >
                {crumbs.map((crumb, index) => (
                  <View
                    key={`${index}-${crumb.label}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    {index > 0 && <AppIcon name="chevron-right" size={14} color="#b3bdcc" />}
                    {crumb.onPress ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${crumb.label}${index === 0 ? ' 홈' : ''}으로 이동`}
                        onPress={crumb.onPress}
                        style={{ paddingVertical: 10 }}
                      >
                        <Meta numberOfLines={1}>{crumb.label}</Meta>
                      </Pressable>
                    ) : (
                      <TopbarTitle numberOfLines={1}>{crumb.label}</TopbarTitle>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 }}>
              {!desktop && (
                <TopbarAction
                  accessibilityRole="button"
                  accessibilityLabel="밴드 선택"
                  onPress={() => {
                    setCreateContent(false);
                    setSwitcherOpen(true);
                  }}
                >
                  <AppIcon name="users" size={19} color="#72819a" />
                </TopbarAction>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`알림${unreadCount ? `, 읽지 않은 알림 ${unreadCount}개` : ''}`}
                accessibilityState={{ expanded: notificationsOpen }}
                onPress={() => setNotificationsOpen(!notificationsOpen)}
                style={{
                  width: 38,
                  height: 38,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  backgroundColor: notificationsOpen ? '#edf3ff' : '#f6f8fb',
                }}
              >
                <AppIcon name="bell" size={21} color="#566b8c" />
                {unreadCount > 0 && (
                  <Meta
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -7,
                      minWidth: 18,
                      paddingHorizontal: 4,
                      borderRadius: 10,
                      backgroundColor: '#386ce4',
                      color: 'white',
                      fontSize: 10,
                      lineHeight: 18,
                      textAlign: 'center',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Meta>
                )}
              </Pressable>

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
            {!scoreEditorPage && !hideSyncControls && <WorkspaceSyncControls />}
            {storageError && (
              <Meta accessibilityRole="alert" style={{ color: '#be3b4b' }}>
                브라우저에 변경 내용을 저장하지 못했어요. 새로고침하면 변경 내용이 사라질 수
                있습니다.
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

            <BandCreateContext.Provider value={openCreate}>{children}</BandCreateContext.Provider>
          </PageScroll>
          {!desktop && (
            <BottomNav>
              {[
                ...(toolsPage
                  ? [
                      {
                        icon: 'home' as const,
                        label: '개인 홈',
                        route: 'personal-home' as const,
                      },
                      {
                        icon: 'studio' as const,
                        label: '작업실',
                        route: 'work-management' as const,
                      },
                      ...toolItems,
                    ]
                  : personal
                    ? personalItems
                    : bandItems),
                ...(!toolsPage && !bandSpace
                  ? [
                      {
                        icon: 'studio' as const,
                        label: '작업실',
                        route: 'work-management' as const,
                      },
                    ]
                  : []),
              ].map((item) => {
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
          visible={creating || (!desktop && switcherOpen && !tourOpen)}
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
                  <ActionButton
                    secondary
                    onPress={() => {
                      setSwitcherOpen(false);
                      onNavigate('tools');
                    }}
                  >
                    작업실 · 악보와 사운드 트랙 편집
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
        {tourOpen && activeRoute === 'practice' && (
          <PracticeHelp onClose={closeTour} onComplete={completeTour} />
        )}
        {tourOpen && activeRoute !== 'practice' && (
          <HomeTour
            hasBand={workspaces.length > 0}
            bandHome={activeRoute === 'home'}
            bandInfo={{
              canManage,
              hasSongs: adoptedSongs.length > 0,
              hasNext: rehearsals.some(
                (event) => !event.cancelled && new Date(event.date + 'T' + event.end) >= new Date(),
              ),
              hasCandidates: recommendations.some(
                (song) => !adoptedSongs.some((adopted) => adopted.id === song.id),
              ),
            }}
            onClose={closeTour}
            onComplete={completeTour}
            onStep={(target) => {
              setTourSidebar(
                target.startsWith('tour-personal-') ||
                  target.startsWith('tour-band-nav-') ||
                  [
                    'tour-band-space',
                    'tour-band-actions',
                    'tour-band-switcher',
                    'tour-band-menu',
                  ].includes(target),
              );
              setSwitcherOpen(target === 'tour-band-actions' || target === 'tour-band-switcher');
            }}
            onCreate={() => {
              closeTour();
              openCreate();
            }}
            onJoin={() => {
              closeTour();
              openJoin();
            }}
            onHelp={() => {
              closeTour();
              onNavigate('help');
            }}
          />
        )}
        {notificationsOpen && (
          <NotificationPanel navigate={onNavigate} onClose={() => setNotificationsOpen(false)} />
        )}
        <BandJoinModal visible={joining} onClose={() => setJoining(false)} onJoined={choose} />
      </Shell>
    </ScreenHelpContext.Provider>
  );
}
