import { css as nativeCss } from '@emotion/native';
import styledNative from '@emotion/native';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { useWindowDimensions } from 'react-native';
import type { AppRoute, ScreenProps, SongTab } from '@app/navigation';
import { useIdentity } from '@state/Identity';
import { usePreferences } from '@state/preferences';
import { useMockAppState } from '@state/MockAppState';
import { useNotificationSummary } from '@state/notifications';
import { Main, PageScroll, Shell } from '@styles/layout';
import { ActionButton, Copy, Meta, Surface } from '@component/shared/ui/ProductUI';
import { ScreenHelpContext } from '@component/shared/help/ScreenHelpContext';
import { NotificationPanel } from '@component/shared/notifications/NotificationPanel';
import { BandCreateContext } from '@component/shared/layout/BandCreateContext';
import { MainLayoutSidebar } from '@component/shared/layout/main-layout/MainLayoutSidebar';
import { MainLayoutTopbar } from '@component/shared/layout/main-layout/MainLayoutTopbar';
import { MainLayoutBottomNav } from '@component/shared/layout/main-layout/MainLayoutBottomNav';
import { MainLayoutHelp } from '@component/shared/layout/main-layout/MainLayoutHelp';
import { BandCreateModal } from '@component/shared/layout/main-layout/modals/BandCreateModal';
import { SpaceSwitcherModal } from '@component/shared/layout/main-layout/modals/SpaceSwitcherModal';
import { NavigationDrawer } from '@component/shared/layout/main-layout/modals/NavigationDrawer';
import { BandJoinModal } from '@component/shared/layout/main-layout/modals/BandJoinModal';
import {
  getShellCrumbs,
  getShellRouteState,
} from '@component/shared/layout/main-layout/mainLayout.navigation';
import { useShellMenuState } from '@component/shared/layout/main-layout/useShellMenuState';
import { useShellTour } from '@component/shared/layout/main-layout/useShellTour';

