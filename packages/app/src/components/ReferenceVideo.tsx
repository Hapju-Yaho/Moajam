import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseVideoUrl } from '../lib/video';
import { ActionButton, Meta } from './ProductUI';

interface ReferenceVideoProps {
  referenceUrl?: string;
  thumbnailUrl?: string;
  title: string;
}

export function ReferenceVideo({ referenceUrl }: ReferenceVideoProps) {
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
          aspectRatio: 16 / 9,
          overflow: 'hidden',
          borderRadius: 12,
          backgroundColor: '#182033',
        }}
      >
        {embedUrl ? (
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
      <ActionButton secondary compact onPress={() => void Linking.openURL(video.url)}>
        영상 원본 열기 ↗
      </ActionButton>
    </>
  );
}
