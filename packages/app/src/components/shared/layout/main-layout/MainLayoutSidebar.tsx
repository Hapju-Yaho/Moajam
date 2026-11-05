import styledNative from '@emotion/native';
import type { Dispatch, SetStateAction } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { SpaceMenuReveal } from '@component/shared/layout/SpaceMenuReveal';
import { Sidebar, TopbarAction, NavGroupLabel } from './MainLayout.styles';
import { ShellBrand } from './ShellBrand';
import { ShellProfile } from './ShellProfile';
import { ShellWorkspaceMenu } from './ShellWorkspaceMenu';
import { ShellToolsMenu } from './ShellToolsMenu';
import { ShellNavList, type ShellNavListProps } from './ShellNavList';
import { bandItems, personalItems } from './mainLayout.navigation';
import type {
  ShellWorkspace,
  ShellProfile as ProfileData,
  ShellBandActionsProps,
} from './mainLayout.types';
interface MainLayoutSidebarProps extends Omit<ShellNavListProps, 'items'>, ShellBandActionsProps {
  profile: ProfileData;
  workspaces: ShellWorkspace[];
  desktop: boolean;
  tablet: boolean;
  bandSpace: boolean;
  toolsPage: boolean;
  tourOpen: boolean;
  tourSidebar: boolean;
  switcherOpen: boolean;
  toolsOpen: boolean;
  setToolsOpen: Dispatch<SetStateAction<boolean>>;
  onToggleSwitcher: () => void;
  onChooseWorkspace: (id: string) => void;
  onCloseDrawer: () => void;
}
export function MainLayoutSidebar({
  profile,
  workspaces,
  desktop,
  tablet,
  bandSpace,
  toolsPage,
  tourOpen,
  tourSidebar,
  switcherOpen,
  toolsOpen,
  setToolsOpen,
  onToggleSwitcher,
  onChooseWorkspace,
  onCloseDrawer,
  onCreate,
  onJoin,
  ...navigation
}: MainLayoutSidebarProps) {
  const { workspace, onNavigate } = navigation;
  return (
    <AppSidebar nativeID="app-sidebar" $tablet={tablet} $desktop={desktop} $tourOpen={tourOpen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <MainLayoutSidebarContainer>
          <ShellBrand onPress={() => onNavigate('personal-home')} />
          {tablet && !tourOpen && (
            <TopbarAction
              accessibilityRole="button"
              accessibilityLabel="메뉴 닫기"
              onPress={onCloseDrawer}
            >
              <AppIcon name="close" size={21} color="#72819a" />
            </TopbarAction>
          )}
        </MainLayoutSidebarContainer>
        <NavGroupLabel nativeID="tour-personal-space">개인 공간</NavGroupLabel>
        <Stack nativeID="tour-personal-menu" gap={2}>
          <ShellNavList {...navigation} items={personalItems.slice(0, 1)} />
          <SpaceMenuReveal id="personal-extra" visible={!bandSpace || (tourOpen && tourSidebar)}>
            <Stack gap={2}>
              <ShellNavList {...navigation} items={personalItems.slice(1)} />
            </Stack>
          </SpaceMenuReveal>
        </Stack>
        <ShellToolsMenu
          bandSpace={bandSpace}
          toolsPage={toolsPage}
          toolsOpen={toolsOpen}
          setToolsOpen={setToolsOpen}
          navigation={navigation}
        />
        <NavGroupLabel nativeID="tour-band-space">밴드 공간</NavGroupLabel>
        <ShellWorkspaceMenu
          workspace={workspace}
          workspaces={workspaces}
          switcherOpen={switcherOpen}
          onToggle={onToggleSwitcher}
          onChoose={onChooseWorkspace}
          onCreate={onCreate}
          onJoin={onJoin}
        />
        <SpaceMenuReveal id="band-menu" visible={bandSpace || (tourOpen && tourSidebar)}>
          <Stack nativeID="tour-band-menu" gap={2}>
            {workspace ? <ShellNavList {...navigation} items={bandItems} /> : null}
          </Stack>
        </SpaceMenuReveal>
      </ScrollView>
      <MainLayoutSidebarContainer2>
        <ShellProfile profile={profile} onNavigate={onNavigate} />
      </MainLayoutSidebarContainer2>
    </AppSidebar>
  );
}

const AppSidebar = styledNative(Sidebar, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $tablet: boolean; $desktop: boolean; $tourOpen: boolean }>(
  ({ $tablet, $desktop, $tourOpen }) => ({
    paddingLeft: 12,
    paddingRight: 12,
    width: $tablet ? 280 : 232,
    height: '100%',
    ...(!$desktop && $tourOpen
      ? { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 20 }
      : {}),
  }),
);

const MainLayoutSidebarContainer = styledNative(View)({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const MainLayoutSidebarContainer2 = styledNative(View)({ paddingTop: 16 });
