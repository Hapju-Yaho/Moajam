export interface YouTubeReference {
  videoId: string;
  canonicalUrl: string;
  thumbnailUrl: string;
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
