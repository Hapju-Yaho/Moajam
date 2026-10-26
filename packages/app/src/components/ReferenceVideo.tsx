import { Image, Linking, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseVideoUrl } from '../lib/video';
import { ActionButton, Meta } from './ProductUI';

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
      <View
        style={{
          width: '100%',
          aspectRatio,
          overflow: 'hidden',
          borderRadius: 12,
          backgroundColor: '#182033',
        }}
      >
        {openExternally ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} 레퍼런스 영상 새 창에서 열기`}
            onPress={() => void Linking.openURL(video.url)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            {(thumbnailUrl || video.thumbnail) && (
              <Image
                source={{ uri: thumbnailUrl || video.thumbnail }}
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.75 }}
                resizeMode="cover"
              />
            )}
            <Text style={{ color: 'white', fontSize: 32 }}>▶</Text>
          </Pressable>
        ) : embedUrl ? (
          <WebView
            source={{
              uri: embedUrl,
              headers: { Referer: 'https://moajam.app' },
            }}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1, backgroundColor: '#182033' }}
          />
        ) : null}
      </View>
      {showOriginalLink && (
        <ActionButton secondary compact onPress={() => void Linking.openURL(video.url)}>
          영상 원본 열기 ↗
        </ActionButton>
      )}
    </>
  );
}
