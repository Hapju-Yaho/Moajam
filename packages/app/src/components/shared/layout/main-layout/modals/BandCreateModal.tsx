import styledNative from '@emotion/native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Input } from '@styles/layout';
import { ActionButton, Meta } from '@component/shared/ui/ProductUI';
import { ProfilePhoto } from '@component/shared/ui/ProfilePhoto';
import { ShellModalFrame } from './ShellModalFrame';
interface BandCreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSettings?: () => void;
  onCreated: (id: string) => void;
  createWorkspace: (name: string, description: string, photo: string) => Promise<string>;
}
export function BandCreateModal({
  visible,
  onClose,
  onSettings,
  onCreated,
  createWorkspace,
}: BandCreateModalProps) {
  const [name, setName] = useState('');
  const [bandDescription, setBandDescription] = useState('');
  const [bandPhoto, setBandPhoto] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  useEffect(() => {
    if (visible) setCreateError('');
  }, [visible]);
  return (
    <ShellModalFrame
      visible={visible}
      title="밴드 만들기"
      onClose={onClose}
      onSettings={onSettings}
    >
      <BandCreateModalContainer>
        <Meta>밴드 프로필 이미지</Meta>
        <ProfilePhoto
          horizontal
          value={bandPhoto}
          onChange={setBandPhoto}
          disabled={creatingBusy}
        />
        <Input
          accessibilityLabel="새 밴드 이름"
          placeholder="새 밴드 이름"
          value={name}
          onChangeText={setName}
          maxLength={40}
        />
        <Input
          accessibilityLabel="새 밴드 설명"
          placeholder="밴드 설명"
          multiline
          maxLength={2000}
          value={bandDescription}
          onChangeText={setBandDescription}
          editable={!creatingBusy}
        />
        <ActionButton
          disabled={creatingBusy || !name.trim()}
          onPress={() => {
            if (!name.trim()) return;
            setCreatingBusy(true);
            setCreateError('');
            void createWorkspace(name, bandDescription, bandPhoto)
              .then((id) => {
                onClose();
                setName('');
                setBandDescription('');
                setBandPhoto('');
                onCreated(id);
              })
              .catch((error: unknown) =>
                setCreateError(
                  error instanceof Error ? error.message : '밴드를 만들지 못했습니다.',
                ),
              )
              .finally(() => setCreatingBusy(false));
          }}
        >
          밴드 만들기
        </ActionButton>
        {createError ? <Meta accessibilityRole="alert">{createError}</Meta> : null}
      </BandCreateModalContainer>
    </ShellModalFrame>
  );
}

const BandCreateModalContainer = styledNative(View)({ rowGap: 8, columnGap: 8 });
