import {
  alignScoreMeasures,
  cleanScoreConnections,
  noteTones,
  scoreBeat,
  scoreChordPositions,
  scoreInstrument,
  scoreMeasureCount,
  scoreMeasureStart,
  spliceScorePartTime,
  tabTones,
  type Score,
  type ScoreNote,
} from './score';
import { enableDrumVoices, scorePartOwner, scorePartStaves } from './scoreParts';
import { midiInsertionRange } from './scoreMidiImport';
import { clientId } from './clientId';

export function xmlInsertionRange(
  score: Score,
  source: Score,
  sourcePart: string,
  target: string,
  bar: number,
) {
  if (!source.parts.includes(sourcePart)) throw new Error('가져올 파트를 선택해주세요.');
  const linked = scorePartStaves(source, sourcePart);
  // Legacy single-voice drum targets must not silently discard the imported foot voice.
  const pairedDrums = source.drumVoices?.[sourcePart] && linked.length === 2;
  if (pairedDrums) {
    const owner = scorePartOwner(score, target);
    if (scoreInstrument(score, owner).id !== 'drums')
      throw new Error('드럼의 위·아래 성부를 함께 가져오려면 대상 파트를 드럼으로 선택해주세요.');
    score = enableDrumVoices(score, owner);
  }
  const fromParts = linked[0] === sourcePart ? linked : [sourcePart],
    toParts = scorePartStaves(score, target).slice(0, fromParts.length);
  const beats = Math.max(
    ...fromParts.map((part) => scoreMeasureStart(source, part, scoreMeasureCount(source, part))),
  );
  const range = midiInsertionRange(score, { beats }, target, bar, toParts);
  if (range.bars > 2000)
    throw new Error('더 짧은 악보를 선택해주세요. 최대 2,000마디까지 가져올 수 있어요.');
  return { ...range, fromParts: fromParts.slice(0, toParts.length), beats, targetScore: score };
}
export function insertScoreXml(
  score: Score,
  source: Score,
  sourcePart: string,
  target: string,
  bar: number,
  makeId = () => clientId(),
) {
  const range = xmlInsertionRange(score, source, sourcePart, target, bar);
  score = range.targetScore;
  let next = score;
  for (let i = 0; i < range.parts.length; i++) {
    const part = range.parts[i],
      from = range.fromParts[i];
    const start = scoreMeasureStart(score, part, bar - 1),
      end = scoreMeasureStart(score, part, bar - 1 + range.bars),
      span = scoreBeat(end - start);
    const rows = source.notes.filter((n) => n.part === from),
      ids = new Map(rows.map((n) => [n.id, makeId()]));
    const tuning = scoreInstrument(score, part).tuning;
    const notes: ScoreNote[] = rows.map((n) => {
      const copy: ScoreNote = {
        ...n,
        id: ids.get(n.id)!,
        part,
        tones: noteTones(n).map((t) => ({ ...t, bend: t.bend ? { ...t.bend } : undefined })),
        connection:
          n.connection && ids.has(n.connection.targetId)
            ? { ...n.connection, targetId: ids.get(n.connection.targetId)! }
            : undefined,
        slurTo: n.slurTo ? ids.get(n.slurTo) : undefined,
      };
      if (tuning.length) copy.tones = tabTones(copy, tuning);
      else
        copy.tones = noteTones(copy).map((t) => {
          const tone = { ...t };
          delete tone.string;
          delete tone.fret;
          delete tone.harmonic;
          delete tone.bend;
          delete tone.palmMute;
          delete tone.bassTechnique;
          delete tone.vibrato;
          delete tone.strum;
          return tone;
        });
      return copy;
    });
    let remaining = scoreBeat(span - notes.reduce((sum, n) => sum + n.beats, 0));
    while (remaining > 1e-7) {
      const length = Math.min(4, remaining);
      notes.push({
        id: makeId(),
        part,
        pitch: 60,
        beats: length,
        rest: true,
        tones: [],
        accent: false,
        chord: '',
        lyric: '',
      });
      remaining = scoreBeat(remaining - length);
    }
    const prepared = spliceScorePartTime(next, part, start, end, span, makeId);
    let at = 0,
      inserted = false;
    const replaced = prepared.notes.flatMap((n) => {
      if (n.part !== part) return [n];
      const position = at;
      at += n.beats;
      if (position >= start - 1e-7 && position < end - 1e-7) {
        if (!inserted) {
          inserted = true;
          return notes;
        }
        return [];
      }
      return [n];
    });
    const chords = Object.fromEntries(
      Object.entries(scoreChordPositions(source, from)).map(([beat, chord]) => [
        scoreBeat(start + Number(beat)),
        chord,
      ]),
    );
    next = {
      ...prepared,
      notes: replaced,
      beatChords: { ...prepared.beatChords, [part]: { ...prepared.beatChords?.[part], ...chords } },
    };
  }
  if (next.notes.length > 2000)
    throw new Error('삽입 후 음표가 2,000개를 넘어요. 더 짧은 악보를 사용해주세요.');
  return cleanScoreConnections(alignScoreMeasures(next, makeId));
}
