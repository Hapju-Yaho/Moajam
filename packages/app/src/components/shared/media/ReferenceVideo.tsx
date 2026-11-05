import styledNative from '@emotion/native';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseVideoUrl } from '@lib/video';
import { ActionButton, Meta } from '@component/shared/ui/ProductUI';

interface ReferenceVideoProps {
  referenceUrl?: string;
  thumbnailUrl?: string;
  title: string;
  aspectRatio?: number;
  showOriginalLink?: boolean;
  openExternally?: boolean;
}

export function ReferenceVideo({
  referenceUrl,
  thumbnailUrl,
  title,
  aspectRatio = 16 / 9,
  showOriginalLink = true,
  openExternally = false,
}: ReferenceVideoProps) {
  const video = parseVideoUrl(referenceUrl);
  const embedUrl = video?.embed;
  if (!video)
    return (
      <Meta>
        재생할 수 있는 영상 링크를 첨부해주세요. YouTube, Vimeo, MP4, WebM, MOV를 지원해요.
      </Meta>
    );

  return (
    <>
      <ReferenceVideoContainer $aspectRatio={aspectRatio}>
        {openExternally ? (
          <ReferenceVideoButton
            accessibilityRole="button"
            accessibilityLabel={`${title} 레퍼런스 영상 새 창에서 열기`}
            onPress={() => void Linking.openURL(video.url)}
          >
            {(thumbnailUrl || video.thumbnail) && (
              <ReferenceVideoImage
                source={{ uri: thumbnailUrl || video.thumbnail }}

                resizeMode="cover"
              />
            )}
            <ReferenceVideoText>▶</ReferenceVideoText>
          </ReferenceVideoButton>
        ) : embedUrl ? (
          <ReferenceVideoWebView
            source={{
              uri: embedUrl,
              headers: { Referer: 'https://moajam.app' },
            }}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction
            javaScriptEnabled
            domStorageEnabled
          />
        ) : null}
      </ReferenceVideoContainer>
      {showOriginalLink && (
        <ActionButton secondary compact onPress={() => void Linking.openURL(video.url)}>
          영상 원본 열기 ↗
        </ActionButton>
      )}
    </>
  );
}

const ReferenceVideoContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $aspectRatio: number }>(({ $aspectRatio }) => ({
  width: '100%',
  aspectRatio: $aspectRatio,
  overflow: 'hidden',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  backgroundColor: '#182033',
}));

const ReferenceVideoButton = styledNative(Pressable)({
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
});

const ReferenceVideoImage = styledNative(Image)({
  position: 'absolute',
  width: '100%',
  height: '100%',
  opacity: 0.75,
});

const ReferenceVideoText = styledNative(Text)({ color: 'white', fontSize: 32 });

const ReferenceVideoWebView = styledNative(WebView)({ flex: 1, backgroundColor: '#182033' });
