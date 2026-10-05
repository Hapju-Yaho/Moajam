import { Platform } from 'react-native';
import { api, serverConfigured } from './remote';

import type { YouTubeReference } from './youtubeUrl';
export { parseYouTubeUrl, getYouTubeEmbedUrl } from './youtubeUrl';
export type { YouTubeReference } from './youtubeUrl';

export interface YouTubeMetadata extends YouTubeReference {
  title: string;
  artist: string;
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
