import styledNative from '@emotion/native';
import { theme } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { BottomNav, BottomItem, BottomLabel } from './MainLayout.styles';
import { activeGroup, bandItems, personalItems, toolItems } from './mainLayout.navigation';
import type { ShellRouteProps } from './mainLayout.types';
export function MainLayoutBottomNav({
  activeRoute,
  onNavigate,
  toolsPage,
  personal,
  bandSpace,
}: ShellRouteProps & { toolsPage: boolean; personal: boolean; bandSpace: boolean }) {
  return (
    <BottomNav nativeID="mobile-bottom-nav">
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
          <MainLayoutBottomNavBottomItem
            key={item.route}
            accessibilityRole="button"
            onPress={() => onNavigate(item.route)}
          >
            <AppIcon
              name={item.icon}
              color={active ? theme.colors.primary : theme.colors.textMuted}
              size={19}
            />
            <BottomLabel active={active}>{item.label}</BottomLabel>
          </MainLayoutBottomNavBottomItem>
        );
      })}
    </BottomNav>
  );
}

const MainLayoutBottomNavBottomItem = styledNative(BottomItem)({ rowGap: 3, columnGap: 3 });
