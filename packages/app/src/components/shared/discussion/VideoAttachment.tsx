import styledNative from '@emotion/native';
import { useState, type PropsWithChildren } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { parseVideoUrl } from '@lib/video';
import { Input } from '@styles/layout';
import { ActionButton, Copy, FlexRow, Meta, Surface } from '@component/shared/ui/ProductUI';

export function VideoThumbnail({ value, compact = false }: { value: string; compact?: boolean }) {
  const video = parseVideoUrl(value);
  if (!video) return null;
  return (
    <VideoThumbnailButton
      accessibilityRole="link"
      onPress={() => void Linking.openURL(video.url)}
      $compact={compact}
    >
      {'thumbnail' in video && video.thumbnail ? (
        <VideoThumbnailImage source={{ uri: video.thumbnail }} $compact={compact} />
      ) : (
        <Meta>▶</Meta>
      )}
      <Meta numberOfLines={2}>{new URL(video.url).hostname}</Meta>
    </VideoThumbnailButton>
  );
}
export function VideoInput({
  value,
  onChange,
  children,
}: PropsWithChildren<{ value: string; onChange: (value: string) => void }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const valid = parseVideoUrl(draft);
  return (
    <VideoInputContainer>
      {open && (
        <Surface>
          <VideoInputRow>
            <Copy>영상 링크 첨부</Copy>
            <ActionButton secondary compact onPress={() => setOpen(false)}>
              취소
            </ActionButton>
            <ActionButton
              compact
              disabled={!!draft.trim() && !valid}
              onPress={() => {
                onChange(valid?.url ?? '');
                setOpen(false);
              }}
            >
              적용
            </ActionButton>
          </VideoInputRow>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="영상 URL"
            autoCapitalize="none"
          />
          {valid && <VideoThumbnail value={valid.url} />}
        </Surface>
      )}
      <FlexRow wrap>
        <ActionButton
          secondary
          compact
          onPress={() => {
            setDraft(value);
            setOpen((previous) => !previous);
          }}
        >
          영상 링크 첨부
        </ActionButton>
        {children}
      </FlexRow>
      {!!value && <VideoThumbnail value={value} />}
    </VideoInputContainer>
  );
}

const VideoThumbnailButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ({
  flexDirection: $compact ? 'column' : 'row',
  alignItems: $compact ? 'stretch' : 'center',
  rowGap: 6,
  columnGap: 6,
  width: $compact ? 144 : undefined,
  maxWidth: 240,
}));

const VideoThumbnailImage = styledNative(Image, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ({
  width: $compact ? 144 : 96,
  height: $compact ? 81 : 54,
  borderTopLeftRadius: 7,
  borderTopRightRadius: 7,
  borderBottomRightRadius: 7,
  borderBottomLeftRadius: 7,
}));

const VideoInputContainer = styledNative(View)({ rowGap: 10, columnGap: 10 });

const VideoInputRow = styledNative(FlexRow)({ justifyContent: 'space-between' });
