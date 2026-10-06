import { useState } from 'react';
import { Modal, View } from 'react-native';
import { ActionButton, FlexBetween, Heading, Meta, Surface } from './ProductUI';
import { Input } from '../styles/layout';
import { api, serverConfigured } from '../lib/remote';
import { useMockAppState } from '../state/MockAppState';

export function BandJoinModal({
  visible,
  onClose,
  onJoined,
}: {
  visible: boolean;
  onClose: () => void;
  onJoined: (workspaceId: string) => void;
}) {
  const { reloadRemote } = useMockAppState();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    setMessage('');
    try {
      let code = token.trim();
      try {
        code = new URL(code).searchParams.get('invite') ?? code;
      } catch {
        /* Plain invitation code. */
      }
      const { workspaceId } = await api<{ workspaceId: string }>('/invitations/accept', 'POST', {
        token: code,
      });
      await reloadRemote();
      setToken('');
      setMessage('');
      onClose();
      onJoined(workspaceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '초대 코드를 확인해주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: 'rgba(16,29,53,0.48)',
        }}
      >
        <Surface style={{ width: '100%', maxWidth: 440 }}>
          <FlexBetween>
            <Heading>밴드 참여하기</Heading>
            <ActionButton secondary compact onPress={onClose}>
              닫기
            </ActionButton>
          </FlexBetween>
          <Meta>밴드에서 받은 초대 코드 또는 초대 링크를 입력하세요.</Meta>
          <Input
            accessibilityLabel="초대 코드 또는 링크"
            value={token}
            onChangeText={setToken}
            placeholder="초대 코드 또는 링크"
            autoCapitalize="none"
          />
          {!serverConfigured && <Meta>밴드에 참여하려면 서버 연결과 로그인이 필요해요.</Meta>}
          <ActionButton
            disabled={!serverConfigured || busy || !token.trim()}
            onPress={() => void join()}
          >
            {busy ? '참여 중…' : '초대 수락하고 참여하기'}
          </ActionButton>
          {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
        </Surface>
      </View>
    </Modal>
  );
}
