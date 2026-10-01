import { useState } from 'react';
import { useMockAppState } from '../state/MockAppState';
import { ProfilePhoto } from './ProfilePhoto';
import { ActionButton, FlexBetween, Heading, Meta, Surface } from './ProductUI';
import { Input } from '../styles/layout';
export function BandSettings({ onClose }: { onClose?: () => void }) {
  const { workspace, canManage, updateWorkspaceProfile } = useMockAppState();
  const [name, setName] = useState(workspace?.name ?? '');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [photo, setPhoto] = useState(workspace?.photo ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <Surface>
      <FlexBetween>
        <Heading>밴드 설정</Heading>
        {onClose && (
          <ActionButton secondary compact onPress={onClose}>
            닫기
          </ActionButton>
        )}
      </FlexBetween>
      <Meta>밴드 프로필 이미지</Meta>
      <ProfilePhoto horizontal value={photo} onChange={setPhoto} disabled={!canManage || busy} />
      <Meta>밴드 이름</Meta>
      <Input
        accessibilityLabel="밴드 이름"
        value={name}
        onChangeText={setName}
        maxLength={80}
        editable={canManage && !busy}
      />
      <Meta>밴드 설명</Meta>
      <Input
        accessibilityLabel="밴드 설명"
        multiline
        value={description}
        onChangeText={setDescription}
        maxLength={2000}
        editable={canManage && !busy}
      />
      {!canManage && <Meta>밴드 관리자만 설정을 수정할 수 있어요.</Meta>}
      <ActionButton
        disabled={!canManage || busy || !name.trim()}
        onPress={() => {
          setBusy(true);
          setMessage('');
          void updateWorkspaceProfile(name.trim(), description, photo)
            .then(() => {
              setMessage('밴드 설정을 저장했습니다.');
              onClose?.();
            })
            .catch((error: Error) => setMessage(error.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? '저장 중…' : '밴드 설정 저장'}
      </ActionButton>
      {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
    </Surface>
  );
}
