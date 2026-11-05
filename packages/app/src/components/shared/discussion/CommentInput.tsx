import styledNative from '@emotion/native';
import { useState } from 'react';
import { Input } from '@styles/layout';

export function CommentInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [height, setHeight] = useState(42);
  return (
    <CommentInputInput
      multiline
      accessibilityLabel="의견 내용"
      placeholder="내 의견 남기기"
      maxLength={20000}
      value={value}
      onChangeText={onChange}
      onContentSizeChange={(event) =>
        setHeight(Math.max(42, event.nativeEvent.contentSize.height + 20))
      }
      $value={value}
      $height={height}
    />
  );
}

const CommentInputInput = styledNative(Input, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $value: string; $height: number }>(({ $value, $height }) => ({
  height: $value ? $height : 42,
  minHeight: 42,
  paddingTop: 10,
  paddingBottom: 10,
  paddingLeft: 12,
  paddingRight: 46,
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: 0,
  borderLeftWidth: 0,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  fontSize: 14,
  lineHeight: 22,
  textAlignVertical: 'top',
}));
