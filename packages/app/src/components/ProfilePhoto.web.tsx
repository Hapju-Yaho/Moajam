import { useRef, useState } from 'react';
import { Meta } from './ProductUI';
export function ProfilePhoto({
  value,
  onChange,
  disabled = false,
  horizontal = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  horizontal?: boolean;
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
      {value ? (
        <img
          src={value}
          alt="내 프로필"
          style={{
            width: horizontal ? 112 : 64,
            height: horizontal ? 112 : 64,
            borderRadius: horizontal ? 56 : 32,
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: horizontal ? 112 : 64,
            height: horizontal ? 112 : 64,
            borderRadius: horizontal ? 56 : 32,
            background: '#edf3ff',
            color: '#6980a4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
          }}
        >
          사진
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginLeft: horizontal ? 'auto' : undefined,
        }}
      >
        <button
          type="button"
          disabled={disabled}
          style={buttonStyle}
          onClick={() => input.current?.click()}
        >
          {value ? '사진 변경' : '사진 선택'}
        </button>
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
        {value ? (
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
