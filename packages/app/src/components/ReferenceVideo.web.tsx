import { createElement, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { parseVideoUrl } from '../lib/video';
import { ActionButton, Meta } from './ProductUI';

interface ReferenceVideoProps {
  referenceUrl?: string;
  thumbnailUrl?: string;
  title: string;
}

export function ReferenceVideo({ referenceUrl, thumbnailUrl, title }: ReferenceVideoProps) {
  const video = parseVideoUrl(referenceUrl);
  const embedUrl = video?.embed;
  const [playing, setPlaying] = useState(false);
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
        {video.kind === 'file'
          ? createElement('video', {
              key: video.url,
              src: video.url,
              controls: true,
              playsInline: true,
              preload: 'metadata',
              style: { width: '100%', height: '100%' },
            })
          : embedUrl && playing
            ? createElement('iframe', {
                key: embedUrl,
                src: `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`,
                title: `${title} 레퍼런스`,
                allow:
                  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                allowFullScreen: true,
                referrerPolicy: 'strict-origin-when-cross-origin',
                style: { width: '100%', height: '100%', border: 0 },
              })
            : null}
        {video.kind !== 'file' && !playing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} 레퍼런스 영상 재생`}
            disabled={!embedUrl}
            onPress={() => setPlaying(true)}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {thumbnailUrl || video.thumbnail ? (
              <Image
                source={{ uri: thumbnailUrl || video.thumbnail }}
                resizeMode="cover"
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.75 }}
              />
            ) : null}
            <View
              style={{
                width: 64,
                height: 64,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 32,
                backgroundColor: 'white',
              }}
            >
              <Text style={{ marginLeft: 4, color: '#172033', fontSize: 25 }}>▶</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      <ActionButton secondary compact onPress={() => void Linking.openURL(video.url)}>
        영상 원본 열기 ↗
      </ActionButton>
    </>
  );
}
