const extensions: Record<string, string> = {
  xml: 'application/xml',
  musicxml: 'application/xml',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  webm: 'audio/webm',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  mid: 'audio/midi',
  midi: 'audio/midi',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const aliases: Record<string, string> = {
  'video/webm': 'audio/webm',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/x-aiff': 'audio/aiff',
  'audio/x-midi': 'audio/midi',
  'audio/opus': 'audio/ogg',
};
export function uploadMime(type: string, name: string): string {
  const mime = type.split(';')[0].trim().toLowerCase();
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  return (
    aliases[mime] ||
    (!mime || mime === 'application/octet-stream' ? extensions[extension] : mime) ||
    'application/octet-stream'
  );
}
