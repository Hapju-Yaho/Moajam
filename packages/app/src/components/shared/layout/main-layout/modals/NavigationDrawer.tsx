import styledNative from '@emotion/native';
import type { PropsWithChildren } from 'react';
import { Pressable, View } from 'react-native';
import { ScheduleDialog } from '@component/shared/ui/ScheduleDialog';
export function NavigationDrawer({
  visible,
  onClose,
  children,
}: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  return (
    <ScheduleDialog visible={visible} onClose={onClose} label="전체 메뉴">
      <TabletNavigationDrawer nativeID="tablet-navigation-drawer">
        <NavigationDrawerButton
          accessibilityRole="button"
          accessibilityLabel="메뉴 바깥 영역 닫기"
          onPress={onClose}
        />
        {visible && children}
      </TabletNavigationDrawer>
    </ScheduleDialog>
  );
}

const TabletNavigationDrawer = styledNative(View)({
  flex: 1,
  flexDirection: 'row',
  backgroundColor: 'rgba(16,29,53,0.36)',
});

const NavigationDrawerButton = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
