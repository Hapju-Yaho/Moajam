import styledNative from '@emotion/native';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
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
    <ProfilePhotoContainer $horizontal={horizontal}>
      <ProfilePhotoContainer2>
        {value ? (
          <ProfilePhotoImage
            source={{ uri: value }}
            accessibilityLabel="내 프로필"
            $avatarOnly={avatarOnly}
            $horizontal={horizontal}
          />
        ) : avatarOnly ? (
          <ProfilePhotoContainer3>
            <ProfilePhotoContainer4 />
            <ProfilePhotoContainer5 />
          </ProfilePhotoContainer3>
        ) : null}
        {avatarOnly && (
          <ProfilePhotoButton
            accessibilityRole="button"
            accessibilityLabel="프로필 사진 선택"
            disabled={disabled || picking}
            onPress={() => void pick()}
          >
            <ProfilePhotoContainer6
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <ProfilePhotoContainer7 />
              <ProfilePhotoContainer8 />
            </ProfilePhotoContainer6>
          </ProfilePhotoButton>
        )}
      </ProfilePhotoContainer2>
      {!avatarOnly && (
        <ProfilePhotoContainer9 $horizontal={horizontal}>
          <ActionButton secondary disabled={disabled || picking} onPress={() => void pick()}>
            {picking ? '사진 불러오는 중…' : '프로필 사진 선택'}
          </ActionButton>
          {value ? (
            <ActionButton secondary disabled={disabled || picking} onPress={() => onChange('')}>
              사진 삭제
            </ActionButton>
          ) : null}
        </ProfilePhotoContainer9>
      )}
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
    </ProfilePhotoContainer>
  );
}

const ProfilePhotoContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $horizontal: boolean }>(({ $horizontal }) => ({
  flexDirection: $horizontal ? 'row' : 'column',
  alignItems: $horizontal ? 'center' : undefined,
  rowGap: 12,
  columnGap: 12,
}));

const ProfilePhotoContainer2 = styledNative(View)({ position: 'relative' });

const ProfilePhotoImage = styledNative(Image, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $avatarOnly: boolean; $horizontal: boolean }>(({ $avatarOnly, $horizontal }) => ({
  width: $avatarOnly ? 120 : $horizontal ? 112 : 64,
  height: $avatarOnly ? 120 : $horizontal ? 112 : 64,
  borderTopLeftRadius: $avatarOnly ? 60 : $horizontal ? 56 : 32,
  borderTopRightRadius: $avatarOnly ? 60 : $horizontal ? 56 : 32,
  borderBottomRightRadius: $avatarOnly ? 60 : $horizontal ? 56 : 32,
  borderBottomLeftRadius: $avatarOnly ? 60 : $horizontal ? 56 : 32,
}));

const ProfilePhotoContainer3 = styledNative(View)({
  width: 120,
  height: 120,
  borderTopLeftRadius: 60,
  borderTopRightRadius: 60,
  borderBottomRightRadius: 60,
  borderBottomLeftRadius: 60,
  backgroundColor: '#edf3ff',
  alignItems: 'center',
  justifyContent: 'center',
  rowGap: 4,
  columnGap: 4,
});

const ProfilePhotoContainer4 = styledNative(View)({
  width: 28,
  height: 28,
  borderTopLeftRadius: 14,
  borderTopRightRadius: 14,
  borderBottomRightRadius: 14,
  borderBottomLeftRadius: 14,
  backgroundColor: '#cfe0ff',
});

const ProfilePhotoContainer5 = styledNative(View)({
  width: 56,
  height: 30,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  borderBottomRightRadius: 28,
  borderBottomLeftRadius: 28,
  backgroundColor: '#cfe0ff',
});

const ProfilePhotoButton = styledNative(Pressable)({
  position: 'absolute',
  right: 5,
  bottom: 6,
  width: 24,
  height: 24,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  backgroundColor: 'white',
  alignItems: 'center',
  justifyContent: 'center',
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: '#dce3ed',
  borderRightColor: '#dce3ed',
  borderBottomColor: '#dce3ed',
  borderLeftColor: '#dce3ed',
});

const ProfilePhotoContainer6 = styledNative(View)({ width: 14, height: 14 });

const ProfilePhotoContainer7 = styledNative(View)({
  position: 'absolute',
  left: 6,
  top: 1,
  width: 2,
  height: 12,
  borderTopLeftRadius: 1,
  borderTopRightRadius: 1,
  borderBottomRightRadius: 1,
  borderBottomLeftRadius: 1,
  backgroundColor: '#46586c',
});

const ProfilePhotoContainer8 = styledNative(View)({
  position: 'absolute',
  left: 1,
  top: 6,
  width: 12,
  height: 2,
  borderTopLeftRadius: 1,
  borderTopRightRadius: 1,
  borderBottomRightRadius: 1,
  borderBottomLeftRadius: 1,
  backgroundColor: '#46586c',
});

const ProfilePhotoContainer9 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $horizontal: boolean }>(({ $horizontal }) => ({
  rowGap: 8,
  columnGap: 8,
  marginLeft: $horizontal ? 'auto' : undefined,
}));
