import styledNative from '@emotion/native';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Notifications } from './Notifications';
import type { ScreenProps } from '@app/navigation';
export function NotificationPanel({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: ScreenProps['navigate'];
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <NotificationPanelContainer $desktop={desktop}>
        <NotificationPanelButton
          accessibilityRole="button"
          accessibilityLabel="알림 창 닫기"
          onPress={onClose}
        />
        <NotificationPanelContainer2 $desktop={desktop}>
          <Notifications panel navigate={navigate} onClose={onClose} />
        </NotificationPanelContainer2>
      </NotificationPanelContainer>
    </Modal>
  );
}

const NotificationPanelContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $desktop: boolean }>(({ $desktop }) => ({
  flex: 1,
  alignItems: 'flex-end',
  paddingTop: $desktop ? 70 : 0,
  paddingRight: $desktop ? 24 : 0,
  paddingBottom: $desktop ? 24 : 0,
}));

const NotificationPanelButton = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: '#18243a33',
});

const NotificationPanelContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $desktop: boolean }>(({ $desktop }) => ({
  width: $desktop ? 440 : '100%',
  maxWidth: '100%',
  flex: 1,
  maxHeight: $desktop ? 720 : undefined,
  borderTopLeftRadius: $desktop ? 18 : 0,
  borderTopRightRadius: $desktop ? 18 : 0,
  borderBottomRightRadius: $desktop ? 18 : 0,
  borderBottomLeftRadius: $desktop ? 18 : 0,
  overflow: 'hidden',
  backgroundColor: 'white',
}));
