import styledNative from '@emotion/native';
import type { PropsWithChildren } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { ActionButton, Heading, Surface } from '@component/shared/ui/ProductUI';
export function ShellModalFrame({
  visible,
  title,
  onClose,
  onSettings,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  onSettings?: () => void;
}>) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ShellModalFrameContainer>
        <ShellModalFrameButton accessibilityLabel="밴드 창 닫기" onPress={onClose} />
        <ShellModalFramePanel>
          <ShellModalFrameContainer2>
            <Heading>{title}</Heading>
            <ActionButton secondary compact onPress={onClose}>
              닫기
            </ActionButton>
          </ShellModalFrameContainer2>
          {children}
          {onSettings && (
            <ActionButton secondary onPress={onSettings}>
              설정
            </ActionButton>
          )}
        </ShellModalFramePanel>
      </ShellModalFrameContainer>
    </Modal>
  );
}

const ShellModalFrameContainer = styledNative(View)({
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  backgroundColor: 'rgba(16,29,53,0.48)',
});

const ShellModalFrameButton = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
});

const ShellModalFramePanel = styledNative(Surface)({
  width: '100%',
  maxWidth: 410,
  maxHeight: '90%',
});

const ShellModalFrameContainer2 = styledNative(View)({
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
});
