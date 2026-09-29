export const trackParts = [
  { value: 'UNASSIGNED', label: '미지정' },
  { value: 'MIX', label: '전체 합주 / 원곡' },
  { value: 'VOCAL', label: '보컬' },
  { value: 'GUITAR', label: '기타' },
  { value: 'BASS', label: '베이스' },
  { value: 'DRUMS', label: '드럼' },
  { value: 'KEYBOARD', label: '키보드' },
  { value: 'OTHER', label: '기타 악기' },
] as const;

export type TrackPart = (typeof trackParts)[number]['value'];
export const trackPartLabel = (part?: string) =>
  trackParts.find((item) => item.value === part)?.label ?? '미지정';

export function validateAudioFile(file: { name: string; size?: number; type?: string }) {
  if (file.size === 0) throw new Error('비어 있는 음원은 추가할 수 없어요.');
  if ((file.size ?? 0) > 100 * 1024 * 1024) throw new Error('파일당 100MB 이하로 추가해주세요.');
  if (
    !file.type?.startsWith('audio/') &&
    !/\.(mp3|wav|m4a|ogg|flac|aac|webm|aiff?|opus)$/i.test(file.name)
  )
    throw new Error('MP3, WAV, M4A 등 오디오 파일을 선택해주세요.');
}
