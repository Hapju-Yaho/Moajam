import { Platform } from 'react-native';
import { api, serverConfigured } from './remote';

export interface YouTubeReference {
  videoId: string;
  canonicalUrl: string;
  thumbnailUrl: string;
}

export interface YouTubeMetadata extends YouTubeReference {
  title: string;
  artist: string;
}

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeUrl(value: string): YouTubeReference | null {
  const input = value.trim();
  if (!input) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/^m\./, '');
    let videoId: string | null = null;

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else {
        const [kind, id] = url.pathname.split('/').filter(Boolean);
        if (['shorts', 'embed', 'live'].includes(kind ?? '')) videoId = id ?? null;
      }
    }

    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;

    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

export function getYouTubeEmbedUrl(value?: string) {
  if (!value) return null;
  const reference = parseYouTubeUrl(value);
  return reference
    ? `https://www.youtube.com/embed/${reference.videoId}?playsinline=1&rel=0`
    : null;
}

export async function fetchYouTubeMetadata(
  reference: YouTubeReference,
  signal?: AbortSignal,
): Promise<YouTubeMetadata> {
  const baseUrl = Platform.OS === 'web' ? '/api/youtube-oembed' : 'https://www.youtube.com/oembed';
  const endpoint = `${baseUrl}?url=${encodeURIComponent(reference.canonicalUrl)}&format=json`;
  if (signal?.aborted) throw new Error('조회가 취소되었습니다.');
  const fetchDirect = async () => {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) throw new Error('영상 정보를 불러오지 못했습니다.');
    return response.json();
  };
  const data = (
    serverConfigured ? await api(`/integrations/youtube/${reference.videoId}`) : await fetchDirect()
  ) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  if (signal?.aborted) throw new Error('조회가 취소되었습니다.');
  const rawTitle = data.title?.trim();
  const rawArtist = data.author_name?.trim();

  if (!rawTitle || !rawArtist) {
    throw new Error('영상의 제목 또는 채널 정보를 찾지 못했습니다.');
  }

  const separator = rawTitle.match(/\s[-–—]\s/);
  const titleParts = separator ? rawTitle.split(separator[0], 2) : [];
  const artistFromTitle = titleParts[0]?.trim();
  const songFromTitle = titleParts[1]
    ?.replace(/\s*[([]\s*(official\s+)?(music\s+)?(video|audio|lyrics?|mv).*$/i, '')
    .trim();
  const channelArtist = rawArtist
    .replace(/\s+-\s+Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();
  const hasUsefulTitlePair = Boolean(artistFromTitle && songFromTitle);

  return {
    ...reference,
    title: hasUsefulTitlePair ? songFromTitle! : rawTitle,
    artist: hasUsefulTitlePair ? artistFromTitle! : channelArtist,
    thumbnailUrl: data.thumbnail_url || reference.thumbnailUrl,
  };
}
