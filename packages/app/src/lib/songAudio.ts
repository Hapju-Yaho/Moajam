import { api, serverConfigured } from './remote';
import { readMedia } from './mediaStore';
export type SongAudio = { id: string; name: string; start?: number };
export async function songAudioBlob(audio: SongAudio): Promise<Blob> {
  if (!serverConfigured) {
    const blob = await readMedia<Blob>('song-audio/' + audio.id);
    if (!blob) throw new Error('곡 음원 파일을 찾지 못했어요.');
    return blob;
  }
  const { url } = await api<{ url: string }>(`/assets/${audio.id}/download`);
  const response = await fetch(url);
  if (!response.ok) throw new Error('곡 음원을 불러오지 못했어요.');
  return response.blob();
}
