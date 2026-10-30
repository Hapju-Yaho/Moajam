import {
  copyScoreNotes,
  compactScoreBlanks,
  pasteScoreNotes,
  scoreBeat,
  scoreInstrument,
  type Score,
  type ScoreClipboardNote,
  type ScoreNote,
} from './score';
import { enableDrumVoices, scorePartOwner } from './scoreParts';

export function scoreClipboardDuration(notes: ScoreClipboardNote[]): number {
  if (!notes.some((n) => n.copiedDrumVoice))
    return scoreBeat(notes.reduce((sum, n) => sum + n.beats, 0));
  return Math.max(
    ...(['upper', 'lower'] as const).map((voice) =>
      scoreBeat(
        notes.filter((n) => n.copiedDrumVoice === voice).reduce((sum, n) => sum + n.beats, 0),
      ),
    ),
  );
}

/** Keep two independent timelines, including silent gaps between selected attacks. */
export function copyScoreSelection(
  score: Score,
  part: string,
  ids: string[],
): ScoreClipboardNote[] {
  const owner = scorePartOwner(score, part),
    lower = score.drumVoices?.[owner];
  const chosen = new Set(ids),
    parts = [owner, lower];
  if (
    !lower ||
    !score.notes.some((n) => n.part !== part && parts.includes(n.part) && chosen.has(n.id))
  )
    return copyScoreNotes(score, part, ids);
  const timelines = [owner, lower].map((staff) => {
    let at = 0;
    return score.notes
      .filter((n) => n.part === staff)
      .map((note) => {
        const start = at;
        at = scoreBeat(at + note.beats);
        return { note, start, end: at };
      });
  });
  const selected = timelines.flat().filter((row) => chosen.has(row.note.id));
  if (!selected.length) return [];
  const start = Math.min(...selected.map((row) => row.start)),
    end = Math.max(...selected.map((row) => row.end));
  let gapId = 0;
  return timelines.flatMap((rows, index) => {
    const voice = index === 0 ? 'upper' : 'lower';
    const copies = new Map(
      copyScoreNotes(score, index === 0 ? owner : lower, ids).map((n) => [n.id, n]),
    );
    const result: ScoreClipboardNote[] = [];
    let at = start;
    const gap = (until: number) => {
      while (until - at > 1e-7) {
        const beats = scoreBeat(Math.min(64, until - at));
        result.push({
          id: `drum-copy-gap-${++gapId}`,
          part: '',
          pitch: 60,
          beats,
          rest: true,
          blank: true,
          accent: false,
          chord: '',
          lyric: '',
          tones: [],
          copiedDrumVoice: voice,
        });
        at = scoreBeat(at + beats);
      }
    };
    for (const row of rows.filter((r) => chosen.has(r.note.id))) {
      gap(row.start);
      result.push({ ...copies.get(row.note.id)!, copiedDrumVoice: voice });
      at = row.end;
    }
    gap(end);
    return result;
  });
}

// A target beat may be inside the other voice's rest or sustained drum symbol.
// Split silence only: never turn the tail of an existing hit into an empty beat.
function splitDrumBoundary(score: Score, part: string, beat: number, makeId: () => string): Score {
  let at = 0;
  const notes = score.notes.flatMap((note): ScoreNote[] => {
    if (note.part !== part) return [note];
    const start = at;
    at = scoreBeat(at + note.beats);
    if (beat <= start || beat >= at) return [note];
    if (!note.rest && !note.blank)
      throw new Error(
        '다른 드럼 성부의 음표가 이어지는 위치예요. 두 성부의 음표 시작이나 빈 박에 붙여넣어주세요.',
      );
    return [
      { ...note, beats: scoreBeat(beat - start), connection: undefined },
      {
        id: makeId(),
        part,
        pitch: 60,
        beats: scoreBeat(at - beat),
        rest: true,
        blank: true,
        tones: [],
        accent: false,
        chord: '',
        lyric: '',
      },
    ];
  });
  return { ...score, notes };
}

export function pasteScoreSelection(
  score: Score,
  part: string,
  copied: ScoreClipboardNote[],
  beat: number,
  makeId: () => string,
): { score: Score; ids: string[] } {
  if (!copied.some((n) => n.copiedDrumVoice))
    return pasteScoreNotes(score, part, copied, beat, makeId);
  const owner = scorePartOwner(score, part);
  if (scoreInstrument(score, owner).id !== 'drums')
    throw new Error('위·아래 성부를 함께 붙여넣으려면 드럼 파트를 선택해주세요.');
  const voices = (['upper', 'lower'] as const).map((voice) =>
    copied.filter((n) => n.copiedDrumVoice === voice),
  );
  const spans = voices.map((rows) => scoreBeat(rows.reduce((sum, n) => sum + n.beats, 0)));
  if (copied.some((n) => !n.copiedDrumVoice) || !spans[0] || spans[0] !== spans[1])
    throw new Error('복사한 드럼 성부의 길이가 올바르지 않아요. 다시 복사해주세요.');
  let next = enableDrumVoices(compactScoreBlanks(score), owner, makeId);
  const staves = [owner, next.drumVoices![owner]],
    ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    next = splitDrumBoundary(next, staves[i], beat, makeId);
    const rows = voices[i].map(({ copiedDrumVoice: _, ...note }) => note);
    const result = pasteScoreNotes(next, staves[i], rows, beat, makeId);
    next = result.score;
    ids.push(...result.ids);
  }
  return { score: next, ids };
}
