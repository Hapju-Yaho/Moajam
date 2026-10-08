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
  const buttonStyle = {
    border: '1px solid #dce3ed',
    borderRadius: 10,
    background: 'white',
    color: '#46586c',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 14,
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        alignItems: horizontal ? 'center' : undefined,
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ position: 'relative', width: avatarOnly ? 120 : undefined, flexShrink: 0 }}>
        {value ? (
          <img
            src={value}
            alt="내 프로필"
            style={{
              width: avatarOnly ? 120 : horizontal ? 112 : 64,
              height: avatarOnly ? 120 : horizontal ? 112 : 64,
              borderRadius: avatarOnly ? 60 : horizontal ? 56 : 32,
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: avatarOnly ? 120 : horizontal ? 112 : 64,
              height: avatarOnly ? 120 : horizontal ? 112 : 64,
              borderRadius: avatarOnly ? 60 : horizontal ? 56 : 32,
              background: '#edf3ff',
              color: '#6980a4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
            }}
          >
            {avatarOnly ? (
              <div style={{ position: 'relative', width: 64, height: 72 }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 18,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#cfe0ff',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    left: 4,
                    width: 56,
                    height: 30,
                    borderRadius: '50%',
                    background: '#cfe0ff',
                  }}
                />
              </div>
            ) : (
              '사진'
            )}
          </div>
        )}
        {avatarOnly && (
          <button
            type="button"
            aria-label={value ? '프로필 사진 변경' : '프로필 사진 선택'}
            title="PNG·JPEG·WebP, 최대 500KB"
            disabled={disabled}
            onClick={() => input.current?.click()}
            style={{
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
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
              style={{ display: 'block' }}
            >
              <path
                d="M8 2v12M2 8h12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginLeft: horizontal ? 'auto' : undefined,
        }}
      >
        {!avatarOnly && (
          <button
            type="button"
            disabled={disabled}
            style={buttonStyle}
            onClick={() => input.current?.click()}
          >
            {value ? '사진 변경' : '사진 선택'}
          </button>
        )}
        <input
          ref={input}
          style={{ display: 'none' }}
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
          <button
            type="button"
            style={buttonStyle}
            disabled={disabled}
            onClick={() => {
              onChange('');
              setError('');
            }}
          >
            사진 삭제
          </button>
        ) : null}
      </div>
      {error ? <Meta>{error}</Meta> : null}
    </div>
  );
}
