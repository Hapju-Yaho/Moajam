import styledWeb from '@emotion/styled';
import styledNative from '@emotion/native';
import { createElement, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
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
  const [playing, setPlaying] = useState(false);
  if (!video)
    return (
      <Meta>
        재생할 수 있는 영상 링크를 첨부해주세요. YouTube, Vimeo, MP4, WebM, MOV를 지원해요.
      </Meta>
    );

  return (
    <>
      <ReferenceVideoContainer $aspectRatio={aspectRatio}>
        {video.kind === 'file'
          ? createElement(ReferencePlayer, {
              key: video.url,
              src: video.url,
              controls: true,
              playsInline: true,
              preload: 'metadata',
            })
          : embedUrl && playing && !openExternally
            ? createElement(ReferenceEmbed, {
                key: embedUrl,
                src: `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`,
                title: `${title} 레퍼런스`,
                allow:
                  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                allowFullScreen: true,
                referrerPolicy: 'strict-origin-when-cross-origin',
              })
            : null}
        {video.kind !== 'file' && (!playing || openExternally) ? (
          <ReferenceVideoButton
            accessibilityRole="button"
            accessibilityLabel={`${title} 레퍼런스 영상 ${openExternally ? '새 창에서 열기' : '재생'}`}
            disabled={!embedUrl}
            onPress={() => {
              if (openExternally) window.open(video.url, '_blank', 'noopener,noreferrer');
              else setPlaying(true);
            }}
          >
            {thumbnailUrl || video.thumbnail ? (
              <ReferenceVideoImage
                source={{ uri: thumbnailUrl || video.thumbnail }}
                resizeMode="cover"
              />
            ) : null}
            <ReferenceVideoContainer2>
              <ReferenceVideoText>▶</ReferenceVideoText>
            </ReferenceVideoContainer2>
          </ReferenceVideoButton>
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
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  alignItems: 'center',
  justifyContent: 'center',
});

const ReferenceVideoImage = styledNative(Image)({
  position: 'absolute',
  width: '100%',
  height: '100%',
  opacity: 0.75,
});

const ReferenceVideoContainer2 = styledNative(View)({
  width: 64,
  height: 64,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 32,
  borderTopRightRadius: 32,
  borderBottomRightRadius: 32,
  borderBottomLeftRadius: 32,
  backgroundColor: 'white',
});

const ReferenceVideoText = styledNative(Text)({ marginLeft: 4, color: '#172033', fontSize: 25 });

const ReferencePlayer = styledWeb.video({ '&&&&': { width: '100%', height: '100%' } });
const ReferenceEmbed = styledWeb.iframe({ '&&&&': { width: '100%', height: '100%', border: 0 } });
