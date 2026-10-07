import type { Score, ScoreNote, ScoreTone } from './score';

export const dynamicLevels = { pp: 0.22, p: 0.35, mp: 0.52, mf: 0.7, f: 0.85, ff: 1 } as const;
export type Dynamic = keyof typeof dynamicLevels;
export type ScoreSwell = {
  startOffset: number;
  endBar: number;
  endOffset: number;
  from: number;
  to: Dynamic;
};
export const hiHatLabels = {
  closed: 'Closed H.H',
  open: 'Open H.H',
  'half-open': 'Half-open H.H',
} as const;
export type ScoreDirection = {
  hiHat?: keyof typeof hiHatLabels;
  dynamic?: Dynamic;
  swell?: { to: Dynamic; endBar: number };
  swells?: ScoreSwell[];
  implement?: 'sticks' | 'brushes' | 'mallets';
  text?: string;
  measureRepeat?: boolean;
};
export const jumpLabels = {
  dc: 'D.C.',
  ds: 'D.S.',
  'dc-fine': 'D.C. al Fine',
  'ds-fine': 'D.S. al Fine',
  'dc-coda': 'D.C. al Coda',
  'ds-coda': 'D.S. al Coda',
} as const;
export type ScoreNavigation = {
  segno?: boolean;
  coda?: boolean;
  toCoda?: boolean;
  fine?: boolean;
  jump?: keyof typeof jumpLabels;
  ending?: 1 | 2;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = () => new Error('악보의 주법·진행 설정을 확인해주세요.');
const barKey = (key: string) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < 32000;
export function readScoreDirections(
  value: unknown,
  parts: string[],
): NonNullable<Score['directions']> {
  if (!object(value)) throw invalid();
  const result: NonNullable<Score['directions']> = {};
  for (const [part, bars] of Object.entries(value)) {
    if (
      !parts.includes(part) ||
      ['__proto__', 'constructor', 'prototype'].includes(part) ||
      !object(bars)
    )
      throw invalid();
    result[part] = {};
    for (const [bar, entry] of Object.entries(bars)) {
      if (!barKey(bar) || !object(entry)) throw invalid();
      const d: ScoreDirection = {};
      if (entry.hiHat !== undefined) {
        if (!Object.hasOwn(hiHatLabels, String(entry.hiHat))) throw invalid();
        d.hiHat = entry.hiHat as ScoreDirection['hiHat'];
      }
      if (entry.dynamic !== undefined) {
        if (!Object.hasOwn(dynamicLevels, String(entry.dynamic))) throw invalid();
        d.dynamic = entry.dynamic as Dynamic;
      }
      if (entry.implement !== undefined) {
        if (!['sticks', 'brushes', 'mallets'].includes(String(entry.implement))) throw invalid();
        d.implement = entry.implement as ScoreDirection['implement'];
      }
      if (entry.text !== undefined) {
        if (typeof entry.text !== 'string' || entry.text.length > 120) throw invalid();
        if (entry.text) d.text = entry.text;
      }
      if (entry.measureRepeat !== undefined) {
        if (typeof entry.measureRepeat !== 'boolean' || (+bar === 0 && entry.measureRepeat))
          throw invalid();
        if (entry.measureRepeat) d.measureRepeat = true;
      }
      if (entry.swell !== undefined) {
        const s = entry.swell;
        if (
          !object(s) ||
          !Object.hasOwn(dynamicLevels, String(s.to)) ||
          !Number.isInteger(s.endBar) ||
          Number(s.endBar) <= +bar ||
          Number(s.endBar) >= 32000
        )
          throw invalid();
        d.swell = { to: s.to as Dynamic, endBar: Number(s.endBar) };
      }
      if (entry.swells !== undefined) {
        if (!Array.isArray(entry.swells) || entry.swells.length > 128) throw invalid();
        d.swells = entry.swells.map((s) => {
          if (
            !object(s) ||
            typeof s.startOffset !== 'number' ||
            !Number.isFinite(s.startOffset) ||
            s.startOffset < 0 ||
            s.startOffset >= 1 ||
            typeof s.endOffset !== 'number' ||
            !Number.isFinite(s.endOffset) ||
            s.endOffset < 0 ||
            s.endOffset >= 1 ||
            !Number.isInteger(s.endBar) ||
            Number(s.endBar) < +bar ||
            Number(s.endBar) > 32000 ||
            Number(s.endBar) + s.endOffset <= +bar + s.startOffset ||
            typeof s.from !== 'number' ||
            !Number.isFinite(s.from) ||
            s.from < 0.05 ||
            s.from > 1 ||
            !Object.hasOwn(dynamicLevels, String(s.to))
          )
            throw invalid();
          return {
            startOffset: s.startOffset,
            endBar: Number(s.endBar),
            endOffset: s.endOffset,
            from: s.from,
            to: s.to as Dynamic,
          };
        });
      }
      result[part][+bar] = d;
    }
  }
  return result;
}
export function readScoreNavigation(value: unknown): NonNullable<Score['navigation']> {
  if (!object(value)) throw invalid();
  const result: NonNullable<Score['navigation']> = {};
  for (const [bar, entry] of Object.entries(value)) {
    if (!barKey(bar) || !object(entry)) throw invalid();
    const n: ScoreNavigation = {};
    for (const key of ['segno', 'coda', 'toCoda', 'fine'] as const)
      if (entry[key] !== undefined) {
        if (typeof entry[key] !== 'boolean') throw invalid();
        if (entry[key]) n[key] = true;
      }
    if (entry.jump !== undefined) {
      if (!Object.hasOwn(jumpLabels, String(entry.jump))) throw invalid();
      n.jump = entry.jump as ScoreNavigation['jump'];
    }
    if (entry.ending !== undefined) {
      if (entry.ending !== 1 && entry.ending !== 2) throw invalid();
      n.ending = entry.ending;
    }
    result[+bar] = n;
  }
  if (
    Object.values(result).filter((n) => n.segno).length > 1 ||
    Object.values(result).filter((n) => n.coda).length > 1
  )
    throw new Error('세뇨와 코다 도착 지점은 각각 한 곳으로 지정해주세요.');
  return result;
}
export function directionOwner(score: Score, part: string) {
  return Object.entries(score.drumVoices ?? {}).find((pair) => pair.includes(part))?.[0] ?? part;
}
export function directionAt(score: Score, part: string, bar: number) {
  let hiHat: NonNullable<ScoreDirection['hiHat']> = 'closed',
    implement: NonNullable<ScoreDirection['implement']> = 'sticks',
    gain = dynamicLevels.mf as number;
  let swell: { start: number; end: number; from: number; to: number } | undefined;
  const events = Object.entries(score.directions?.[directionOwner(score, part)] ?? {})
    .flatMap(([key, d]) => [
      { at: +key, d, range: undefined as ScoreSwell | undefined },
      ...(d.swells ?? []).map((range) => ({
        at: +key + range.startOffset,
        d: {} as ScoreDirection,
        range,
      })),
    ])
    .sort((a, b) => a.at - b.at);
  for (const { at, d, range } of events) {
    if (at > bar) break;
    if (swell)
      gain =
        swell.from +
        (swell.to - swell.from) * Math.min(1, (at - swell.start) / (swell.end - swell.start));
    if (d.hiHat) hiHat = d.hiHat;
    if (d.implement) implement = d.implement;
    if (d.dynamic) {
      gain = dynamicLevels[d.dynamic];
      swell = undefined;
    }
    if (d.swell)
      swell = { start: at, end: d.swell.endBar, from: gain, to: dynamicLevels[d.swell.to] };
    if (range) {
      gain = range.from;
      swell = {
        start: at,
        end: range.endBar + range.endOffset,
        from: range.from,
        to: dynamicLevels[range.to],
      };
    }
  }
  if (swell)
    gain =
      swell.from +
      (swell.to - swell.from) * Math.min(1, (bar - swell.start) / (swell.end - swell.start));
  return { hiHat, implement, gain };
}
export function directionWords(d: ScoreDirection | undefined) {
  if (!d) return [];
  return [
    d.hiHat ? `${hiHatLabels[d.hiHat]} →` : '',
    d.implement ? { sticks: 'Sticks', brushes: 'Brushes', mallets: 'Mallets' }[d.implement] : '',
    d.dynamic ?? '',
    d.text ?? '',
  ].filter(Boolean);
}
export function navigationWords(n: ScoreNavigation | undefined) {
  if (!n) return [];
  return [
    n.segno ? '𝄋 Segno' : '',
    n.coda ? '𝄌 Coda' : '',
    n.toCoda ? 'To Coda' : '',
    n.fine ? 'Fine' : '',
    n.jump ? jumpLabels[n.jump] : '',
  ].filter(Boolean);
}
export function resolveHiHat(tone: ScoreTone, setting: ScoreDirection['hiHat']): ScoreTone {
  if (tone.pitch !== 42 || (tone.drumTechnique && tone.drumTechnique !== 'normal')) return tone;
  return setting === 'open'
    ? { ...tone, pitch: 46 }
    : setting === 'half-open'
      ? { ...tone, pitch: 46, drumTechnique: 'half-open' }
      : tone;
}
export function drumStrikes(technique: ScoreTone['drumTechnique'], beats: number, bpm: number) {
  if (technique === 'flam' || technique === 'drag') {
    const count = technique === 'flam' ? 1 : 2,
      gap = Math.min(beats / (count + 2), (bpm / 60) * 0.028);
    return [
      ...Array.from({ length: count }, (_, i) => ({ offset: i * gap, beats: gap, gain: 0.35 })),
      { offset: count * gap, beats: beats - count * gap, gain: 1 },
    ];
  }
  const count =
    technique === 'double'
      ? 2
      : technique === 'buzz'
        ? 4
        : technique === 'roll2'
          ? Math.max(2, Math.round(beats * 4))
          : technique === 'roll3'
            ? Math.max(2, Math.round(beats * 8))
            : 1;
  return Array.from({ length: count }, (_, i) => ({
    offset: (i * beats) / count,
    beats: beats / count,
    gain: 1,
  }));
}
export function readNoteExpression(
  value: Record<string, unknown>,
): Pick<ScoreNote, 'marcato' | 'sticking' | 'slash' | 'graceSlide' | 'graceBeats'> {
  const result: Pick<ScoreNote, 'marcato' | 'sticking' | 'slash' | 'graceSlide' | 'graceBeats'> =
    {};
  if (value.graceBeats !== undefined) {
    if (
      typeof value.graceBeats !== 'number' ||
      !Number.isFinite(value.graceBeats) ||
      value.graceBeats <= 0 ||
      value.graceBeats > 64
    )
      throw invalid();
    result.graceBeats = value.graceBeats;
  }
  if (value.graceSlide !== undefined) {
    const source = value.graceSlide as Record<string, unknown>;
    if (
      !source ||
      typeof source !== 'object' ||
      Array.isArray(source) ||
      !Number.isInteger(source.pitch) ||
      (source.pitch as number) < 0 ||
      (source.pitch as number) > 127 ||
      !Number.isInteger(source.string) ||
      (source.string as number) < 1 ||
      (source.string as number) > 6 ||
      !Number.isInteger(source.fret) ||
      (source.fret as number) < 0 ||
      (source.fret as number) > 24
    )
      throw invalid();
    result.graceSlide = {
      pitch: source.pitch as number,
      string: source.string as number,
      fret: source.fret as number,
    };
  }
  for (const key of ['marcato', 'slash'] as const)
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw invalid();
      result[key] = value[key];
    }
  if (value.sticking !== undefined) {
    if (value.sticking !== 'R' && value.sticking !== 'L') throw invalid();
    result.sticking = value.sticking;
  }
  return result;
}
