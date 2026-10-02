import type { TimelineClip } from './practiceClips';
export function encodeClipWav(
  audio: Pick<AudioBuffer, 'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'>,
  sourceStart: number,
  duration: number,
) {
  const start = Math.max(0, Math.min(audio.length, Math.round(sourceStart * audio.sampleRate)));
  const end = Math.min(
    audio.length,
    duration > 0 ? start + Math.round(duration * audio.sampleRate) : audio.length,
  );
  const frames = end - start;
  if (!frames) throw new Error('보관할 클립 구간이 비어 있어요.');
  const channels = Math.min(2, audio.numberOfChannels);
  const size = frames * channels * 2;
  if (size + 44 > 104857600)
    throw new Error('보관할 클립이 100MB를 초과해요. 구간을 나누어 보관해주세요.');
  const bytes = new ArrayBuffer(44 + size),
    view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + size, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, size, true);
  const samples = Array.from({ length: channels }, (_, i) => audio.getChannelData(i));
  for (let frame = 0; frame < frames; frame++)
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, samples[channel][start + frame]));
      view.setInt16(
        44 + (frame * channels + channel) * 2,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      );
    }
  return new Blob([bytes], { type: 'audio/wav' });
}
export async function archiveClipAudio(clip: TimelineClip) {
  const context = new AudioContext();
  try {
    return encodeClipWav(
      await context.decodeAudioData(await clip.blob.arrayBuffer()),
      clip.sourceStart,
      clip.duration,
    );
  } finally {
    await context.close();
  }
}
