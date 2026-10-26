import { useLayoutEffect, useRef } from 'react';

export function CommentInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(42, element.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea
      ref={input}
      aria-label="의견 내용"
      placeholder="내 의견 남기기"
      rows={1}
      maxLength={20000}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        display: 'block',
        width: '100%',
        minHeight: 42,
        boxSizing: 'border-box',
        resize: 'none',
        overflow: 'hidden',
        padding: '10px 46px 10px 12px',
        border: 0,
        borderRadius: 12,
        background: 'transparent',
        color: '#273431',
        font: 'inherit',
        fontSize: 14,
        lineHeight: '22px',
      }}
    />
  );
}
