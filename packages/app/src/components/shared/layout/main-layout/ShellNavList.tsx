import styledNative from '@emotion/native';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, theme } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { Meta } from '@component/shared/ui/ProductUI';
import { SpaceMenuReveal } from '@component/shared/layout/SpaceMenuReveal';
import { NavItem, NavIcon, NavLabel } from './MainLayout.styles';
import { activeGroup, bandItems } from './mainLayout.navigation';
import type { ShellRouteProps, ShellSong, ShellWorkspace } from './mainLayout.types';
export interface ShellNavListProps extends ShellRouteProps {
  items: typeof bandItems;
  entityId?: string;
  adoptedSongs: ShellSong[];
  workspace?: ShellWorkspace;
  songsOpen: boolean;
  setSongsOpen: Dispatch<SetStateAction<boolean>>;
}
export function ShellNavList({
  items,
  activeRoute,
  onNavigate,
  entityId,
  adoptedSongs,
  workspace,
  songsOpen,
  setSongsOpen,
}: ShellNavListProps) {
  return items.map((item) => {
    const active = activeGroup(activeRoute, item.route);
    if (items === bandItems && item.route === 'songs')
      return (
        <View key={item.route}>
          <TourBandNavSongs nativeID="tour-band-nav-songs" $active={active}>
            <ShellNavListNavItem
              active={active}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setSongsOpen(true);
                onNavigate('songs');
              }}
            >
              <NavIcon>
                <AppIcon name="songs" color={active ? theme.colors.primary : '#56657c'} size={18} />
              </NavIcon>
              <NavLabel active={active}>{item.label}</NavLabel>
            </ShellNavListNavItem>
            <ShellNavListButton
              accessibilityRole="button"
              accessibilityLabel={songsOpen ? '참여곡 목록 접기' : '참여곡 목록 펼치기'}
              accessibilityState={{ expanded: songsOpen }}
              onPress={() => setSongsOpen((open) => !open)}
            >
              <ShellNavListContainer $songsOpen={songsOpen}>
                <AppIcon
                  name="chevron-down"
                  size={16}
                  color={active ? theme.colors.primary : '#7b879f'}
                />
              </ShellNavListContainer>
            </ShellNavListButton>
          </TourBandNavSongs>
          <SpaceMenuReveal id="sidebar-song-list" visible={songsOpen}>
            <ShellNavListStack gap={2}>
              {adoptedSongs
                .filter((song) => !song.archived)
                .map((song) => {
                  const selected = activeRoute === 'song' && entityId === song.id;
                  return (
                    <ShellNavListNavItem2
                      key={song.id}
                      active={selected}
                      accessibilityRole="button"
                      accessibilityLabel={`${song.title} 곡 상세`}
                      accessibilityState={{ selected }}
                      onPress={() =>
                        onNavigate('song', { id: song.id, workspaceId: workspace?.id })
                      }
                    >
                      <ShellNavListContainer2 $selected={selected} />
                      <ShellNavListNavLabel numberOfLines={2} active={selected}>
                        {song.title}
                      </ShellNavListNavLabel>
                    </ShellNavListNavItem2>
                  );
                })}
              {!adoptedSongs.some((song) => !song.archived) && (
                <ShellNavListMeta>참여곡이 없어요.</ShellNavListMeta>
              )}
            </ShellNavListStack>
          </SpaceMenuReveal>
        </View>
      );
    return (
      <ShellNavListNavItem3
        key={item.route}
        nativeID={items === bandItems ? 'tour-band-nav-' + item.route : undefined}
        active={active}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onNavigate(item.route)}
      >
        <NavIcon>
          <AppIcon name={item.icon} color={active ? theme.colors.primary : '#56657c'} size={18} />
        </NavIcon>
        <NavLabel active={active}>{item.label}</NavLabel>
      </ShellNavListNavItem3>
    );
  });
}

const TourBandNavSongs = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $active: boolean }>(({ $active }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: $active ? '#eaf0fc' : 'transparent',
}));

const ShellNavListNavItem = styledNative(NavItem)({
  rowGap: 12,
  columnGap: 12,
  flex: 1,
  backgroundColor: 'transparent',
});

const ShellNavListButton = styledNative(Pressable)({
  width: 32,
  height: 40,
  alignItems: 'center',
  justifyContent: 'center',
});

const ShellNavListContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $songsOpen: boolean }>(({ $songsOpen }) => ({
  transform: [{ rotate: $songsOpen ? '180deg' : '0deg' }],
}));

const ShellNavListStack = styledNative(Stack)({ paddingLeft: 28, paddingBottom: 6 });

const ShellNavListNavItem2 = styledNative(NavItem)({
  minHeight: 34,
  paddingTop: 7,
  paddingBottom: 7,
});

const ShellNavListContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $selected: boolean }>(({ $selected }) => ({
  width: 4,
  height: 4,
  borderTopLeftRadius: 2,
  borderTopRightRadius: 2,
  borderBottomRightRadius: 2,
  borderBottomLeftRadius: 2,
  flexShrink: 0,
  backgroundColor: $selected ? theme.colors.primary : '#94a3b8',
}));

const ShellNavListNavLabel = styledNative(NavLabel)({ flex: 1, fontSize: 13 });

const ShellNavListMeta = styledNative(Meta)({
  paddingTop: 10,
  paddingRight: 10,
  paddingBottom: 10,
  paddingLeft: 10,
});

const ShellNavListNavItem3 = styledNative(NavItem)({ rowGap: 12, columnGap: 12 });
