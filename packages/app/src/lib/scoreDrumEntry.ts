import { clientId } from './clientId';
import { enableDrumVoices, scorePartOwner } from './scoreParts';
import {
  alignScoreMeasures,
  appendScoreMeasureNote,
  scoreBeat,
  scoreEntryDuration,
  scoreMeasureStart,
  scoreMeasures,
  setScoreDrum,
  setScoreDuration,
  type Score,
  type ScoreNote,
  type ScoreFragment,
} from './score';
import type { DrumTechnique } from './score';

/** Independent voices share a bar; overlapping hits must not count time twice. */
export function drumMeasureComplete(fragments: readonly ScoreFragment[], beats: number) {
  let end = 0;
  const written = fragments
    .filter((f) => !f.note.blank && f.beats > 0)
    .slice()
    .sort((a, b) => a.offset - b.offset);
  for (const fragment of written) {
    if (scoreBeat(fragment.offset) > end) return false;
    end = scoreBeat(Math.max(end, fragment.offset + fragment.beats));
  }
  return end === scoreBeat(beats);
}

export function enterDrumVoice(
  score: Score,
  part: string,
  template: ScoreNote,
  bar: number,
  offset: number,
  pitch: number,
  technique: DrumTechnique,
  makeId = clientId,
) {
  let next = alignScoreMeasures(enableDrumVoices(score, part, makeId));
  const owner = scorePartOwner(next, part);
  const voice = [35, 36, 44].includes(pitch) ? next.drumVoices![owner] : owner;
  const beat = scoreBeat(scoreMeasureStart(next, voice, bar) + offset);
  const fragment = scoreMeasures(next, voice)[bar]?.find(
    (f) => !f.note.graceBeats && f.offset <= offset && f.offset + f.beats > offset,
  );
  let id: string;
  if (fragment) {
    id = fragment.note.id;
    if (fragment.note.blank) {
      const rows = next.notes.filter((n) => n.part === voice);
      const start = rows
        .slice(
          0,
          rows.findIndex((n) => n.id === id),
        )
        .reduce((sum, n) => scoreBeat(sum + (n.graceBeats ? 0 : n.beats)), 0);
      const duration = scoreEntryDuration(
        next,
        voice,
        beat,
        Math.min(template.beats, fragment.offset + fragment.beats - offset),
        bar,
      );
      next = setScoreDuration(next, id, duration, makeId, scoreBeat(beat - start));
      next = {
        ...next,
        notes: next.notes.map((n) =>
          n.id === id
            ? {
                ...n,
                accent: template.accent,
                staccato: template.staccato,
                tuplet: template.tuplet,
              }
            : n,
        ),
      };
    } else if (scoreBeat(fragment.offset) !== scoreBeat(offset)) {
      throw new Error(
        '해당 성부의 음표가 이어지는 위치예요. 음표 시작 위치나 빈 박을 선택해주세요.',
      );
    }
  } else {
    id = template.id;
    next = appendScoreMeasureNote(
      next,
      {
        ...template,
        part: voice,
        beats: scoreEntryDuration(next, voice, beat, template.beats, bar),
      },
      bar,
      offset,
      makeId,
    );
  }
  next = setScoreDrum(next, id, pitch, false, technique, true);
  return { score: alignScoreMeasures(next), voice, id, beat };
}
