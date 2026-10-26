import { Modal, View } from 'react-native';
import { ActionButton, Copy, Heading, Surface } from './ProductUI';
export function PracticeHelp({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete?: () => void;
}) {
  return (
    <Modal visible transparent onRequestClose={onClose}>
      <View
        style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#101d5399' }}
      >
        <Surface>
          <Heading>연습실 도움말</Heading>
          <Copy>
            곡을 선택하고 악보를 확인하세요. 녹음을 팀원들과 공유하고 구간별 의견을 남길 수 있어요.
          </Copy>
          <ActionButton onPress={onComplete ?? onClose}>완료</ActionButton>
        </Surface>
      </View>
    </Modal>
  );
}
