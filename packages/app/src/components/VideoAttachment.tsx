import { useState, type PropsWithChildren } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { parseVideoUrl } from '../lib/video';
import { Input } from '../styles/layout';
import { ActionButton, Copy, FlexRow, Meta, Surface } from './ProductUI';

export function VideoThumbnail({ value, compact = false }: { value: string; compact?: boolean }) {
  const video = parseVideoUrl(value);
  if (!video) return null;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(video.url)}
      style={{
        flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'stretch' : 'center',
        gap: 6,
        width: compact ? 144 : undefined,
        maxWidth: 240,
      }}
    >
      {'thumbnail' in video && video.thumbnail ? (
        <Image
          source={{ uri: video.thumbnail }}
          style={{ width: compact ? 144 : 96, height: compact ? 81 : 54, borderRadius: 7 }}
        />
      ) : (
        <Meta>▶</Meta>
      )}
      <Meta numberOfLines={2}>{new URL(video.url).hostname}</Meta>
    </Pressable>
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
    <View style={{ gap: 10 }}>
      {open && (
        <Surface>
          <FlexRow style={{ justifyContent: 'space-between' }}>
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
          </FlexRow>
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
    </View>
  );
}
