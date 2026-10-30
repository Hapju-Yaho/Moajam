export type LyricsCue = { section: number; beat: number };
export type LyricsTrack = { bpm: number; meter: [number, number]; cues: LyricsCue[] };
export type LyricsTimingDocument = {
  version: 1;
  lyrics: string;
  selectedSource?: string;
  tracks: Record<string, LyricsTrack>;
};
export type LyricsTransport = {
  key: string;
  ready: boolean;
  playing: boolean;
  bpm: number;
  meter: [number, number];
  metronome: boolean;
  setMetronome(value: boolean): void;
  readBeat(): number;
  toggle(): void;
  seek(beat: number): void;
  location(beat: number): { bar: number; offset: number };
};
export function lyricsSections(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n[\t ]*\n(?:[\t ]*\n)*/)
    .map((v) => v.trim())
    .filter(Boolean);
}
export function snapLyricsBeat(beat: number): number {
  return Math.round(Math.max(0, Number.isFinite(beat) ? beat : 0) * 2) / 2;
}
export function moveLyricsCue(cues: LyricsCue[], section: number, beat: number): LyricsCue[] {
  const index = cues.findIndex((cue) => cue.section === section);
  if (index < 0 || !Number.isFinite(beat)) return cues;
  const minimum = index > 0 ? cues[index - 1].beat + 0.5 : 0;
  const maximum = index + 1 < cues.length ? cues[index + 1].beat - 0.5 : 128000;
  const position = Math.max(minimum, Math.min(maximum, snapLyricsBeat(beat)));
  return cues.map((cue, i) => (i === index ? { ...cue, beat: position } : cue));
}
export function lyricsCueLabel(beat: number, meter: [number, number]): string {
  const length = (meter[0] * 4) / meter[1],
    bar = Math.floor((beat + 1e-7) / length);
  const position = Number(((beat - bar * length) / (4 / meter[1]) + 1).toFixed(2));
  return `${bar + 1}마디 · ${position}박`;
}
export function activeLyricsSection(cues: LyricsCue[], beat: number): number {
  let active = -1;
  for (const cue of cues) {
    if (cue.beat > beat + 1e-7) break;
    active = cue.section;
  }
  return active;
}
export function addLyricsCue(cues: LyricsCue[], beat: number, count: number): LyricsCue[] {
  if (!Number.isFinite(beat) || beat < 0 || beat > 128000)
    throw new Error('재생 위치를 확인한 뒤 다시 입력해주세요.');
  if (cues.length >= count) throw new Error('모든 구분절의 타이밍을 입력했어요.');
  const snapped = snapLyricsBeat(beat);
  if (cues.length && snapped <= cues[cues.length - 1].beat)
    throw new Error('이전 구분절보다 뒤의 8분음표 위치에서 입력해주세요.');
  return [...cues, { section: cues.length, beat: snapped }];
}
