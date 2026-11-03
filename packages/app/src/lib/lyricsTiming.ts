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
  seek(beat: number, keepPlaying?: boolean): void;
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
export function updateLyricsTimingText(document: LyricsTimingDocument, lyrics: string): LyricsTimingDocument {
  const before = lyricsSections(document.lyrics);
  const after = lyricsSections(lyrics);
  const mapping = new Map<number, number>();
  if (before.length === after.length) {
    before.forEach((_, index) => mapping.set(index, index));
  } else {
    const anchors: [number, number][] = [[-1, -1]];
    let next = 0;
    before.forEach((text, index) => {
      const match = after.findIndex((value, i) => i >= next && value === text);
      if (match >= 0) { anchors.push([index, match]); next = match + 1; }
    });
    anchors.push([before.length, after.length]);
    for (let i = 1; i < anchors.length; i++) {
      const [oldStart, newStart] = anchors[i - 1];
      const [oldEnd, newEnd] = anchors[i];
      for (let offset = 1; offset < Math.min(oldEnd - oldStart, newEnd - newStart); offset++) mapping.set(oldStart + offset, newStart + offset);
      if (oldEnd < before.length) mapping.set(oldEnd, newEnd);
    }
  }
  return { ...document, lyrics, tracks: Object.fromEntries(Object.entries(document.tracks).map(([key, track]) => [key, {
    ...track, cues: track.cues.filter((cue) => mapping.has(cue.section)).map((cue) => ({ ...cue, section: mapping.get(cue.section)! })),
  }])) };
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
  const section = Array.from({ length: count }, (_, index) => index).find(
    (index) => !cues.some((cue) => cue.section === index),
  );
  if (section === undefined) throw new Error('모든 구분절의 타이밍을 입력했어요.');
  return recordLyricsCue(cues, section, beat);
}
export function recordLyricsCue(cues: LyricsCue[], section: number, beat: number): LyricsCue[] {
  if (!Number.isFinite(beat) || beat < 0 || beat > 128000)
    throw new Error('재생 위치를 확인한 뒤 다시 입력해주세요.');
  const snapped = snapLyricsBeat(beat);
  const previous = cues.filter((cue) => cue.section < section).at(-1);
  const next = cues.find((cue) => cue.section > section);
  if (previous && snapped <= previous.beat)
    throw new Error('이전 구분절보다 뒤의 8분음표 위치에서 입력해주세요.');
  if (next && (beat >= next.beat || snapped >= next.beat))
    throw new Error('다음 가사의 시작 박자가 지났어요. 이전 위치에서 다시 기록해주세요.');
  return [...cues.filter((cue) => cue.section !== section), { section, beat: snapped }].sort(
    (a, b) => a.section - b.section,
  );
}
