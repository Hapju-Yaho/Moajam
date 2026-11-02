import { lyricsSections, type LyricsTimingDocument } from './lyricsTiming';
export type TimedScoreLyric = { section: number; start: number; end: number; text: string };
export type LyricSystemGeometry = { start: number; end: number; xAt: (beat: number) => number };
export type ScoreLyricLine = {
  x: number;
  width: number;
  row: number;
  text: string;
  section: number;
  fontSize: number;
};

export function scoreTimedLyrics(
  document: LyricsTimingDocument,
  lyrics: string,
): TimedScoreLyric[] {
  if (document.lyrics !== lyrics) return [];
  const sections = lyricsSections(lyrics);
  const track = document.tracks.metronome ?? document.tracks[document.selectedSource ?? ''];
  const cues = (track?.cues ?? []).filter((cue) => sections[cue.section]?.trim());
  return cues.map((cue, index) => ({
    section: cue.section,
    start: cue.beat,
    end: cues[index + 1]?.beat ?? Infinity,
    text: sections[cue.section],
  }));
}

export function layoutScoreTimedLyrics(
  lyrics: TimedScoreLyric[],
  systems: LyricSystemGeometry[],
): ScoreLyricLine[][] {
  const result: ScoreLyricLine[][] = systems.map(() => []);
  for (const lyric of lyrics) {
    let remaining = Array.from(lyric.text);
    const available = systems.flatMap((system, index) => {
      const start = Math.max(lyric.start, system.start),
        end = Math.min(lyric.end, system.end);
      if (start >= end) return [];
      const x = system.xAt(start),
        width = Math.max(1, system.xAt(end) - x - 3);
      return [{ index, x, width }];
    });
    available.forEach((space, index) => {
      let row = 0;
      const fontSize = Math.min(13, space.width);
      while (remaining.length && space.width > 0) {
        let used = 0,
          length = 0;
        for (const character of remaining) {
          if (character === '\n') {
            length++;
            break;
          }
          const width = /^[\x00-\x7f]$/.test(character) ? fontSize * 0.58 : fontSize;
          if (used + width > space.width) break;
          used += width;
          length++;
        }
        if (!length) break;
        const explicitLineBreak = remaining[length - 1] === '\n';
        const text = remaining.splice(0, length).join('').replace(/\n$/, '');
        result[space.index].push({
          x: space.x,
          width: space.width,
          row: row++,
          text,
          section: lyric.section,
          fontSize,
        });
        if (index < available.length - 1 && !explicitLineBreak) break;
      }
    });
  }
  return result;
}
