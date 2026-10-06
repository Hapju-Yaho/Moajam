import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ActionButton, Meta } from './ProductUI';
export function ProfilePhoto({
  value,
  onChange,
  disabled = false,
  horizontal = false,
  avatarOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  horizontal?: boolean;
  avatarOnly?: boolean;
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
    <View
      style={{
        flexDirection: horizontal ? 'row' : 'column',
        alignItems: horizontal ? 'center' : undefined,
        gap: 12,
      }}
    >
      <View style={{ position: 'relative' }}>
        {value ? (
          <Image
            source={{ uri: value }}
            accessibilityLabel="내 프로필"
            style={{
              width: avatarOnly ? 120 : horizontal ? 112 : 64,
              height: avatarOnly ? 120 : horizontal ? 112 : 64,
              borderRadius: avatarOnly ? 60 : horizontal ? 56 : 32,
            }}
          />
        ) : avatarOnly ? (
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: '#edf3ff',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#cfe0ff' }} />
            <View style={{ width: 56, height: 30, borderRadius: 28, backgroundColor: '#cfe0ff' }} />
          </View>
        ) : null}
        {avatarOnly && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="프로필 사진 선택"
            disabled={disabled || picking}
            onPress={() => void pick()}
            style={{
              position: 'absolute',
              right: 5,
              bottom: 6,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#dce3ed',
            }}
          >
            <Text style={{ color: '#46586c', fontSize: 20 }}>+</Text>
          </Pressable>
        )}
      </View>
      {!avatarOnly && (
        <View style={{ gap: 8, marginLeft: horizontal ? 'auto' : undefined }}>
          <ActionButton secondary disabled={disabled || picking} onPress={() => void pick()}>
            {picking ? '사진 불러오는 중…' : '프로필 사진 선택'}
          </ActionButton>
          {value ? (
            <ActionButton secondary disabled={disabled || picking} onPress={() => onChange('')}>
              사진 삭제
            </ActionButton>
          ) : null}
        </View>
      )}
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
    </View>
  );
}
