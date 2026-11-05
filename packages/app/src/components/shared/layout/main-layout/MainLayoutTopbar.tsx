import { css as nativeCss } from '@emotion/native';
import styledNative from '@emotion/native';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Avatar, AvatarText } from '@styles/layout';
import { Meta } from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';
import { WorkspaceSyncControls } from '@component/shared/layout/WorkspaceSyncControls';
import { Topbar, TopbarAction, TopbarTitle } from './MainLayout.styles';
import { ShellBrand } from './ShellBrand';
import type { ShellCrumb, ShellProfile, ShellRouteProps } from './mainLayout.types';
interface MainLayoutTopbarProps {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
  drawerOpen: boolean;
  showSyncControls: boolean;
  notificationsOpen: boolean;
  unreadCount: number;
  profile: ShellProfile;
  crumbs: ShellCrumb[];
  onNavigate: ShellRouteProps['onNavigate'];
  onOpenDrawer: () => void;
  onOpenSwitcher: () => void;
  onToggleNotifications: () => void;
}
export function MainLayoutTopbar({
  desktop,
  tablet,
  mobile,
  drawerOpen,
  showSyncControls,
  notificationsOpen,
  unreadCount,
  profile,
  crumbs,
  onNavigate,
  onOpenDrawer,
  onOpenSwitcher,
  onToggleNotifications,
}: MainLayoutTopbarProps) {
  return (
    <MainLayoutTopbarTopbar $desktop={desktop}>
      <MainLayoutTopbarContainer>
        {tablet && (
          <TabletMenuButton
            nativeID="tablet-menu-button"
            accessibilityRole="button"
            accessibilityLabel="메뉴 열기"
            accessibilityState={{ expanded: drawerOpen }}
            onPress={onOpenDrawer}
          >
            <AppIcon name="menu" size={22} color="#566b8c" />
          </TabletMenuButton>
        )}
        {mobile && <ShellBrand compact onPress={() => onNavigate('personal-home')} />}
        <MainLayoutTopbarScroll
          horizontal
          showsHorizontalScrollIndicator={false}

          contentContainerStyle={MainLayoutTopbarMainLayoutTopbarScrollContentStyle}
        >
          {crumbs.map((crumb, index) => (
            <MainLayoutTopbarContainer2 key={`${index}-${crumb.label}`}>
              {index > 0 && <AppIcon name="chevron-right" size={14} color="#b3bdcc" />}
              {crumb.onPress ? (
                <MainLayoutTopbarButton
                  accessibilityRole="button"
                  accessibilityLabel={`${crumb.label}${index === 0 ? ' 홈' : ''}으로 이동`}
                  onPress={crumb.onPress}
                >
                  <Meta numberOfLines={1}>{crumb.label}</Meta>
                </MainLayoutTopbarButton>
              ) : (
                <TopbarTitle numberOfLines={1}>{crumb.label}</TopbarTitle>
              )}
            </MainLayoutTopbarContainer2>
          ))}
        </MainLayoutTopbarScroll>
      </MainLayoutTopbarContainer>
      <MainLayoutTopbarContainer3 $mobile={mobile}>
        {mobile && (
          <TopbarAction
            accessibilityRole="button"
            accessibilityLabel="밴드 선택"
            onPress={onOpenSwitcher}
          >
            <AppIcon name="users" size={19} color="#72819a" />
          </TopbarAction>
        )}
        {showSyncControls && <WorkspaceSyncControls />}
        <MainLayoutTopbarButton2
          accessibilityRole="button"
          accessibilityLabel={`알림${unreadCount ? `, 읽지 않은 알림 ${unreadCount}개` : ''}`}
          accessibilityState={{ expanded: notificationsOpen }}
          onPress={onToggleNotifications}
          $notificationsOpen={notificationsOpen}
        >
          <AppIcon name="bell" size={21} color="#566b8c" />
          {unreadCount > 0 && (
            <MainLayoutTopbarMeta>{unreadCount > 99 ? '99+' : unreadCount}</MainLayoutTopbarMeta>
          )}
        </MainLayoutTopbarButton2>

        <TopbarAction
          accessibilityRole="button"
          accessibilityLabel="내 프로필과 설정"
          onPress={() => onNavigate('settings')}
        >
          <Avatar color="#eef2f8" size={30}>
            <>
              {profile.photo ? (
                <MainLayoutTopbarImage source={{ uri: profile.photo }} />
              ) : (
                <AvatarText>{profile.name.slice(-2)}</AvatarText>
              )}
            </>
          </Avatar>
        </TopbarAction>
      </MainLayoutTopbarContainer3>
    </MainLayoutTopbarTopbar>
  );
}

const MainLayoutTopbarTopbar = styledNative(Topbar, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $desktop: boolean }>(({ $desktop }) => ({
  paddingLeft: $desktop ? 28 : 12,
  paddingRight: $desktop ? 28 : 12,
}));

const MainLayoutTopbarContainer = styledNative(View)({
  flex: 1,
  minWidth: 0,
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 12,
  columnGap: 12,
});

const TabletMenuButton = styledNative(TopbarAction)({ width: 40, height: 40 });

const MainLayoutTopbarScroll = styledNative(ScrollView)({ flex: 1, minWidth: 0 });

const MainLayoutTopbarContainer2 = styledNative(View)({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 10,
  columnGap: 10,
});

const MainLayoutTopbarButton = styledNative(Pressable)({ paddingTop: 10, paddingBottom: 10 });

const MainLayoutTopbarContainer3 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $mobile: boolean }>(({ $mobile }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: $mobile ? 4 : 10,
  columnGap: $mobile ? 4 : 10,
  marginLeft: $mobile ? 6 : 12,
}));

const MainLayoutTopbarButton2 = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $notificationsOpen: boolean }>(({ $notificationsOpen }) => ({
  width: 38,
  height: 38,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  backgroundColor: $notificationsOpen ? '#edf3ff' : '#f6f8fb',
}));

const MainLayoutTopbarMeta = styledNative(Meta)({
  position: 'absolute',
  top: -5,
  right: -7,
  minWidth: 18,
  paddingLeft: 4,
  paddingRight: 4,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: '#386ce4',
  color: 'white',
  fontSize: 10,
  lineHeight: 18,
  textAlign: 'center',
});

const MainLayoutTopbarImage = styledNative(Image)({
  width: 36,
  height: 36,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  borderBottomRightRadius: 18,
  borderBottomLeftRadius: 18,
});

const MainLayoutTopbarMainLayoutTopbarScrollContentStyle = nativeCss({
  alignItems: 'center',
  gap: 10,
});
