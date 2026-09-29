import type { PropsWithChildren } from 'react';
import { Modal } from 'react-native';

export function ScheduleDialog({
  visible,
  onClose,
  children,
}: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {children}
    </Modal>
  );
}