interface MainLayoutProps {
  activeRoute: AppRoute;
  onNavigate: ScreenProps['navigate'];
  entityId?: string;
  songTab?: SongTab;
  hideSyncControls?: boolean;
  contentKey?: string;
}
export function MainLayout({
  children,
  activeRoute,
  onNavigate: navigate,
  entityId,
  songTab,
  hideSyncControls = false,
  contentKey,
}: PropsWithChildren<MainLayoutProps>) {
  const profile = usePreferences();
  const notificationSummary = useNotificationSummary();
  const unreadCount = notificationSummary.data?.unreadCount ?? 0;
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const desktop = width > 1024;
  const tablet = width >= 768 && !desktop;
  const mobile = width < 768;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
    setNotificationsOpen(false);
    setSwitcherOpen(false);
    setCreating(false);
    setJoining(false);
  }, [contentKey]);
  const onNavigate: ScreenProps['navigate'] = (route, options) => {
    setDrawerOpen(false);
    navigate(route, options);
  };
  useEffect(() => {
    if (!tablet) setDrawerOpen(false);
  }, [tablet]);
  const {
    workspaces,
    workspace,
    canManage,
    rehearsals,
    adoptedSongs,
    recommendations,
    selectWorkspace,
    createWorkspace,
    storageError,
    actionError,
    clearActionError,
  } = useMockAppState();
  const menuState = useShellMenuState(activeRoute, entityId, workspace?.id);
  const tour = useShellTour({
    contentKey,
    activeRoute,
    currentUserId,
    workspaceId: workspace?.id,
    onNavigate,
    onCloseSwitcher: () => setSwitcherOpen(false),
  });
  const { personal, toolsPage, bandSpace, scoreEditorPage } = getShellRouteState(activeRoute);
  const crumbs = getShellCrumbs({
    activeRoute,
    workspace,
    adoptedSongs,
    entityId,
    songTab,
    onNavigate,
  });
  const choose = (id: string) => {
    selectWorkspace(id);
    setSwitcherOpen(false);
    onNavigate('home', { workspaceId: id });
  };
  const openCreate = () => {
    setDrawerOpen(false);
    setSwitcherOpen(false);
    setCreating(true);
  };
  const openJoin = () => {
    setDrawerOpen(false);
    setSwitcherOpen(false);
    setJoining(true);
  };
  const closeBandModal = () => {
    setSwitcherOpen(false);
    setCreating(false);
  };
  const openSettings = () => {
    setSwitcherOpen(false);
    onNavigate('settings');
  };
  const sidebar = (
    <MainLayoutSidebar
      activeRoute={activeRoute}
      onNavigate={onNavigate}
      entityId={entityId}
      adoptedSongs={adoptedSongs}
      workspace={workspace}
      workspaces={workspaces}
      profile={profile}
      desktop={desktop}
      tablet={tablet}
      bandSpace={bandSpace}
      toolsPage={toolsPage}
      tourOpen={tour.tourOpen}
      tourSidebar={tour.tourSidebar}
      switcherOpen={switcherOpen}
      onToggleSwitcher={() => setSwitcherOpen((open) => !open)}
      onChooseWorkspace={choose}
      onCreate={openCreate}
      onJoin={openJoin}
      onCloseDrawer={() => setDrawerOpen(false)}
      {...menuState}
    />
  );
  return (
    <ScreenHelpContext.Provider
      value={() => {
        setNotificationsOpen(false);
        tour.requestTour();
      }}
    >
      <Shell>
        {(desktop || (tour.tourOpen && tour.tourSidebar)) && sidebar}
        <NavigationDrawer
          visible={tablet && drawerOpen && !tour.tourOpen}
          onClose={() => setDrawerOpen(false)}
        >
          {sidebar}
        </NavigationDrawer>
        <Main>
          <MainLayoutTopbar
            desktop={desktop}
            tablet={tablet}
            mobile={mobile}
            drawerOpen={drawerOpen}
            showSyncControls={!scoreEditorPage && !hideSyncControls}
            notificationsOpen={notificationsOpen}
            unreadCount={unreadCount}
            profile={profile}
            crumbs={crumbs}
            onNavigate={onNavigate}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenSwitcher={() => setSwitcherOpen(true)}
            onToggleNotifications={() => setNotificationsOpen((open) => !open)}
          />
          <PageScroll
            key={contentKey}
            nativeID="app-page-scroll"
            contentContainerStyle={AppPageScrollContentStyle({ $width: width })}
          >
            {storageError && (
              <MainLayoutMeta accessibilityRole="alert">
                브라우저에 변경 내용을 저장하지 못했어요. 새로고침하면 변경 내용이 사라질 수
                있습니다.
              </MainLayoutMeta>
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
          {mobile && (
            <MainLayoutBottomNav
              activeRoute={activeRoute}
              onNavigate={onNavigate}
              personal={personal}
              toolsPage={toolsPage}
              bandSpace={bandSpace}
            />
          )}
        </Main>
        <BandCreateModal
          visible={creating}
          onClose={closeBandModal}
          onSettings={!desktop ? openSettings : undefined}
          onCreated={choose}
          createWorkspace={createWorkspace}
        />
        <SpaceSwitcherModal
          visible={mobile && switcherOpen && !tour.tourOpen && !creating}
          onClose={closeBandModal}
          onSettings={!desktop ? openSettings : undefined}
          workspaces={workspaces}
          workspace={workspace}
          currentUserId={currentUserId}
          onChoose={choose}
          onCreate={openCreate}
          onJoin={openJoin}
          onNavigate={onNavigate}
        />
        <MainLayoutHelp
          open={tour.tourOpen}
          activeRoute={activeRoute}
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
          onClose={tour.closeTour}
          onComplete={tour.completeTour}
          onStep={(target) => {
            tour.onTourStep(target);
            setSwitcherOpen(target === 'tour-band-actions' || target === 'tour-band-switcher');
          }}
          onCreate={() => {
            tour.closeTour();
            openCreate();
          }}
          onJoin={() => {
            tour.closeTour();
            openJoin();
          }}
          onHelp={() => {
            tour.closeTour();
            onNavigate('help');
          }}
        />
        {notificationsOpen && (
          <NotificationPanel navigate={onNavigate} onClose={() => setNotificationsOpen(false)} />
        )}
        <BandJoinModal visible={joining} onClose={() => setJoining(false)} onJoined={choose} />
      </Shell>
    </ScreenHelpContext.Provider>
  );
}

const MainLayoutMeta = styledNative(Meta)({ color: '#be3b4b' });

const AppPageScrollContentStyle = ({ $width }: { $width: number }) =>
  nativeCss({
    padding: $width < 480 ? 12 : $width < 620 ? 16 : 28,
    gap: 20,
    width: '100%',
    maxWidth: 1260,
    alignSelf: 'center',
  });
