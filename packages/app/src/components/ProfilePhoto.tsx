import { useState } from 'react';
import { Image } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ActionButton, Meta } from './ProductUI';
export function ProfilePhoto({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const pick = async () => {
    setPicking(true);
    setError('');
    try {
      const result = await getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/webp'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      const mime = asset.mimeType || file.type;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime))
        throw new Error('PNG, JPEG, WebP 사진을 선택해주세요.');
      if (!file.size || file.size > 500 * 1024)
        throw new Error('500KB 이하의 사진을 선택해주세요.');
      onChange(`data:${mime};base64,${await file.base64()}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사진을 읽지 못했어요.');
    } finally {
      setPicking(false);
    }
  };
  return (
    <>
      {value ? (
        <Image
          source={{ uri: value }}
          accessibilityLabel="내 프로필"
          style={{ width: 64, height: 64, borderRadius: 32 }}
        />
      ) : null}
      <ActionButton secondary disabled={disabled || picking} onPress={() => void pick()}>
        {picking ? '사진 불러오는 중…' : '프로필 사진 선택'}
      </ActionButton>
      {value ? (
        <ActionButton secondary disabled={disabled || picking} onPress={() => onChange('')}>
          사진 삭제
        </ActionButton>
      ) : null}
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
    </>
  );
}
