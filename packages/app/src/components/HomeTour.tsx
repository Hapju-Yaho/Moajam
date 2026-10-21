import type { ReactNode } from 'react';
import type { BandHomeTourInfo } from '../lib/bandHomeTour';
import { Modal, View } from 'react-native';
import { ActionButton, Heading, Copy, Surface } from './ProductUI';
export type HomeTourProps = {
  onComplete?: () => void;
  onReady?: () => void;
  initialStep?: number;
  customSteps?: {
    groupHighlight?: boolean;
    placement?: 'bottom';
    scroll?: boolean;
    wide?: boolean;
    width?: number;
    title: string;
    body: string;
    target: string;
    example?: ReactNode;
    actionLabel?: string;
    action?: () => void;
  }[];
  tourTitle?: string;
  hasBand: boolean;
  bandHome: boolean;
  bandInfo?: BandHomeTourInfo;
  onClose: () => void;
  onStep: (target: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onHelp: () => void;
};
export function HomeTour({ bandHome, onClose, onHelp }: HomeTourProps) {
  return (
    <Modal transparent visible onRequestClose={onClose}>
      <View
        style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#101d5399' }}
      >
        <Surface>
          <Heading>
            {bandHome ? '밴드에 참여하신 걸 환영해요!' : '모아잼에 오신 것을 환영해요!'}
          </Heading>
          <Copy>
            개인 공간에서는 여러 밴드의 일정과 참여곡을 모아 보고, 밴드 공간에서는 곡과 합주·연습을
            함께 준비할 수 있어요.
          </Copy>
          <ActionButton onPress={onHelp}>도움말 보기</ActionButton>
          <ActionButton secondary onPress={onClose}>
            시작하기
          </ActionButton>
        </Surface>
      </View>
    </Modal>
  );
}
