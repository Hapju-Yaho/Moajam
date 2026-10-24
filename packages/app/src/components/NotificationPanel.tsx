import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Notifications } from './Notifications';
import type { ScreenProps } from '../navigation';
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
      <View
        style={{
          flex: 1,
          alignItems: 'flex-end',
          paddingTop: desktop ? 70 : 0,
          paddingRight: desktop ? 24 : 0,
          paddingBottom: desktop ? 24 : 0,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 창 닫기"
          onPress={onClose}
          style={{ position: 'absolute', inset: 0, backgroundColor: '#18243a33' }}
        />
        <View
          style={{
            width: desktop ? 440 : '100%',
            maxWidth: '100%',
            flex: 1,
            maxHeight: desktop ? 720 : undefined,
            borderRadius: desktop ? 18 : 0,
            overflow: 'hidden',
            backgroundColor: 'white',
          }}
        >
          <Notifications panel navigate={navigate} onClose={onClose} />
        </View>
      </View>
    </Modal>
  );
}
