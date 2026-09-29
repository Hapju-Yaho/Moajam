import { getYouTubeEmbedUrl, parseYouTubeUrl } from './youtube';

export function parseVideoUrl(input?: string) {
  if (!input?.trim()) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`,
    );
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const youtube = parseYouTubeUrl(url.href);
    if (youtube)
      return {
        url: youtube.canonicalUrl,
        embed: getYouTubeEmbedUrl(youtube.canonicalUrl)!,
        thumbnail: youtube.thumbnailUrl,
        kind: 'embed' as const,
      };
    const host = url.hostname.replace(/^www\./, '');
    const vimeo = host === 'vimeo.com' ? url.pathname.match(/^\/(\d+)\/?$/) : null;
    if (vimeo)
      return {
        url: url.href,
        embed: `https://player.vimeo.com/video/${vimeo[1]}`,
        kind: 'embed' as const,
      };
    if (/\.(mp4|webm|mov)$/i.test(url.pathname))
      return { url: url.href, embed: url.href, kind: 'file' as const };
    return null;
  } catch {
    return null;
  }
}
