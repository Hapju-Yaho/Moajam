import styledNative from '@emotion/native';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, theme } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { SpaceMenuReveal } from '@component/shared/layout/SpaceMenuReveal';
import { NavItem, NavIcon, NavLabel } from './MainLayout.styles';
import { toolItems } from './mainLayout.navigation';
import { ShellNavList, type ShellNavListProps } from './ShellNavList';
export function ShellToolsMenu({
  bandSpace,
  toolsPage,
  toolsOpen,
  setToolsOpen,
  navigation,
}: {
  bandSpace: boolean;
  toolsPage: boolean;
  toolsOpen: boolean;
  setToolsOpen: Dispatch<SetStateAction<boolean>>;
  navigation: Omit<ShellNavListProps, 'items'>;
}) {
  const { onNavigate } = navigation;
  return (
    <SpaceMenuReveal id="music-tools" visible={!bandSpace}>
      <TourMusicTools nativeID="tour-music-tools" $toolsPage={toolsPage}>
        <ShellToolsMenuNavItem
          active={toolsPage}
          accessibilityRole="button"
          accessibilityLabel="작업실 메뉴"
          onPress={() => {
            setToolsOpen(true);
            onNavigate('work-management');
          }}
        >
          <NavIcon>
            <AppIcon name="studio" size={18} color={toolsPage ? theme.colors.primary : '#56657c'} />
          </NavIcon>
          <ShellToolsMenuNavLabel active={toolsPage}>작업실</ShellToolsMenuNavLabel>
        </ShellToolsMenuNavItem>
        <ShellToolsMenuButton
          accessibilityRole="button"
          accessibilityLabel="작업실 하위 메뉴 펼치기 또는 접기"
          accessibilityState={{ expanded: toolsOpen }}
          onPress={() => setToolsOpen((open) => !open)}
        >
          <ShellToolsMenuContainer $toolsOpen={toolsOpen}>
            <AppIcon
              name="chevron-down"
              size={16}
              color={toolsPage ? theme.colors.primary : '#7b879f'}
            />
          </ShellToolsMenuContainer>
        </ShellToolsMenuButton>
      </TourMusicTools>
      <SpaceMenuReveal id="sidebar-workshop-list" visible={toolsOpen}>
        <ShellToolsMenuStack gap={2}>
          <ShellNavList {...navigation} items={toolItems} />
        </ShellToolsMenuStack>
      </SpaceMenuReveal>
    </SpaceMenuReveal>
  );
}

const TourMusicTools = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $toolsPage: boolean }>(({ $toolsPage }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: $toolsPage ? '#eaf0fc' : 'transparent',
}));

const ShellToolsMenuNavItem = styledNative(NavItem)({
  rowGap: 12,
  columnGap: 12,
  flex: 1,
  minHeight: 40,
  paddingRight: 0,
});

const ShellToolsMenuNavLabel = styledNative(NavLabel)({ flex: 1 });

const ShellToolsMenuButton = styledNative(Pressable)({
  width: 32,
  height: 40,
  alignItems: 'center',
  justifyContent: 'center',
});

const ShellToolsMenuContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $toolsOpen: boolean }>(({ $toolsOpen }) => ({
  transform: [{ rotate: $toolsOpen ? '180deg' : '0deg' }],
}));

const ShellToolsMenuStack = styledNative(Stack)({ paddingLeft: 18, paddingBottom: 6 });
