import { useState } from 'react';
import { Input } from '../styles/layout';

export function CommentInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [height, setHeight] = useState(42);
  return (
    <Input
      multiline
      accessibilityLabel="의견 내용"
      placeholder="내 의견 남기기"
      maxLength={20000}
      value={value}
      onChangeText={onChange}
      onContentSizeChange={(event) =>
        setHeight(Math.max(42, event.nativeEvent.contentSize.height + 20))
      }
      style={{
        height: value ? height : 42,
        minHeight: 42,
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: 46,
        borderWidth: 0,
        borderRadius: 12,
        fontSize: 14,
        lineHeight: 22,
        textAlignVertical: 'top',
      }}
    />
  );
}
