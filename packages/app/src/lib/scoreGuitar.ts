import type { Score, ScoreNote, ScoreTone } from './score';

export const guitarToneLabels = {
  clean: 'Clean',
  overdrive: 'Over Drive',
  distortion: 'Distortion',
} as const;
export type GuitarTone = keyof typeof guitarToneLabels;
export function readGuitarToneChanges(
  value: unknown,
  parts: string[],
): NonNullable<Score['guitarToneChanges']> {
  const invalid = () => new Error('기타 톤의 위치와 종류를 확인해주세요.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const result: NonNullable<Score['guitarToneChanges']> = {};
  for (const [part, changes] of Object.entries(value)) {
    if (
      !parts.includes(part) ||
      ['__proto__', 'constructor', 'prototype'].includes(part) ||
      !changes ||
      typeof changes !== 'object' ||
      Array.isArray(changes)
    )
      throw invalid();
    result[part] = {};
    for (const [key, tone] of Object.entries(changes)) {
      const beat = Number(key);
      if (
        !key.trim() ||
        !Number.isFinite(beat) ||
        beat < 0 ||
        beat > 512000 ||
        Math.abs(beat * 48 - Math.round(beat * 48)) > 1e-6 ||
        !Object.hasOwn(guitarToneLabels, String(tone))
      )
        throw invalid();
      result[part][beat] = tone as GuitarTone;
    }
  }
  return result;
}
export function guitarToneAt(score: Score, part: string, beat: number): GuitarTone {
  return (
    Object.entries(score.guitarToneChanges?.[part] ?? {})
      .filter(([at]) => +at <= beat + 1e-7)
      .sort(([a], [b]) => +b - +a)[0]?.[1] ?? 'clean'
  );
}
export function setGuitarToneChange(
  score: Score,
  part: string,
  beat: number,
  tone: GuitarTone | null,
): Score {
  const changes = { ...score.guitarToneChanges?.[part] };
  if (tone === null) delete changes[beat];
  else changes[beat] = tone;
  return {
    ...score,
    guitarToneChanges: readGuitarToneChanges(
      { ...score.guitarToneChanges, [part]: changes },
      score.parts,
    ),
  };
}

// Chord symbols provide a fallback when there is no written fingering at the change.
function namedChord(name: string, capo: number): ScoreTone[] | undefined {
  const match =
    /^([A-G])([#b♯♭]?)(maj7|M7|m7|m|7|6|m6|sus2|sus4|sus|dim|aug|add9|9|5)?(?:\/([A-G])([#b♯♭]?))?$/.exec(
      name.trim(),
    );
  if (!match) return undefined;
  const pitch = (step: string, alter: string) =>
    (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[step] ?? 0) +
    (['#', '♯'].includes(alter) ? 1 : ['b', '♭'].includes(alter) ? -1 : 0);
  const root = 48 + pitch(match[1], match[2]) + capo;
  const intervals: Record<string, number[]> = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    '7': [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    maj7: [0, 4, 7, 11],
    M7: [0, 4, 7, 11],
    '6': [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    sus: [0, 5, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    add9: [0, 4, 7, 14],
    '9': [0, 4, 7, 10, 14],
    '5': [0, 7],
  };
  const tones = intervals[match[3] ?? ''].map((n) => ({ pitch: root + n }));
  if (match[4]) tones.unshift({ pitch: 36 + pitch(match[4], match[5]) + capo });
  return tones;
}
export function resolveRhythmSlashes(
  notes: ScoreNote[],
  chords: Record<number, string>,
  capo = 0,
  bass = false,
): ScoreNote[] {
  let at = 0,
    previous: ScoreTone[] | undefined,
    latestChordBeat = -1;
  return notes.map((note) => {
    const changes = Object.entries(chords)
      .filter(([b]) => +b <= at + 1e-7 && +b > latestChordBeat)
      .sort(([a], [b]) => +a - +b);
    for (const [beat, name] of changes) {
      previous = namedChord(name, capo);
      if (bass && previous)
        previous = [{ pitch: previous[0].pitch - (name.includes('/') ? 0 : 12) }];
      latestChordBeat = +beat;
    }
    const tones = note.tones?.length ? note.tones : [{ pitch: note.pitch }];
    let resolved = note;
    if (!note.rest && !note.blank && note.graceBeats === undefined) {
      if (note.slash) {
        const chord =
          previous ?? (tones.length > 1 || (bass && !!note.tones?.length) ? tones : undefined);
        resolved = {
          ...note,
          tones: chord?.map((t) => ({ ...t, ghost: !!note.ghost, dead: !!note.dead })),
          pitch: chord?.[0].pitch ?? note.pitch,
          rest: !chord,
          connection: undefined,
        };
      } else if (tones.length > 1 || bass)
        previous = tones.map((t) => ({ ...t, ghost: false, dead: false }));
    }
    at += note.beats;
    return resolved;
  });
}
