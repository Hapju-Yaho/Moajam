import styledWeb from '@emotion/styled';
import { useRef, useState } from 'react';
import { Meta } from './ProductUI';
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
  const input = useRef<HTMLInputElement>(null);

  return (
    <ProfilePhotoContainer $horizontal={horizontal}>
      <ProfilePhotoContainer2 $avatarOnly={avatarOnly}>
        {value ? (
          <ProfilePhotoImg
            src={value}
            alt="내 프로필"
            $avatarOnly={avatarOnly}
            $horizontal={horizontal}
          />
        ) : (
          <ProfilePhotoContainer3
            aria-hidden="true"
            $avatarOnly={avatarOnly}
            $horizontal={horizontal}
          >
            {avatarOnly ? (
              <ProfilePhotoContainer4>
                <ProfilePhotoContainer5 />
                <ProfilePhotoContainer6 />
              </ProfilePhotoContainer4>
            ) : (
              '사진'
            )}
          </ProfilePhotoContainer3>
        )}
        {avatarOnly && (
          <ProfilePhotoButton
            type="button"
            aria-label={value ? '프로필 사진 변경' : '프로필 사진 선택'}
            title="PNG·JPEG·WebP, 최대 500KB"
            disabled={disabled}
            onClick={() => input.current?.click()}
            $disabled={disabled}
          >
            <ProfilePhotoIcon width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 2v12M2 8h12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </ProfilePhotoIcon>
          </ProfilePhotoButton>
        )}
      </ProfilePhotoContainer2>
      <ProfilePhotoContainer7 $horizontal={horizontal}>
        {!avatarOnly && (
          <ProfilePhotoButton2
            type="button"
            disabled={disabled}

            onClick={() => input.current?.click()}
          >
            {value ? '사진 변경' : '사진 선택'}
          </ProfilePhotoButton2>
        )}
        <ProfilePhotoInput
          ref={input}

          aria-label="프로필 사진 변경"
          type="file"
          disabled={disabled}
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            event.target.value = '';
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
              setError('PNG, JPEG, WebP 사진을 선택해주세요.');
              return;
            }
            if (file.size > 500 * 1024) {
              setError('500KB 이하의 사진을 선택해주세요.');
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              onChange(String(reader.result));
              setError('');
            };
            reader.onerror = () => setError('사진을 읽지 못했어요.');
            reader.readAsDataURL(file);
          }}
        />
        {value && !avatarOnly ? (
          <ProfilePhotoButton2
            type="button"

            disabled={disabled}
            onClick={() => {
              onChange('');
              setError('');
            }}
          >
            사진 삭제
          </ProfilePhotoButton2>
        ) : null}
      </ProfilePhotoContainer7>
      {error ? <Meta>{error}</Meta> : null}
    </ProfilePhotoContainer>
  );
}

const ProfilePhotoContainer = styledWeb('div')<{ $horizontal: boolean }>(({ $horizontal }) => ({
  '&&&&': {
    display: 'flex',
    flexDirection: $horizontal ? 'row' : 'column',
    alignItems: $horizontal ? 'center' : undefined,
    gap: 12,
    flexWrap: 'wrap',
  },
}));

const ProfilePhotoContainer2 = styledWeb('div')<{ $avatarOnly: boolean }>(({ $avatarOnly }) => ({
  '&&&&': { position: 'relative', width: $avatarOnly ? 120 : undefined, flexShrink: 0 },
}));

const ProfilePhotoImg = styledWeb('img')<{ $avatarOnly: boolean; $horizontal: boolean }>(
  ({ $avatarOnly, $horizontal }) => ({
    '&&&&': {
      width: $avatarOnly ? 120 : $horizontal ? 112 : 64,
      height: $avatarOnly ? 120 : $horizontal ? 112 : 64,
      borderRadius: $avatarOnly ? 60 : $horizontal ? 56 : 32,
      objectFit: 'cover',
    },
  }),
);

const ProfilePhotoContainer3 = styledWeb('div')<{ $avatarOnly: boolean; $horizontal: boolean }>(
  ({ $avatarOnly, $horizontal }) => ({
    '&&&&': {
      width: $avatarOnly ? 120 : $horizontal ? 112 : 64,
      height: $avatarOnly ? 120 : $horizontal ? 112 : 64,
      borderRadius: $avatarOnly ? 60 : $horizontal ? 56 : 32,
      background: '#edf3ff',
      color: '#6980a4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
    },
  }),
);

const ProfilePhotoContainer4 = styledWeb('div')({
  '&&&&': { position: 'relative', width: 64, height: 72 },
});

const ProfilePhotoContainer5 = styledWeb('div')({
  '&&&&': {
    position: 'absolute',
    top: 4,
    left: 18,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#cfe0ff',
  },
});

const ProfilePhotoContainer6 = styledWeb('div')({
  '&&&&': {
    position: 'absolute',
    bottom: 6,
    left: 4,
    width: 56,
    height: 30,
    borderRadius: '50%',
    background: '#cfe0ff',
  },
});

const ProfilePhotoButton = styledWeb('button')<{ $disabled: boolean }>(({ $disabled }) => ({
  '&&&&': {
    position: 'absolute',
    right: 5,
    bottom: 6,
    width: 24,
    height: 24,
    padding: 0,
    border: '1px solid #dce3ed',
    borderRadius: '50%',
    background: 'white',
    color: '#46586c',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px #0002',
    cursor: $disabled ? 'default' : 'pointer',
  },
}));

const ProfilePhotoIcon = styledWeb('svg')({ '&&&&': { display: 'block' } });

const ProfilePhotoContainer7 = styledWeb('div')<{ $horizontal: boolean }>(({ $horizontal }) => ({
  '&&&&': {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginLeft: $horizontal ? 'auto' : undefined,
  },
}));

const ProfilePhotoButton2 = styledWeb('button')({
  '&&&&': {
    border: '1px solid #dce3ed',
    borderRadius: 10,
    background: 'white',
    color: '#46586c',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 14,
  },
});

const ProfilePhotoInput = styledWeb('input')({ '&&&&': { display: 'none' } });
