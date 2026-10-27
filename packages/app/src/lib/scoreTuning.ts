import { scoreInstrument, tabTones, type Score } from './score';
import { scorePartOwner, scorePartStaves } from './scoreParts';

export function scoreTuningChoices(score: Score, part: string) {
  const id = scoreInstrument(score, part).id;
  if (id.startsWith('bass')) return ['bass', 'bassHalfDown', 'bassDropD'];
  if (['guitar', 'dropD', 'guitarHalfDown'].includes(id))
    return ['guitar', 'guitarHalfDown', 'dropD'];
  return [];
}

export function setScoreTuning(score: Score, part: string, id: string): Score {
  if (!scoreTuningChoices(score, part).includes(id))
    throw new Error('현재 악기에 맞는 튜닝을 선택해주세요.');
  const next = { ...score, instruments: { ...score.instruments, [part]: id } };
  const before = scoreInstrument(score, part).tuning,
    after = scoreInstrument(next, part).tuning;
  return {
    ...next,
    notes: score.notes.map((note) => {
      if (note.part !== part || note.rest || note.blank) return note;
      const tones = tabTones(note, before).map((tone) => ({
        ...tone,
        pitch: after[tone.string! - 1] + tone.fret!,
      }));
      if (tones.some((tone) => tone.pitch < 0 || tone.pitch > 127))
        throw new Error('튜닝을 적용하면 지원하는 음역을 벗어나요.');
      const shift = tones[0].pitch - tabTones(note, before)[0].pitch;
      return {
        ...note,
        pitch: tones[0].pitch,
        tones,
        ...(note.graceSlide
          ? { graceSlide: { ...note.graceSlide, pitch: note.graceSlide.pitch + shift } }
          : {}),
      };
    }),
  };
}

export function keyboardKeyIsWritten(score: Score, part: string): boolean {
  const owner = scorePartOwner(score, part);
  return (
    score.keyboardTransposeNotation?.[owner] ?? score.keyboardTranspositions?.[owner] !== undefined
  );
}

export function setScoreKeyboardKey(
  score: Score,
  part: string,
  offset: number,
  applyToNotation = keyboardKeyIsWritten(score, part),
): Score {
  if (!Number.isInteger(offset) || offset < -12 || offset > 12)
    throw new Error('-12~+12 사이의 키를 입력해주세요.');
  const owner = scorePartOwner(score, part),
    staves = scorePartStaves(score, owner);
  if (!['piano', 'pianoBass'].includes(scoreInstrument(score, part).id))
    throw new Error('키보드 악기에서 사용할 수 있어요.');
  const previous = score.keyboardTranspositions?.[owner] ?? 0;
  const beforeApplied = keyboardKeyIsWritten(score, part);
  const shift = (applyToNotation ? offset : 0) - (beforeApplied ? previous : 0);
  if (previous === offset && beforeApplied === applyToNotation) return score;
  return {
    ...score,
    keyboardTransposeNotation: {
      ...score.keyboardTransposeNotation,
      ...Object.fromEntries(staves.map((name) => [name, applyToNotation])),
    },
    keyboardTranspositions: {
      ...score.keyboardTranspositions,
      ...Object.fromEntries(staves.map((name) => [name, offset])),
    },
    notes: score.notes.map((note) => {
      if (!staves.includes(note.part) || note.rest || note.blank) return note;
      const tones = note.tones?.map((tone) => ({ ...tone, pitch: tone.pitch + shift }));
      const soundShift = applyToNotation ? 0 : offset;
      if (
        note.pitch + shift + soundShift < 0 ||
        note.pitch + shift + soundShift > 127 ||
        tones?.some((tone) => tone.pitch + soundShift < 0 || tone.pitch + soundShift > 127)
      )
        throw new Error('키를 변경하면 지원하는 음역을 벗어나요.');
      return {
        ...note,
        pitch: note.pitch + shift,
        ...(tones ? { tones } : {}),
        ...(note.graceSlide
          ? { graceSlide: { ...note.graceSlide, pitch: note.graceSlide.pitch + shift } }
          : {}),
      };
    }),
  };
}

// Return an audio-only projection; mark it applied so repeated scheduling never shifts twice.
export function keyboardPlaybackScore(score: Score): Score {
  let next = score;
  for (const part of scoreVisiblePartsForKeyboard(score)) {
    const offset = score.keyboardTranspositions?.[part] ?? 0;
    if (offset && !keyboardKeyIsWritten(score, part))
      next = setScoreKeyboardKey(next, part, offset, true);
  }
  return next;
}
function scoreVisiblePartsForKeyboard(score: Score) {
  return score.parts.filter(
    (part) =>
      scorePartOwner(score, part) === part &&
      ['piano', 'pianoBass'].includes(scoreInstrument(score, part).id),
  );
}
