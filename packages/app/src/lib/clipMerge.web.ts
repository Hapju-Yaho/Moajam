import { encodeMidi, cropMidi, type MidiSequence } from './midi';
import { encodeClipWav } from './clipArchive.web';
import type { TimelineClip } from './practiceClips';
export function contiguousClips(clips: TimelineClip[]) {
  const sorted = [...clips].sort((a, b) => a.offset - b.offset);
  return (
    sorted.length > 1 &&
    sorted.every(
      (clip, index) =>
        clip.duration > 0 &&
        !!clip.midi === !!sorted[0].midi &&
        (!index ||
          Math.abs(clip.offset - sorted[index - 1].offset - sorted[index - 1].duration) < 0.01),
    )
  );
}
export async function mergeClips(clips: TimelineClip[], id: () => string): Promise<TimelineClip> {
  if (!contiguousClips(clips))
    throw new Error('선택된 클립들이 하나의 트랙에서 모두 붙어있어야합니다.');
  const sorted = [...clips].sort((a, b) => a.offset - b.offset),
    first = sorted[0];
  const duration = sorted.at(-1)!.offset + sorted.at(-1)!.duration - first.offset;
  if (duration > 600) throw new Error('합친 클립은 10분 이하로 만들어주세요.');
  if (first.midi) {
    const midi: MidiSequence = {
      duration,
      notes: sorted.flatMap((clip) =>
        cropMidi(clip.midi!, clip.sourceStart, clip.duration).notes.map((note) => ({
          ...note,
          id: id(),
          start: note.start + clip.offset - first.offset,
        })),
      ),
    };
    if (midi.notes.length > 2000)
      throw new Error('한 미디 클립에는 2,000개까지 음표를 담을 수 있어요.');
    return {
      ...first,
      id: id(),
      name: first.name.replace(/\.[^.]+$/, '') + ' 합친 클립.mid',
      blob: encodeMidi(midi),
      url: '',
      sourceStart: 0,
      duration,
      trimmed: false,
      midi,
    };
  }
  if (
    sorted.every(
      (clip) =>
        clip.blob === first.blob &&
        Math.abs(clip.sourceStart - first.sourceStart - (clip.offset - first.offset)) < 0.01,
    )
  )
    return { ...first, id: id(), duration, trimmed: true };
  const frames = Math.ceil(duration * 44100);
  if (frames * 4 + 44 > 104857600)
    throw new Error('합친 클립이 100MB를 초과해요. 더 짧은 구간을 선택해주세요.');
  const context = new OfflineAudioContext(2, frames, 44100);
  for (const clip of sorted) {
    const source = context.createBufferSource();
    source.buffer = await context.decodeAudioData(await clip.blob.arrayBuffer());
    source.connect(context.destination);
    source.start(clip.offset - first.offset, clip.sourceStart, clip.duration);
  }
  const buffer = await context.startRendering();
  return {
    ...first,
    id: id(),
    name: first.name.replace(/\.[^.]+$/, '') + ' 합친 클립.wav',
    blob: encodeClipWav(buffer, 0, duration),
    url: '',
    sourceStart: 0,
    duration,
    trimmed: false,
  };
}
