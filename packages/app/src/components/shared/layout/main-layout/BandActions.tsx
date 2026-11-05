import styledNative from '@emotion/native';
import { Stack, theme } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { NavItem, NavIcon, SidebarText, NavLabel } from './MainLayout.styles';
import type { ShellBandActionsProps } from './mainLayout.types';
export function BandActions({ onCreate, onJoin }: ShellBandActionsProps) {
  return (
    <TourBandActions nativeID="tour-band-actions" gap={4}>
      <BandActionsNavItem accessibilityRole="button" onPress={onCreate}>
        <NavIcon>
          <BandActionsSidebarText>＋</BandActionsSidebarText>
        </NavIcon>
        <NavLabel active>밴드 만들기</NavLabel>
      </BandActionsNavItem>
      <BandActionsNavItem accessibilityRole="button" onPress={onJoin}>
        <NavIcon>
          <AppIcon name="user-plus" size={18} color="#56657c" />
        </NavIcon>
        <NavLabel>밴드 참여하기</NavLabel>
      </BandActionsNavItem>
    </TourBandActions>
  );
}

const TourBandActions = styledNative(Stack)({
  paddingTop: 6,
  marginTop: 4,
  borderTopWidth: 1,
  borderTopColor: '#e1e7f0',
});

const BandActionsNavItem = styledNative(NavItem)({ minHeight: 40 });

const BandActionsSidebarText = styledNative(SidebarText)({
  fontSize: 20,
  color: theme.colors.primary,
});
