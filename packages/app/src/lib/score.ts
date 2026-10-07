import { resolveRhythmSlashes, guitarToneLabels, type GuitarTone } from './scoreGuitar';
import {
  directionAt,
  directionOwner,
  directionWords,
  navigationWords,
  resolveHiHat,
  readNoteExpression,
  dynamicLevels,
  type ScoreSwell,
  type ScoreDirection,
  type ScoreNavigation,
} from './scoreExpression';
// Ordered from the top of the percussion staff to the bottom. GM note numbers
// identify kit pieces; they are not pitched notes on a treble clef.
type DrumDefinition = {
  pitch: number;
  label: string;
  y: number;
  head: 'normal' | 'x' | 'circle-x' | 'diamond' | 'triangle';
  step: string;
  octave: number;
};
export const scoreDrums: DrumDefinition[] = [
  { pitch: 49, label: '크래시 1', y: 72, head: 'x', step: 'A', octave: 5 },
  { pitch: 51, label: '라이드', y: 82, head: 'x', step: 'F', octave: 5 },
  { pitch: 46, label: '열린 하이햇', y: 77, head: 'x', step: 'G', octave: 5 },
  { pitch: 42, label: '기본 하이햇', y: 77, head: 'x', step: 'G', octave: 5 },
  { pitch: 50, label: '하이 탐', y: 87, head: 'normal', step: 'E', octave: 5 },
  { pitch: 47, label: '미들 탐', y: 92, head: 'normal', step: 'D', octave: 5 },
  { pitch: 38, label: '스네어', y: 97, head: 'normal', step: 'C', octave: 5 },
  { pitch: 37, label: '크로스 스틱', y: 97, head: 'normal', step: 'C', octave: 5 },
  { pitch: 43, label: '플로어 탐', y: 112, head: 'normal', step: 'G', octave: 4 },
  { pitch: 36, label: '킥', y: 117, head: 'normal', step: 'F', octave: 4 },
  { pitch: 44, label: '페달 하이햇', y: 127, head: 'x', step: 'D', octave: 4 },
  { pitch: 52, label: '차이나 심벌', y: 67, head: 'circle-x', step: 'B', octave: 5 },
  { pitch: 55, label: '스플래시', y: 57, head: 'diamond', step: 'D', octave: 6 },
  { pitch: 56, label: '카우벨', y: 62, head: 'triangle', step: 'C', octave: 6 },
  { pitch: 57, label: '크래시 2', y: 67, head: 'x', step: 'B', octave: 5 },
  { pitch: 53, label: '라이드 벨 / 컵', y: 82, head: 'diamond', step: 'F', octave: 5 },
  { pitch: 48, label: '탐 3', y: 107, head: 'normal', step: 'A', octave: 4 },
  { pitch: 45, label: '탐 4', y: 112, head: 'normal', step: 'G', octave: 4 },
  { pitch: 41, label: '탐 5', y: 117, head: 'normal', step: 'F', octave: 4 },
  { pitch: 35, label: '킥 2', y: 122, head: 'normal', step: 'E', octave: 4 },
];
scoreDrums.sort((a, b) => a.y - b.y);

export const drumTechniqueLabels = {
  normal: '기본',
  rimshot: '림샷',
  closed: '닫힘 표시 +',
  'half-open': '하프 오픈',
  open: '열림 표시 ○',
  choke: '초크',
  double: '더블 스트로크',
  buzz: '버즈 롤',
  flam: '플램',
  drag: '드래그',
  roll2: '롤 · 사선 2개',
  roll3: '롤 · 사선 3개',
} as const;
export type DrumTechnique = keyof typeof drumTechniqueLabels;
export function drumTechniques(pitch: number): DrumTechnique[] {
  if (pitch === 38)
    return ['normal', 'rimshot', 'double', 'buzz', 'flam', 'drag', 'roll2', 'roll3'];
  if ([50, 47, 48, 43, 45, 41].includes(pitch))
    return ['normal', 'flam', 'drag', 'double', 'buzz', 'roll2', 'roll3'];
  if (pitch === 42) return ['normal', 'closed'];
  if (pitch === 46) return ['normal', 'half-open'];
  if (pitch === 44) return ['normal', 'open'];
  if ([49, 57, 52, 55].includes(pitch)) return ['normal', 'choke'];
  return ['normal'];
}
export function validDrumTechnique(pitch: number, value: unknown): value is DrumTechnique {
  return typeof value === 'string' && drumTechniques(pitch).includes(value as DrumTechnique);
}
export function drumNotation(tone: Pick<ScoreTone, 'pitch' | 'drumTechnique'>) {
  const drum = drumForPitch(tone.pitch);
  return {
    head:
      tone.pitch === 44 && tone.drumTechnique === 'open'
        ? ('circle-x' as const)
        : (drum?.head ?? 'normal'),
    hollow: tone.pitch === 37,
    rimshot: tone.drumTechnique === 'rimshot',
    roll:
      tone.drumTechnique === 'double' ||
      tone.drumTechnique === 'buzz' ||
      tone.drumTechnique === 'roll2' ||
      tone.drumTechnique === 'roll3'
        ? tone.drumTechnique
        : undefined,
    mark:
      tone.drumTechnique &&
      ['open', 'closed', 'half-open', 'choke'].includes(tone.drumTechnique) &&
      !(tone.pitch === 44 && tone.drumTechnique === 'open')
        ? tone.drumTechnique
        : tone.pitch === 46
          ? ('open' as const)
          : undefined,
  };
}
function drumTechnicalXml(tone: ScoreTone): string {
  const { mark } = drumNotation(tone);
  if (tone.pitch === 44 && tone.drumTechnique === 'open') return '<open/>';
  if (
    ['rimshot', 'double', 'buzz', 'flam', 'drag', 'roll2', 'roll3'].includes(
      tone.drumTechnique ?? '',
    )
  )
    return `<other-technical>${tone.drumTechnique}</other-technical>`;
  if (mark === 'open') return '<open/>';
  if (mark === 'closed') return '<stopped/>';
  if (mark === 'half-open') return '<half-muted/>';
  if (mark === 'choke') return '<other-technical>choke</other-technical>';
  return '';
}

export const drumForPitch = (pitch: number) => scoreDrums.find((drum) => drum.pitch === pitch);
export const drumAtRow = (row: number) =>
  scoreDrums[Math.max(0, Math.min(scoreDrums.length - 1, row - 1))];
export const drumLabel = (pitch: number, technique?: DrumTechnique) =>
  pitch === 44 && technique === 'open'
    ? '풋 하이햇 스플래시'
    : `${drumForPitch(pitch)?.label ?? `드럼 ${pitch}`}${technique && technique !== 'normal' ? ` · ${drumTechniqueLabels[technique]}` : ''}`;

export function readScoreMultiMeasureRests(
  value: unknown,
  parts: string[],
): NonNullable<Score['multiMeasureRests']> {
  const invalid = () => new Error('여러 마디 쉼표 설정이 올바르지 않아요.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const result: NonNullable<Score['multiMeasureRests']> = {};
  for (const [part, ranges] of Object.entries(value)) {
    if (
      !parts.includes(part) ||
      ['__proto__', 'constructor', 'prototype'].includes(part) ||
      !ranges ||
      typeof ranges !== 'object' ||
      Array.isArray(ranges)
    )
      throw invalid();
    let end = 0;
    const entries = Object.entries(ranges).sort(([a], [b]) => Number(a) - Number(b));
    for (const [key, count] of entries) {
      const start = Number(key);
      if (
        !/^(0|[1-9]\d*)$/.test(key) ||
        start < end ||
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 128 ||
        start + count > 32000
      )
        throw invalid();
      end = start + count;
    }
    result[part] = Object.fromEntries(entries) as Record<number, number>;
  }
  return result;
}

export function setScoreDrum(
  score: Score,
  id: string,
  pitch: number,
  remove = false,
  technique: DrumTechnique = 'normal',
  replacePosition = false,
): Score {
  if (!drumForPitch(pitch)) throw new Error('입력할 드럼 악기를 선택해주세요.');
  if (!validDrumTechnique(pitch, technique))
    throw new Error('이 드럼 악기에 사용할 수 없는 주법이에요.');
  const note = score.notes.find((item) => item.id === id);
  if (!note) return score;
  const original: ScoreTone[] =
    note.rest || note.blank ? [] : note.tones?.length ? note.tones : [{ pitch: note.pitch }];
  const matches = (tone: ScoreTone) =>
    replacePosition ? drumForPitch(tone.pitch)?.y === drumForPitch(pitch)?.y : tone.pitch === pitch;
  const hasPosition = original.some(matches);
  // Keyboard deletion from an empty staff position clears the current beat's hits.
  // Exact-pitch removal remains a no-op when that instrument is absent.
  const clearBeat = remove && replacePosition && original.length > 0 && !hasPosition;
  if (remove && !hasPosition && !clearBeat) return score;
  const prior = original.find((tone) => tone.pitch === pitch);
  if (
    !remove &&
    prior &&
    (prior.drumTechnique ?? 'normal') === technique &&
    original.filter(matches).length === 1
  )
    return score;
  const tones = clearBeat ? [] : original.filter((tone) => !matches(tone));
  if (!remove)
    tones.push({
      ...prior,
      pitch,
      ghost: prior?.ghost ?? note.ghost,
      drumTechnique: technique === 'normal' ? undefined : technique,
    });
  // A grace note has no timed space to turn into a rest when its last hit is removed.
  if (!tones.length && note.graceBeats !== undefined) return deleteScorePosition(score, id);
  const updated: ScoreNote = {
    ...note,
    tones,
    pitch: tones[0]?.pitch ?? pitch,
    rest: !tones.length,
    blank: false,
    dead: false,
    connection: undefined,
    slurTo: undefined,
    slideOut: undefined,
    slideIn: undefined,
  };
  return { ...score, notes: score.notes.map((item) => (item.id === id ? updated : item)) };
}

export type ScoreTone = {
  pitch: number;
  /** Unaltered MIDI pitch of the written staff position (e.g. 60 for C-flat/C/C-sharp). */
  naturalPitch?: number;
  drumTechnique?: DrumTechnique;
  string?: number;
  fret?: number;
  ghost?: boolean;
  dead?: boolean;
};
export type ScoreConnectionType = 'hammer' | 'pull' | 'slide' | 'glissando' | 'tie';
export const scoreConnectionLabels = {
  hammer: '해머링',
  pull: '풀링',
  slide: '레가토 슬라이드',
  // Keep the stored key compatible with existing scores and imports.
  glissando: '시프트 슬라이드',
  tie: '붙임줄',
};
export const SCORE_DIVISIONS = 48;
export const MIN_SCORE_BEATS = 1 / SCORE_DIVISIONS;
export const scoreBeat = (value: number) => Math.round(value * SCORE_DIVISIONS) / SCORE_DIVISIONS;
export const isScoreBeat = (value: number) =>
  Number.isFinite(value) &&
  Math.abs(value * SCORE_DIVISIONS - Math.round(value * SCORE_DIVISIONS)) < 1e-7;
export const writtenScoreBeats = (note: { tuplet?: 3; graceBeats?: number }, beats: number) =>
  note.graceBeats !== undefined
    ? Math.min(0.5, note.graceBeats)
    : note.tuplet === 3
      ? scoreBeat(beats * 1.5)
      : beats;
export const DOTTED_SCORE_BEATS = [6, 3, 1.5, 0.75, 0.375, 0.1875];
export type ScoreNote = {
  id: string;
  pitch: number;
  beats: number;
  rest: boolean;
  part: string;
  chord: string;
  lyric: string;
  accent: boolean;
  marcato?: boolean;
  sticking?: 'R' | 'L';
  slash?: boolean;
  /** Derived for playback only; not part of the saved document. */
  playbackGain?: number;
  guitarTone?: GuitarTone;
  percussionImplement?: 'sticks' | 'brushes' | 'mallets';
  staccato?: boolean;
  ghost?: boolean;
  dead?: boolean;
  tones?: ScoreTone[];
  blank?: boolean;
  connection?: { type: ScoreConnectionType; targetId: string };
  slurTo?: string;
  slideOut?: 'up' | 'down';
  slideIn?: 'up' | 'down';
  graceSlide?: { pitch: number; string: number; fret: number };
  /** A separately editable grace note: beats is zero; this retains its normal duration. */
  graceBeats?: number;
  tuplet?: 3;
};
export type Score = {
  title: string;
  rhythmFeel?: keyof typeof scoreRhythmFeels;
  timeSignature?: { beats: number; beatType: number };
  keySignature?: number;
  measureLengths?: Record<string, Record<number, number>>;
  measureWidths?: Record<string, Record<number, number>>;
  multiMeasureRests?: Record<string, Record<number, number>>;
  directions?: Record<string, Record<number, ScoreDirection>>;
  guitarToneChanges?: Record<string, Record<number, GuitarTone>>;
  navigation?: Record<number, ScoreNavigation>;
  expressionResolved?: string[];
  repeats?: Record<number, { start?: boolean; end?: boolean; times?: number }>;
  barlines?: Record<number, 'double'>;
  bpm: number;
  notes: ScoreNote[];
  parts: string[];
  sync: Record<string, number>;
  instruments?: Record<string, string>;
  capos?: Record<string, number>;
  // Each keyboard has two independent timelines, presented as one logical part.
  keyboardStaves?: Record<string, string>;
  // Two independent drum timelines are drawn together on one percussion staff.
  drumVoices?: Record<string, string>;
  partMix?: Record<string, { volume: number; muted: boolean; solo: boolean }>;
  systemLayout?: Record<string, number[]>;
  /** Space between successive score systems at 100% zoom, in pixels (0–160). */
  systemGap?: number;
  equalWidthRows?: Record<string, number[]>;
  playbackVolume?: number;
  playbackInstruments?: Record<string, string>;
  measureChords?: Record<string, Record<number, string>>;
  beatChords?: Record<string, Record<number, string>>;
  referenceAudioName?: string;
  referenceAudioSource?: 'file' | 'youtube';
  referenceYoutubeId?: string;
  referenceAudioEnabled?: boolean;
  referenceAudioOffset?: number;
  referenceAudioVolume?: number;
};
export const scoreRhythmFeels = {
  straight: { label: '셋잇단음표 느낌 없음', unit: 0.5, first: 1, second: 1 },
  'triplet-eighth': { label: '8분음표 셋잇단음표 느낌', unit: 0.5, first: 2, second: 1 },
  'triplet-sixteenth': { label: '16분음표 셋잇단음표 느낌', unit: 0.25, first: 2, second: 1 },
  'dotted-eighth': { label: '점8분음표 느낌', unit: 0.5, first: 3, second: 1 },
  'dotted-sixteenth': { label: '점16분음표 느낌', unit: 0.25, first: 3, second: 1 },
  'scottish-eighth': { label: '스코티시 8분음표 느낌', unit: 0.5, first: 1, second: 3 },
  'scottish-sixteenth': { label: '스코티시 16분음표 느낌', unit: 0.25, first: 1, second: 3 },
} as const;

// Resolve notation into a temporary performance score, never into saved notes.
export function scoreExpressionPerformance(score: Score, part: string): Score {
  if (
    score.expressionResolved?.includes(part) ||
    (!score.directions?.[directionOwner(score, part)] &&
      !score.notes.some((n) => n.part === part && n.slash))
  )
    return score;
  const owner = directionOwner(score, part),
    directions = score.directions?.[owner] ?? {};
  let rows = score.notes.filter((n) => n.part === part);
  if (Object.values(directions).some((d) => d.measureRepeat)) {
    const measures = scoreMeasures(score, part),
      expanded: ScoreNote[][] = [];
    for (let bar = 0; bar < measures.length; bar++) {
      const repeat = directions[bar]?.measureRepeat;
      if (repeat && bar === 0) throw new Error('첫 마디에서는 앞 마디 반복을 사용할 수 없어요.');
      const input = repeat
        ? expanded[bar - 1]
        : measures[bar].map((f) => ({ ...f.note, beats: f.beats }));
      const capacity = scoreMeasureDuration(score, part, bar);
      const repeatedIds = new Map(
        input.map((n, index) => [n.id, `repeat/${part}/${bar}/${index}`]),
      );
      let used = 0;
      expanded[bar] = input.flatMap((n, index) => {
        if (used >= capacity) return [];
        const beats = Math.min(n.beats, capacity - used);
        used = scoreBeat(used + beats);
        return [
          {
            ...n,
            id: repeat ? `repeat/${part}/${bar}/${index}` : n.id,
            beats,
            connection: repeat
              ? n.connection && repeatedIds.has(n.connection.targetId)
                ? { ...n.connection, targetId: repeatedIds.get(n.connection.targetId)! }
                : undefined
              : n.connection,
            slurTo: repeat ? (n.slurTo ? repeatedIds.get(n.slurTo) : undefined) : n.slurTo,
          },
        ];
      });
      if (used < capacity)
        expanded[bar].push({
          id: `pad/${part}/${bar}`,
          part,
          pitch: 60,
          beats: scoreBeat(capacity - used),
          rest: true,
          blank: true,
          chord: '',
          lyric: '',
          accent: false,
        });
    }
    // A sustained source note split by bar layout must remain one attack.
    rows = expanded.flat().reduce<ScoreNote[]>((result, n) => {
      const previous = result.at(-1);
      if (previous?.id === n.id) previous.beats = scoreBeat(previous.beats + n.beats);
      else result.push({ ...n });
      return result;
    }, []);
  }
  let at = 0;
  const percussion = scoreInstrument(score, part).id === 'drums';
  if (!percussion)
    rows = resolveRhythmSlashes(
      rows,
      scoreChordPositions(score, part),
      scoreInstrument(score, part).capo,
      scoreInstrument(score, part).id === 'bass',
    );
  const notes = rows.map((note) => {
    const location = scoreMeasureAtBeat(score, part, at),
      state = directionAt(score, part, location.bar + location.offset / location.beats);
    at = scoreBeat(at + note.beats);
    let tones = noteTones(note);
    if (percussion && note.slash && !note.rest && !note.blank)
      tones = [{ pitch: 42 }, { pitch: Math.floor(location.offset) % 2 === 0 ? 36 : 38 }];
    if (percussion) tones = tones.map((t) => resolveHiHat(t, state.hiHat));
    return {
      ...note,
      tones,
      pitch: tones[0]?.pitch ?? note.pitch,
      playbackGain: state.gain / dynamicLevelsMf,
      percussionImplement: state.implement,
    };
  });
  return {
    ...score,
    notes: [...score.notes.filter((n) => n.part !== part), ...notes],
    expressionResolved: [...(score.expressionResolved ?? []), part],
  };
}
const dynamicLevelsMf = 0.7;

/** One note selects its whole bar; a range keeps its exact beat endpoints. */
export function scoreSwellSelection(score: Score, part: string, ids: string[]) {
  const rows = score.notes.filter((n) => n.part === part);
  const chosen = rows.filter((n) => ids.includes(n.id));
  if (!chosen.length) throw new Error('강약을 변화시킬 박을 선택해주세요.');
  const first = rows.indexOf(chosen[0]),
    last = rows.indexOf(chosen.at(-1)!);
  if (chosen.length !== ids.length || last - first + 1 !== chosen.length)
    throw new Error('같은 성부에서 이어지는 박을 선택해주세요.');
  const startBeat = rows.slice(0, first).reduce((sum, n) => scoreBeat(sum + n.beats), 0);
  const startLocation = scoreMeasureAtBeat(score, part, startBeat);
  if (chosen.length === 1) return { start: startLocation.bar, end: startLocation.bar + 1 };
  const endBeat = rows.slice(0, last + 1).reduce((sum, n) => scoreBeat(sum + n.beats), 0);
  const endLocation = scoreMeasureAtBeat(score, part, endBeat);
  const start = startLocation.bar + startLocation.offset / startLocation.beats;
  const end = endLocation.bar + endLocation.offset / endLocation.beats;
  if (end <= start) throw new Error('길이가 있는 박을 함께 선택해주세요.');
  return { start, end };
}

export function setScoreSwell(
  score: Score,
  part: string,
  ids: string[],
  kind: 'crescendo' | 'decrescendo' | null,
): Score {
  const { start, end } = scoreSwellSelection(score, part, ids),
    owner = directionOwner(score, part);
  const bars = { ...score.directions?.[owner] };
  // Replace only intersecting hairpins; other ranges in the same measure remain.
  for (const [key, d] of Object.entries(bars)) {
    bars[+key] = {
      ...d,
      swell: d.swell && +key < end && d.swell.endBar > start ? undefined : d.swell,
      swells: d.swells?.filter(
        (s) => +key + s.startOffset >= end || s.endBar + s.endOffset <= start,
      ),
    };
  }
  if (kind) {
    const levels = Object.entries(dynamicLevels) as [keyof typeof dynamicLevels, number][];
    let from = directionAt(
      { ...score, directions: { ...score.directions, [owner]: bars } },
      part,
      start,
    ).gain;
    const up = kind === 'crescendo';
    if (up && from >= dynamicLevels.ff) from = dynamicLevels.f;
    if (!up && from <= dynamicLevels.pp) from = dynamicLevels.p;
    const to = (
      up
        ? levels.find(([, gain]) => gain > from)
        : [...levels].reverse().find(([, gain]) => gain < from)
    )![0];
    const bar = Math.floor(start);
    const range: ScoreSwell = {
      startOffset: start - bar,
      endBar: Math.floor(end),
      endOffset: end - Math.floor(end),
      from,
      to,
    };
    bars[bar] = {
      ...bars[bar],
      swells: [...(bars[bar]?.swells ?? []), range].sort((a, b) => a.startOffset - b.startOffset),
    };
  }
  return { ...score, directions: { ...score.directions, [owner]: bars } };
}

// Swing belongs to beat positions, including offbeats followed by sustained notes.
// Explicit tuplets and dotted rhythms protect their beat cells from a second swing.
export function scorePerformance(score: Score, part: string) {
  score = scoreExpressionPerformance(score, part);
  const feel = scoreRhythmFeels[score.rhythmFeel ?? 'straight'];
  const changes = new Map<string, number>();
  const pairs: { start: number; middle: number; end: number; performedMiddle: number }[] = [];
  let at = 0;
  const rows = score.notes
    .filter((note) => note.part === part)
    .map((note) => {
      const start = at;
      at = scoreBeat(at + note.beats);
      return { note, start, end: at };
    });
  if (feel && feel.first !== feel.second) {
    const candidates = new Map<number, { start: number; end: number }>();
    for (const boundary of rows.flatMap((row) => [row.start, row.end])) {
      const location = scoreMeasureAtBeat(score, part, boundary);
      const subdivision = location.offset / feel.unit;
      if (
        Math.abs(subdivision - Math.round(subdivision)) > 1e-7 ||
        Math.round(subdivision) % 2 !== 1
      )
        continue;
      const start = scoreBeat(boundary - feel.unit),
        end = scoreBeat(boundary + feel.unit);
      if (end <= location.start + location.beats + 1e-7) candidates.set(start, { start, end });
    }
    for (const { start, end } of candidates.values()) {
      if (
        rows.some(
          ({ note, start: from, end: to }) =>
            from < end && to > start && (note.tuplet || DOTTED_SCORE_BEATS.includes(note.beats)),
        )
      )
        continue;
      const performedMiddle =
        start + scoreBeat((feel.unit * 2 * feel.first) / (feel.first + feel.second));
      const warp = (beat: number) =>
        beat <= start || beat >= end
          ? beat
          : beat <= start + feel.unit
            ? start + ((beat - start) * (performedMiddle - start)) / feel.unit
            : performedMiddle + ((beat - start - feel.unit) * (end - performedMiddle)) / feel.unit;
      // Extremely short notes must not disappear when rounded to the score's tick grid.
      if (
        rows.some(
          (row) =>
            row.start < end &&
            row.end > start &&
            scoreBeat(warp(row.end)) <= scoreBeat(warp(row.start)),
        )
      )
        continue;
      pairs.push({ start, middle: start + feel.unit, end, performedMiddle });
    }
  }
  const map = (beat: number, inverse: boolean) => {
    const pair = pairs.find((item) => beat >= item.start && beat < item.end);
    if (!pair) return beat;
    const fromMiddle = inverse ? pair.performedMiddle : pair.middle;
    const toMiddle = inverse ? pair.middle : pair.performedMiddle;
    return beat < fromMiddle
      ? pair.start + ((beat - pair.start) * (toMiddle - pair.start)) / (fromMiddle - pair.start)
      : toMiddle + ((beat - fromMiddle) * (pair.end - toMiddle)) / (pair.end - fromMiddle);
  };
  for (const { note, start, end } of rows) {
    const duration = scoreBeat(scoreBeat(map(end, false)) - scoreBeat(map(start, false)));
    if (duration !== note.beats) changes.set(note.id, duration);
  }
  return {
    score: changes.size
      ? {
          ...score,
          rhythmFeel: 'straight' as const,
          notes: score.notes.map((note) =>
            changes.has(note.id) ? { ...note, beats: changes.get(note.id)! } : note,
          ),
        }
      : score,
    toPerformed: (beat: number) => map(beat, false),
    toWritten: (beat: number) => map(beat, true),
  };
}
export function connectionError(
  from: ScoreNote,
  to: ScoreNote | undefined,
  type: ScoreConnectionType,
): string | null {
  if (!to || from.part !== to.part) return '같은 파트의 이어지는 두 음표를 선택해주세요.';
  if (to.slideIn) return '슬라이드 인을 해제한 뒤 앞 음과 연결해주세요.';
  if (to.graceSlide) return '박 안 슬라이드의 도착음에는 앞 음표를 연결할 수 없어요.';
  if (
    [from, to].some(
      (n) =>
        n.rest ||
        n.blank ||
        (from.graceBeats === undefined && (noteTones(n).some((t) => t.dead) || n.staccato)),
    )
  )
    return '쉼표·빈 박·뮤트·스타카토 음표는 연결할 수 없어요.';
  if (from.slideOut) return '슬라이드 아웃을 해제한 뒤 다음 음과 연결해주세요.';
  const a = noteTones(from),
    b = noteTones(to);
  if (type === 'tie') {
    const pitches = (tones: ScoreTone[]) =>
      tones
        .map((t) => t.pitch)
        .sort((x, y) => x - y)
        .join(',');
    return a.length && pitches(a) === pitches(b)
      ? null
      : '붙임줄은 같은 음높이의 음표끼리 연결해주세요. 코드는 모든 음이 같아야 해요.';
  }
  if (type === 'glissando' || type === 'slide') {
    return a.length === 1 &&
      b.length === 1 &&
      a[0].string &&
      b[0].string &&
      a[0].pitch !== b[0].pitch
      ? null
      : '슬라이드는 서로 다른 높이의 단음 두 개를 선택해주세요. 줄은 달라도 됩니다.';
  }
  if (a.length !== 1 || b.length !== 1 || !a[0].string || a[0].string !== b[0].string)
    return '해머링·풀링은 같은 줄의 단음 두 개를 선택해주세요.';
  if (type === 'hammer' && a[0].pitch >= b[0].pitch)
    return '해머링은 낮은 음에서 높은 음으로 연결해주세요.';
  if (type === 'pull' && a[0].pitch <= b[0].pitch)
    return '풀링은 높은 음에서 낮은 음으로 연결해주세요.';
  return null;
}

// A connection belongs to an explicit pair. Structural edits must never retarget it.
export function cleanScoreConnections(score: Score): Score {
  const nextById = new Map<string, ScoreNote>();
  for (const part of score.parts) {
    const notes = score.notes.filter((n) => n.part === part);
    notes.slice(0, -1).forEach((n, i) => nextById.set(n.id, notes[i + 1]));
  }
  let changed = false;
  const notes = score.notes.map((note) => {
    if (note.graceSlide) {
      const tones = noteTones(note),
        source = note.graceSlide;
      if (
        note.rest ||
        note.blank ||
        note.staccato ||
        tones.length !== 1 ||
        tones[0].dead ||
        tones[0].string !== source.string ||
        tones[0].fret === undefined ||
        tones[0].pitch === source.pitch ||
        tones[0].pitch - source.pitch !== tones[0].fret - source.fret
      ) {
        changed = true;
        note = { ...note, graceSlide: undefined };
      }
    }
    if (
      (note.slideOut || note.slideIn) &&
      (note.rest ||
        note.blank ||
        note.staccato ||
        noteTones(note).length !== 1 ||
        noteTones(note).some((tone) => tone.dead))
    ) {
      changed = true;
      note = { ...note, slideOut: undefined, slideIn: undefined };
    }
    const c = note.connection,
      next = nextById.get(note.id);
    if (
      !c ||
      (Object.hasOwn(scoreConnectionLabels, c.type) &&
        next?.id === c.targetId &&
        !connectionError(note, next, c.type))
    )
      return note;
    changed = true;
    const copy = { ...note };
    delete copy.connection;
    return copy;
  });
  const cleaned = notes.map((note) => {
    if (!note.slurTo) return note;
    const part = notes.filter((item) => item.part === note.part);
    const from = part.indexOf(note),
      to = part.findIndex((item) => item.id === note.slurTo);
    if (to > from && part.slice(from, to + 1).every((item) => !item.rest && !item.blank))
      return note;
    changed = true;
    const copy = { ...note };
    delete copy.slurTo;
    return copy;
  });
  return changed ? { ...score, notes: cleaned } : score;
}

export function scoreHammerPullLabel(notes: ScoreNote[]): 'H' | 'P' | 'H/P' {
  const directions = new Set(
    notes.slice(1).map((note, index) => Math.sign(note.pitch - notes[index].pitch)),
  );
  return directions.size === 1 && directions.has(1)
    ? 'H'
    : directions.size === 1 && directions.has(-1)
      ? 'P'
      : 'H/P';
}

/** A run uses the existing adjacent H/P links, so playback and file formats stay shared. */
export function scoreHammerPullGroups(notes: ScoreNote[]): ScoreNote[][] {
  const groups: ScoreNote[][] = [];
  for (let i = 0; i < notes.length - 1; i++) {
    const start = i;
    while (
      i < notes.length - 1 &&
      ['hammer', 'pull'].includes(notes[i].connection?.type ?? '') &&
      notes[i].connection?.targetId === notes[i + 1].id
    )
      i++;
    if (i > start) {
      groups.push(notes.slice(start, i + 1));
      i--;
    }
  }
  return groups;
}

export function scoreHammerPullSelection(score: Score, ids: string[]) {
  const first = score.notes.find((note) => note.id === ids[0]);
  if (!first) throw new Error('H/P로 연결할 음표를 선택해주세요.');
  const rows = score.notes.filter((note) => note.part === first.part);
  const selected = rows.filter((note) => ids.includes(note.id));
  const start = rows.indexOf(selected[0]);
  const notes = ids.length === 1 ? rows.slice(start, start + 2) : selected;
  if (
    notes.length < 2 ||
    (ids.length > 1 && selected.length !== ids.length) ||
    notes.some((note, i) => rows[start + i] !== note)
  )
    throw new Error('같은 파트에서 이어지는 두 음 이상의 구간을 선택해주세요.');
  const resolved = notes.map((note) => ({
    ...note,
    tones: tabTones(note, scoreInstrument(score, note.part).tuning),
  }));
  const links = resolved.slice(0, -1).map((note, i) => {
    const next = resolved[i + 1];
    if (note.pitch === next.pitch)
      throw new Error('같은 높이의 음은 H/P 대신 붙임줄을 사용해주세요.');
    const type = next.pitch > note.pitch ? 'hammer' : 'pull';
    const error = connectionError(note, next, type);
    if (error) throw new Error(error);
    return { type, targetId: next.id } as NonNullable<ScoreNote['connection']>;
  });
  return {
    notes: resolved,
    links,
    label: scoreHammerPullLabel(resolved),
    applied: links.every(
      (link, i) =>
        notes[i].connection?.type === link.type && notes[i].connection?.targetId === link.targetId,
    ),
  };
}

export function setScoreHammerPull(score: Score, ids: string[]): Score {
  const { notes, links, applied } = scoreHammerPullSelection(score, ids);
  const replacements = new Map(
    notes.map((note, i) => [
      note.id,
      i < links.length ? { ...note, connection: applied ? undefined : links[i] } : note,
    ]),
  );
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((note) => replacements.get(note.id) ?? note),
  });
}

export function setScoreConnection(
  score: Score,
  ids: string[],
  type: ScoreConnectionType | null,
): Score {
  if (type === null && ids.length > 2) {
    const sources = new Set(ids.slice(0, -1));
    return {
      ...score,
      notes: score.notes.map((note) =>
        sources.has(note.id) ? { ...note, connection: undefined } : note,
      ),
    };
  }
  const from = score.notes.find((n) => n.id === ids[0]);
  if (!from) throw new Error('연결할 음표를 선택해주세요.');
  const rows = score.notes.filter((n) => n.part === from.part);
  const to = rows[rows.indexOf(from) + 1];
  if (ids.length > 2 || (ids.length === 2 && to?.id !== ids[1]))
    throw new Error('이어지는 두 음표만 선택해주세요.');
  const remove =
    type === null || (from.connection?.type === type && from.connection.targetId === to?.id);
  const resolve = (n: ScoreNote) =>
    !remove && type !== 'tie'
      ? { ...n, tones: tabTones(n, scoreInstrument(score, n.part).tuning) }
      : n;
  const source = resolve(from),
    target = to ? resolve(to) : undefined;
  if (!remove) {
    const error = connectionError(source, target, type!);
    if (error) throw new Error(error);
  }
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((n) =>
      n.id === from.id
        ? {
            ...source,
            connection: remove ? undefined : { type: type!, targetId: to.id },
          }
        : !remove && n.id === target?.id
          ? target
          : n,
    ),
  });
}

export type ScoreClipboardNote = ScoreNote & {
  copiedConnection?: ScoreConnectionType;
  copiedChords?: { offset: number; chord: string }[];
  copiedGuitarTones?: { offset: number; tone: GuitarTone }[];
};

export function copyScoreNotes(score: Score, part: string, ids: string[]): ScoreClipboardNote[] {
  const chosen = new Set(ids);
  const chords = Object.entries(scoreChordPositions(score, part));
  let at = 0;
  return score.notes
    .filter((note) => note.part === part)
    .flatMap((note) => {
      const start = at;
      at = scoreBeat(at + note.beats);
      return chosen.has(note.id)
        ? [
            {
              ...note,
              connection: undefined,
              copiedConnection:
                note.connection && chosen.has(note.connection.targetId)
                  ? note.connection.type
                  : undefined,
              chord: '',
              tones: note.tones?.map((tone) => ({ ...tone })),
              copiedGuitarTones: Object.entries(score.guitarToneChanges?.[part] ?? {})
                .filter(([beat]) => +beat >= start && +beat < at)
                .map(([beat, tone]) => ({ offset: scoreBeat(+beat - start), tone })),
              copiedChords: chords
                .filter(([beat]) => Number(beat) >= start && Number(beat) < at)
                .map(([beat, chord]) => ({ offset: scoreBeat(Number(beat) - start), chord })),
            },
          ]
        : [];
    });
}
export const scoreTimeSignature = (score: Score) => {
  const time = score.timeSignature;
  return time &&
    Number.isInteger(time.beats) &&
    time.beats >= 1 &&
    time.beats <= 16 &&
    [2, 4, 8, 16].includes(time.beatType)
    ? time
    : { beats: 4, beatType: 4 };
};
export const scoreBarBeats = (score: Score) => {
  const time = scoreTimeSignature(score);
  return (time.beats * 4) / time.beatType;
};
export const scoreMeasureDuration = (score: Score, part: string, bar: number) => {
  const length = score.measureLengths?.[part]?.[bar];
  return length !== undefined &&
    Number.isFinite(length) &&
    length >= MIN_SCORE_BEATS &&
    length <= 128000 &&
    isScoreBeat(length)
    ? length
    : scoreBarBeats(score);
};
export function scoreMeasureStart(score: Score, part: string, bar: number): number {
  const expected = scoreBarBeats(score);
  return scoreBeat(
    expected * bar +
      Object.entries(score.measureLengths?.[part] ?? {}).reduce(
        (sum, [index]) =>
          sum +
          (Number(index) < bar ? scoreMeasureDuration(score, part, Number(index)) - expected : 0),
        0,
      ),
  );
}
export function scoreMeasureAtBeat(score: Score, part: string, beat: number) {
  let start = 0;
  for (let bar = 0; bar < 32000; bar++) {
    const beats = scoreMeasureDuration(score, part, bar);
    if (scoreBeat(beat) < scoreBeat(start + beats) || bar === 31999)
      return { bar, start, beats, offset: scoreBeat(Math.max(0, beat - start)) };
    start = scoreBeat(start + beats);
  }
  return { bar: 0, start: 0, beats: scoreBarBeats(score), offset: 0 };
}
export function setScoreTimeSignature(score: Score, beats: number, beatType: number): Score {
  if (!Number.isInteger(beats) || beats < 1 || beats > 16 || ![2, 4, 8, 16].includes(beatType))
    throw new Error('박자표는 1~16 / 2·4·8·16으로 설정해주세요.');
  const measureLengths = { ...score.measureLengths };
  for (const part of score.parts) {
    measureLengths[part] = Object.fromEntries(
      scoreMeasures(score, part).flatMap((fragments, bar) =>
        fragments.length ? [[bar, scoreMeasureDuration(score, part, bar)]] : [],
      ),
    );
  }
  return { ...score, timeSignature: { beats, beatType }, measureLengths };
}
export function setScoreMeasureWidth(
  score: Score,
  part: string,
  bar: number,
  weight: number,
): Score {
  if (
    !score.parts.includes(part) ||
    !Number.isInteger(bar) ||
    bar < 0 ||
    bar >= 32000 ||
    !Number.isInteger(weight) ||
    weight < 10 ||
    weight > 500
  )
    throw new Error('마디 너비는 10~500 사이 정수로 입력해주세요. 기본값은 100이에요.');
  return {
    ...score,
    measureWidths: {
      ...score.measureWidths,
      [part]: { ...score.measureWidths?.[part], [bar]: weight },
    },
  };
}
export function setScoreRepeat(
  score: Score,
  bar: number,
  marker: { start?: boolean; end?: boolean; times?: number },
): Score {
  if (
    !Number.isInteger(bar) ||
    bar < 0 ||
    bar >= 32000 ||
    (marker.times !== undefined &&
      (!Number.isInteger(marker.times) || marker.times < 2 || marker.times > 8))
  )
    throw new Error('반복 횟수는 2~8 사이 정수로 입력해주세요.');
  const repeats = { ...score.repeats };
  if (marker.start || marker.end) repeats[bar] = marker;
  else delete repeats[bar];
  return { ...score, repeats };
}
export function setScoreSlur(score: Score, ids: string[]): Score {
  const from = score.notes.find((note) => note.id === ids[0]);
  if (!from) throw new Error('이음줄로 연결할 음표를 선택해주세요.');
  const notes = score.notes.filter((note) => note.part === from.part);
  const a = notes.indexOf(from);
  const b = ids.length > 1 ? notes.findIndex((note) => note.id === ids.at(-1)) : a + 1;
  if (b <= a || b >= notes.length || notes.slice(a, b + 1).some((note) => note.blank || note.rest))
    throw new Error('쉼표·빈 박이 없는 두 음 이상의 구간을 선택해주세요.');
  const slurTo = from.slurTo === notes[b].id ? undefined : notes[b].id;
  return {
    ...score,
    notes: score.notes.map((note) => (note.id === from.id ? { ...note, slurTo } : note)),
  };
}

export function setScoreSlideOut(score: Score, ids: string[], direction: 'up' | 'down'): Score {
  return setScoreSlideEdge(score, ids, direction, 'slideOut');
}
export function setScoreSlideIn(score: Score, ids: string[], direction: 'up' | 'down'): Score {
  return setScoreSlideEdge(score, ids, direction, 'slideIn');
}
function setScoreSlideEdge(
  score: Score,
  ids: string[],
  direction: 'up' | 'down',
  edge: 'slideIn' | 'slideOut',
): Score {
  const selected = score.notes.filter((note) => ids.includes(note.id));
  if (
    !selected.length ||
    selected.some(
      (note) =>
        note.rest ||
        note.blank ||
        note.staccato ||
        noteTones(note).length !== 1 ||
        noteTones(note).some((tone) => tone.dead),
    )
  )
    throw new Error('슬라이드는 쉼표·뮤트·스타카토가 아닌 단음을 선택해주세요.');
  const remove = selected.every((note) => note[edge] === direction);
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((note) =>
      ids.includes(note.id)
        ? {
            ...note,
            [edge]: remove ? undefined : direction,
            graceSlide: edge === 'slideIn' && !remove ? undefined : note.graceSlide,
            connection: edge === 'slideOut' && !remove ? undefined : note.connection,
          }
        : note,
    ),
  });
}
// Keep existing bar boundaries when a note grows. Following notes retain their bar.
function resizeDurationMeasure(before: Score, after: Score, note: ScoreNote, delta: number): Score {
  if (!delta) return after;
  const rows = before.notes.filter((item) => item.part === note.part);
  const start = rows
    .slice(0, rows.indexOf(note))
    .reduce((sum, item) => scoreBeat(sum + item.beats), 0);
  const location = scoreMeasureAtBeat(before, note.part, start);
  const fragments = scoreMeasures(before, note.part)[location.bar] ?? [];
  const used = fragments.reduce((sum, fragment) => scoreBeat(sum + fragment.beats), 0);
  if (
    used < location.beats &&
    !before.measureLengths?.[note.part]?.[location.bar] &&
    used + delta <= location.beats
  )
    return after;
  const lengths = { ...before.measureLengths?.[note.part] };
  if (delta > 0) lengths[location.bar] = scoreBeat(location.beats + delta);
  else {
    // Shorten the tail of a sustained note first, retaining the bars that follow it.
    let remove = -delta;
    const last = scoreMeasureAtBeat(before, note.part, start + note.beats - MIN_SCORE_BEATS).bar;
    for (let bar = last; bar >= location.bar && remove > 0; bar--) {
      const barStart = scoreMeasureStart(before, note.part, bar);
      const old = scoreMeasureDuration(before, note.part, bar);
      const overlap = Math.min(start + note.beats, barStart + old) - Math.max(start, barStart);
      const amount = Math.min(remove, overlap, old - MIN_SCORE_BEATS);
      lengths[bar] = scoreBeat(old - amount);
      remove = scoreBeat(remove - amount);
    }
  }
  return { ...after, measureLengths: { ...before.measureLengths, [note.part]: lengths } };
}

export function scoreMeasureCount(score: Score, part: string): number {
  const total = score.notes
    .filter((note) => note.part === part)
    .reduce((sum, note) => scoreBeat(sum + note.beats), 0);
  const chordBars = Object.entries(score.measureChords?.[part] ?? {})
    .filter(
      ([bar, chord]) =>
        Number.isInteger(Number(bar)) && Number(bar) >= 0 && Number(bar) < 32000 && chord.trim(),
    )
    .map(([bar]) => Number(bar) + 1);
  const beatBars = Object.entries(score.beatChords?.[part] ?? {})
    .filter(
      ([beat, chord]) =>
        Number.isFinite(Number(beat)) && Number(beat) >= 0 && Number(beat) < 128000 && chord.trim(),
    )
    .map(([beat]) => scoreMeasureAtBeat(score, part, Number(beat)).bar + 1);
  return Math.max(
    1,
    total ? scoreMeasureAtBeat(score, part, total - MIN_SCORE_BEATS).bar + 1 : 1,
    ...chordBars,
    ...beatBars,
    ...Object.keys(score.repeats ?? {}).map((bar) => Number(bar) + 1),
  );
}
export function scoreChordPositions(score: Score, part: string): Record<number, string> {
  const chords: Record<number, string> = {};
  let beat = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    if (note.chord.trim()) chords[beat] = note.chord;
    beat = scoreBeat(beat + note.beats);
  }
  for (const [bar, chord] of Object.entries(score.measureChords?.[part] ?? {}))
    if (chord.trim()) chords[scoreMeasureStart(score, part, Number(bar))] = chord;
  return { ...chords, ...score.beatChords?.[part] };
}
export function setScoreBeatChord(score: Score, part: string, beat: number, chord: string): Score {
  if (
    !score.parts.includes(part) ||
    !Number.isFinite(beat) ||
    beat < 0 ||
    beat >= 128000 ||
    !isScoreBeat(beat)
  )
    throw new Error('코드를 넣을 박 위치를 확인해주세요.');
  const chords = { ...score.beatChords?.[part] };
  if (chord.trim()) chords[beat] = chord.slice(0, 40);
  else delete chords[beat];
  const measures = { ...score.measureChords?.[part] };
  const location = scoreMeasureAtBeat(score, part, beat);
  if (location.offset === 0) delete measures[location.bar];
  let at = 0;
  const notes = score.notes.map((note) => {
    if (note.part !== part) return note;
    const clear = at === beat && !!note.chord;
    at = scoreBeat(at + note.beats);
    return clear ? { ...note, chord: '' } : note;
  });
  return {
    ...score,
    notes,
    measureChords: { ...score.measureChords, [part]: measures },
    beatChords: { ...score.beatChords, [part]: chords },
  };
}
export function setScoreMeasureChord(
  score: Score,
  part: string,
  measure: number,
  chord: string,
): Score {
  if (!score.parts.includes(part) || !Number.isInteger(measure) || measure < 0 || measure >= 32000)
    throw new Error('마디를 확인해주세요.');
  const chords = { ...score.measureChords?.[part] };
  if (chord.trim()) chords[measure] = chord.slice(0, 40);
  else delete chords[measure];
  return { ...score, measureChords: { ...score.measureChords, [part]: chords } };
}
export const scoreInstruments = {
  drums: { label: '드럼 · 타악기 오선보', tuning: [] as number[], clef: 'percussion' },
  guitar: { label: '기타 · 표준 튜닝', tuning: [64, 59, 55, 50, 45, 40], clef: 'treble8' },
  dropD: { label: '기타 · Drop D', tuning: [64, 59, 55, 50, 45, 38], clef: 'treble8' },
  bass: { label: '베이스 · 4현', tuning: [43, 38, 33, 28], clef: 'bass8' },
  standard: { label: '오선보 · 일반 악기', tuning: [] as number[], clef: 'treble' },
  piano: { label: '키보드 · 오른손', tuning: [] as number[], clef: 'treble' },
  pianoBass: { label: '키보드 · 왼손', tuning: [] as number[], clef: 'bass' },
} as const;
export function scoreInstrument(score: Score, part: string) {
  const id =
    score.instruments?.[part] ??
    (/drum|드럼/i.test(part)
      ? 'drums'
      : /bass|베이스/i.test(part)
        ? 'bass'
        : /guitar|기타/i.test(part)
          ? 'guitar'
          : 'standard');
  const instrument =
    scoreInstruments[id as keyof typeof scoreInstruments] ?? scoreInstruments.standard;
  const capo = instrument.tuning.length ? (score.capos?.[part] ?? 0) : 0;
  return {
    id,
    ...instrument,
    capo,
    openTuning: instrument.tuning,
    tuning: capo ? instrument.tuning.map((pitch) => pitch + capo) : instrument.tuning,
  };
}
export function readScoreCapos(value: unknown, parts: string[]): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('카포 설정을 확인해주세요.');
  const result: Record<string, number> = {};
  for (const [part, fret] of Object.entries(value)) {
    if (
      !parts.includes(part) ||
      typeof fret !== 'number' ||
      !Number.isInteger(fret) ||
      fret < 0 ||
      fret > 12
    )
      throw new Error('카포는 0~12프렛으로 설정해주세요.');
    if (fret) result[part] = fret;
  }
  return result;
}
export function setScoreCapo(score: Score, part: string, fret: number): Score {
  const instrument = scoreInstrument(score, part);
  if (!score.parts.includes(part) || !instrument.tuning.length)
    throw new Error('카포는 줄과 프렛을 사용하는 악기에 설정할 수 있어요.');
  readScoreCapos({ [part]: fret }, score.parts);
  const shift = fret - instrument.capo;
  if (!shift) return score;
  const capos = { ...score.capos };
  if (fret) capos[part] = fret;
  else delete capos[part];
  // Keep written fingering; pitches are stored at sounding pitch for every playback/export path.
  const notes = score.notes.map((note) => {
    if (note.part !== part || note.rest || note.blank) return note;
    const tones = tabTones(note, instrument.tuning).map((tone) => ({
      ...tone,
      pitch: tone.pitch + shift,
    }));
    if (tones.some((tone) => tone.pitch < 0 || tone.pitch > 127))
      throw new Error('카포를 적용하면 재생 가능한 음역을 벗어나는 음표가 있어요.');
    return {
      ...note,
      pitch: tones[0].pitch,
      tones,
      ...(note.graceSlide
        ? { graceSlide: { ...note.graceSlide, pitch: note.graceSlide.pitch + shift } }
        : {}),
    };
  });
  return { ...score, capos, notes };
}
export function setScoreGraceSlide(score: Score, id: string, fromFret: number | null): Score {
  const note = score.notes.find((n) => n.id === id);
  if (!note) throw new Error('도착 음표를 선택해주세요.');
  if (fromFret === null)
    return {
      ...score,
      notes: score.notes.map((n) => (n.id === id ? { ...n, graceSlide: undefined } : n)),
    };
  const tuning = scoreInstrument(score, note.part).tuning;
  const tones = tabTones(note, tuning),
    tone = tones[0];
  if (
    !tuning.length ||
    note.rest ||
    note.blank ||
    tones.length !== 1 ||
    !tone.string ||
    tone.fret === undefined ||
    tone.dead ||
    note.staccato
  )
    throw new Error('TAB의 단음 도착음을 선택해주세요. 쉼표·뮤트·스타카토에는 적용할 수 없어요.');
  if (!Number.isInteger(fromFret) || fromFret < 0 || fromFret > 24 || fromFret === tone.fret)
    throw new Error('출발 프렛은 도착음과 다른 0~24프렛으로 입력해주세요.');
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            tones,
            ...(n.slideIn ? { slideIn: undefined } : {}),
            graceSlide: {
              pitch: tuning[tone.string! - 1] + fromFret,
              string: tone.string!,
              fret: fromFret,
            },
          }
        : n,
    ),
  });
}
export function setScoreGraceNote(score: Score, id: string, enabled: boolean): Score {
  const note = score.notes.find((n) => n.id === id);
  if (!note || note.rest || note.blank) throw new Error('꾸밈음으로 바꿀 음표를 선택해주세요.');
  if (enabled === (note.graceBeats !== undefined)) return score;
  return retimeScore(
    score,
    score.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            beats: enabled ? 0 : n.graceBeats!,
            graceBeats: enabled ? n.beats : undefined,
            tuplet: undefined,
          }
        : n,
    ),
    [note.part],
  );
}
export function setScoreRhythmSlash(score: Score, id: string, enabled: boolean): Score {
  const note = score.notes.find((n) => n.id === id);
  if (!note || note.graceBeats !== undefined)
    throw new Error('리듬을 입력할 일반 음표를 선택해주세요.');
  const draft = {
    ...score,
    notes: score.notes.map((n) =>
      n.id === id ? { ...n, slash: enabled, rest: false, blank: false } : n,
    ),
  };
  if (!enabled) return draft;
  const resolved = resolveRhythmSlashes(
    draft.notes.filter((n) => n.part === note.part),
    scoreChordPositions(draft, note.part),
    scoreInstrument(score, note.part).capo,
    scoreInstrument(score, note.part).id === 'bass',
  ).find((n) => n.id === id)!;
  if (resolved.rest || !resolved.tones?.length)
    throw new Error(
      scoreInstrument(score, note.part).id === 'bass'
        ? '먼저 베이스 음이나 코드 이름을 입력해주세요.'
        : '앞에 코드 운지나 코드 이름을 입력해주세요.',
    );
  return cleanScoreConnections({
    ...draft,
    notes: draft.notes.map((n) =>
      n.id === id
        ? { ...n, pitch: resolved.pitch, tones: resolved.tones, connection: undefined }
        : n,
    ),
  });
}

// Grace attacks borrow a short part of the next written note, never adding song time.
export function scoreGracePerformance(score: Score, part: string): Score {
  const rows = score.notes.filter((n) => n.part === part);
  const replacements = new Map<string, ScoreNote>();
  let pending: ScoreNote[] = [];
  for (const note of rows) {
    if (note.graceBeats !== undefined) {
      pending.push(note);
      continue;
    }
    if (!pending.length) continue;
    const total = Math.min(note.beats / 4, (0.12 * score.bpm) / 60);
    const each = total / pending.length;
    pending.forEach((n) => replacements.set(n.id, { ...n, beats: each, graceBeats: undefined }));
    replacements.set(note.id, { ...note, beats: note.beats - total });
    pending = [];
  }
  return {
    ...score,
    notes: score.notes.filter((n) => !pending.includes(n)).map((n) => replacements.get(n.id) ?? n),
  };
}
export function noteTones(note: ScoreNote): ScoreTone[] {
  const tones = note.rest ? [] : note.tones?.length ? note.tones : [{ pitch: note.pitch }];
  return tones.map((tone) => ({
    ...tone,
    ...(tone.ghost === undefined && note.ghost !== undefined ? { ghost: note.ghost } : {}),
    ...(tone.dead === undefined && note.dead !== undefined ? { dead: note.dead } : {}),
  }));
}
export function tabTones(note: ScoreNote, tuning: readonly number[]): ScoreTone[] {
  const used = new Set<number>();
  const result: ScoreTone[] = noteTones(note).map((tone) => {
    if (
      tone.string &&
      tone.fret !== undefined &&
      tone.fret >= 0 &&
      tone.fret <= 24 &&
      tuning[tone.string - 1] + tone.fret === tone.pitch &&
      !used.has(tone.string)
    ) {
      used.add(tone.string);
      return { ...tone };
    }
    const unassigned = { ...tone };
    delete unassigned.string;
    delete unassigned.fret;
    return unassigned;
  });
  return result.map((tone) => {
    if (tone.string) return tone;
    const choices = tuning
      .map((open, index) => ({ string: index + 1, fret: tone.pitch - open }))
      .filter((item) => !used.has(item.string) && item.fret >= 0 && item.fret <= 24)
      .sort((a, b) => a.fret - b.fret);
    if (!choices.length) return tone;
    used.add(choices[0].string);
    return { ...tone, ...choices[0] };
  });
}
export function setScoreFret(score: Score, id: string, string: number, fret: number): Score {
  const note = score.notes.find((item) => item.id === id);
  if (!note) return score;
  const tuning = scoreInstrument(score, note.part).tuning;
  if (
    !Number.isInteger(string) ||
    string < 1 ||
    string > tuning.length ||
    !Number.isInteger(fret) ||
    fret < 0 ||
    fret > 24
  )
    throw new Error('줄과 프렛을 확인해주세요. 프렛은 0~24까지 입력할 수 있어요.');
  const tones = [
    ...tabTones(note, tuning).filter((tone) => tone.string !== string),
    {
      string,
      fret,
      pitch: tuning[string - 1] + fret,
      dead: false,
      ghost: tabTones(note, tuning).find((tone) => tone.string === string)?.ghost ?? false,
    },
  ].sort((a, b) => (a.string ?? 99) - (b.string ?? 99));
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((item) =>
      item.id === id
        ? {
            ...item,
            ghost: false,
            dead: false,
            blank: false,
            rest: false,
            pitch: tones[0].pitch,
            tones,
          }
        : item,
    ),
  });
}
export function removeScoreString(score: Score, id: string, string: number): Score {
  const note = score.notes.find((item) => item.id === id);
  if (!note) return score;
  const tones = tabTones(note, scoreInstrument(score, note.part).tuning).filter(
    (tone) => tone.string !== string,
  );
  return {
    ...score,
    notes: score.notes.map((item) =>
      item.id === id
        ? {
            ...item,
            tones,
            blank: !tones.length,
            rest: !tones.length,
            pitch: tones[0]?.pitch ?? item.pitch,
          }
        : item,
    ),
  };
}

// Notes become blank, blanks become rests, and deleting a rest closes time in its bar only.
export function deleteScorePosition(
  score: Score,
  id: string,
  string?: number,
  beat?: number,
  makeId = () => crypto.randomUUID(),
): Score {
  const note = score.notes.find((item) => item.id === id);
  if (!note) return score;
  if (note.graceBeats !== undefined)
    return cleanScoreConnections({ ...score, notes: score.notes.filter((n) => n.id !== id) });
  if (note.rest && !note.blank) {
    const rows = score.notes.filter((item) => item.part === note.part);
    const start = rows
      .slice(0, rows.indexOf(note))
      .reduce((sum, item) => scoreBeat(sum + item.beats), 0);
    const location = scoreMeasureAtBeat(score, note.part, beat ?? start);
    const from = Math.max(start, location.start);
    const end = Math.min(scoreBeat(start + note.beats), scoreBeat(location.start + location.beats));
    if (end <= from) return score;
    const remaining = (scoreMeasures(score, note.part)[location.bar] ?? []).some(
      (fragment) => !fragment.note.blank && fragment.note.id !== id,
    );
    const next = remaining
      ? spliceScorePartTime(score, note.part, from, end, 0, makeId)
      : spliceScorePartTime(
          score,
          note.part,
          location.start,
          scoreBeat(location.start + location.beats),
          location.beats,
          makeId,
        );
    return {
      ...next,
      measureLengths: {
        ...next.measureLengths,
        [note.part]: {
          ...next.measureLengths?.[note.part],
          [location.bar]: remaining ? scoreBeat(location.beats - (end - from)) : location.beats,
        },
      },
    };
  }
  if (!note.blank && !note.rest && string !== undefined)
    return cleanScoreConnections(removeScoreString(score, id, string));
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((item) =>
      item.id === id
        ? {
            ...item,
            rest: true,
            blank: !item.blank,
            tones: [],
            accent: false,
            staccato: false,
            ghost: false,
            dead: false,
          }
        : item,
    ),
  });
}

function blankScoreNote(part: string, beats: number, makeId: () => string): ScoreNote {
  return {
    id: makeId(),
    part,
    beats,
    pitch: 60,
    rest: true,
    blank: true,
    chord: '',
    lyric: '',
    accent: false,
  };
}
function blankScoreTime(part: string, length: number, makeId: () => string) {
  const notes: ScoreNote[] = [];
  while (length > 0) {
    const beats = Math.min(64, length);
    notes.push(blankScoreNote(part, beats, makeId));
    length = scoreBeat(length - beats);
  }
  return notes;
}

// Splice absolute time in one part; split sustained notes at the edit boundary.
export function spliceScorePartTime(
  score: Score,
  part: string,
  start: number,
  end: number,
  inserted: number,
  makeId: () => string,
): Score {
  let at = 0;
  const before: ScoreNote[] = [],
    after: ScoreNote[] = [];
  for (const note of score.notes.filter((item) => item.part === part)) {
    const from = at;
    at = scoreBeat(at + note.beats);
    if (at <= start) before.push(note);
    else if (from >= end) after.push(note);
    else {
      const left = scoreBeat(Math.max(0, start - from)),
        right = scoreBeat(Math.max(0, at - end));
      if (left && right && !inserted) before.push({ ...note, beats: scoreBeat(left + right) });
      else {
        if (left) before.push({ ...note, beats: left, connection: undefined, slideOut: undefined });
        if (right)
          after.push({
            ...note,
            id: left ? makeId() : note.id,
            beats: right,
            graceSlide: undefined,
            slideIn: undefined,
            chord: '',
            lyric: '',
            accent: false,
            slurTo: undefined,
          });
      }
    }
  }
  const used = before.reduce((sum, note) => scoreBeat(sum + note.beats), 0);
  if (inserted && used < start)
    before.push(...blankScoreTime(part, scoreBeat(start - used), makeId));
  const notes = [
    ...score.notes.filter((note) => note.part !== part),
    ...before,
    ...blankScoreTime(part, inserted, makeId),
    ...after,
  ];
  if (notes.length > 2000) throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  return retimeScore(score, notes, [part], (position) =>
    position < start
      ? position
      : position < end
        ? null
        : scoreBeat(position + inserted - (end - start)),
  );
}

// Measures are shared song structure: every part and global bar marker moves together.
export function editScoreMeasure(
  score: Score,
  bar: number,
  action: 'insert' | 'delete',
  makeId = () => crypto.randomUUID(),
): Score {
  const count = Math.max(...score.parts.map((part) => scoreMeasureCount(score, part)));
  if (
    !Number.isInteger(bar) ||
    bar < 0 ||
    bar > count ||
    (action === 'delete' && bar === count) ||
    (action === 'insert' && count >= 32000)
  )
    throw new Error('편집할 마디 위치를 확인해주세요.');
  function shift<T>(map: Record<number, T> | undefined): Record<number, T> {
    return Object.fromEntries(
      Object.entries(map ?? {}).flatMap(([key, value]) => {
        const index = Number(key);
        if (action === 'delete' && index === bar) return [];
        return [[index < bar ? index : index + (action === 'insert' ? 1 : -1), value]];
      }),
    );
  }
  let next = score;
  for (const part of score.parts) {
    const start = scoreMeasureStart(score, part, bar);
    const duration = scoreMeasureDuration(score, part, bar);
    next = spliceScorePartTime(
      next,
      part,
      start,
      action === 'insert' ? start : scoreBeat(start + duration),
      action === 'insert' ? scoreBarBeats(score) : 0,
      makeId,
    );
    next = {
      ...next,
      measureLengths: { ...next.measureLengths, [part]: shift(score.measureLengths?.[part]) },
      measureWidths: { ...next.measureWidths, [part]: shift(score.measureWidths?.[part]) },
    };
  }
  return cleanScoreConnections({
    ...next,
    repeats: shift(score.repeats),
    barlines: shift(score.barlines),
    navigation: score.navigation ? shift(score.navigation) : undefined,
    directions: score.directions
      ? Object.fromEntries(
          Object.entries(score.directions).map(([part, bars]) => [
            part,
            shift(
              Object.fromEntries(
                Object.entries(bars).map(([key, d]) => [
                  key,
                  {
                    ...d,
                    swells: d.swells?.flatMap((range) => {
                      // Endpoints at a bar line stay at that boundary when the following bar is inserted/deleted.
                      const moveEnd =
                        range.endBar > bar ||
                        (action === 'insert' &&
                          range.endBar === bar &&
                          (range.endOffset > 0 || +key >= bar));
                      const endBar = moveEnd
                        ? range.endBar + (action === 'insert' ? 1 : -1)
                        : range.endBar;
                      const endOffset =
                        action === 'delete' && range.endBar === bar ? 0 : range.endOffset;
                      const startBar = +key >= bar ? +key + (action === 'insert' ? 1 : -1) : +key;
                      return endBar + endOffset > startBar + range.startOffset
                        ? [{ ...range, endBar, endOffset }]
                        : [];
                    }),
                    swell: d.swell
                      ? action === 'delete' && d.swell.endBar === bar
                        ? undefined
                        : {
                            ...d.swell,
                            endBar:
                              d.swell.endBar >= bar
                                ? d.swell.endBar + (action === 'insert' ? 1 : -1)
                                : d.swell.endBar,
                          }
                      : undefined,
                  },
                ]),
              ),
            ),
          ]),
        )
      : undefined,
    ...(score.multiMeasureRests
      ? {
          multiMeasureRests: Object.fromEntries(
            Object.entries(score.multiMeasureRests).map(([part, groups]) => [
              part,
              Object.fromEntries(
                Object.entries(groups).flatMap(([key, count]) => {
                  const start = Number(key);
                  if (
                    bar >= start &&
                    bar < start + count &&
                    !(action === 'insert' && bar === start)
                  )
                    return [];
                  return [[start >= bar ? start + (action === 'insert' ? 1 : -1) : start, count]];
                }),
              ),
            ]),
          ),
        }
      : {}),
  });
}

export function scoreMeasureEntry(score: Score, part: string, bar: number) {
  const fragments = scoreMeasures(score, part)[bar] ?? [];
  const blank = fragments.find((fragment) => fragment.note.blank);
  const offset =
    blank?.offset ?? fragments.reduce((sum, fragment) => scoreBeat(sum + fragment.beats), 0);
  return {
    id: blank?.note.id ?? null,
    offset,
    beat: scoreBeat(scoreMeasureStart(score, part, bar) + offset),
  };
}

// Blank input uses existing empty time; duration edits move following notes within their bar.
export function setScoreDuration(
  score: Score,
  id: string,
  beats: number,
  makeId: () => string,
  offset = 0,
): Score {
  const current = score.notes.find((item) => item.id === id);
  if (!current) return score;
  if (!Number.isFinite(beats) || beats < MIN_SCORE_BEATS || beats > 6 || !isScoreBeat(beats))
    throw new Error('지원하는 음표 길이 또는 셋잇단음표 길이로 입력해주세요.');
  if (current.graceBeats !== undefined)
    return {
      ...score,
      notes: score.notes.map((n) => (n.id === id ? { ...n, graceBeats: beats } : n)),
    };
  if (!isScoreBeat(offset) || offset < 0 || offset >= current.beats || (offset && !current.blank))
    throw new Error('입력 위치를 확인해주세요.');
  beats = scoreBeat(beats);
  offset = scoreBeat(offset);
  if (!current.blank) {
    const notes = score.notes.map((note) => (note.id === id ? { ...note, beats } : note));
    return resizeDurationMeasure(
      score,
      retimeScore(score, notes, [current.part]),
      current,
      scoreBeat(beats - current.beats),
    );
  }
  const blank = (length: number): ScoreNote => ({
    ...current,
    id: makeId(),
    beats: length,
    blank: true,
    rest: true,
    tones: [],
    chord: '',
    lyric: '',
    accent: false,
    staccato: false,
    ghost: false,
    dead: false,
  });
  const part = score.notes.filter((item) => item.part === current.part);
  const consumed = new Set<string>();
  let remaining = scoreBeat(beats - (current.beats - offset));
  let tail: ScoreNote | undefined;
  for (let i = part.indexOf(current) + 1; remaining > 0 && i < part.length; i++) {
    const next = part[i];
    if (!next.blank) break;
    consumed.add(next.id);
    remaining = scoreBeat(remaining - next.beats);
    if (remaining < 0) tail = { ...next, beats: -remaining };
  }
  const replacement = [
    ...(offset ? [blank(offset)] : []),
    { ...current, beats },
    ...(beats < current.beats - offset ? [blank(scoreBeat(current.beats - offset - beats))] : []),
    ...(tail ? [tail] : []),
  ];
  const notes = score.notes.flatMap((item) =>
    item.id === id ? replacement : consumed.has(item.id) ? [] : [item],
  );
  if (notes.length > 2000) throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  // A trimmed blank starts later; its previous audio anchor no longer applies.
  if (offset) consumed.add(id);
  const result = {
    ...score,
    notes,
    sync: Object.fromEntries(Object.entries(score.sync).filter(([key]) => !consumed.has(key))),
  };
  return remaining > 0
    ? resizeDurationMeasure(score, retimeScore(score, notes, [current.part]), current, remaining)
    : result;
}
export const pitchName = (pitch: number) =>
  ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] +
  (Math.floor(pitch / 12) - 1);

// Accidentals last for the same staff position through the current measure.
export function scoreKeyAlter(step: string, fifths = 0) {
  const order = fifths < 0 ? 'BEADGCF' : 'FCGDAEB';
  return order.slice(0, Math.abs(fifths)).includes(step) ? Math.sign(fifths) : 0;
}
export function spellScorePitch(pitch: number, fifths = 0) {
  const names = 'CDEFGAB',
    semitones = [0, 2, 4, 5, 7, 9, 11];
  let best = { step: 'C', octave: 4, alter: 0, position: 0 },
    cost = Infinity;
  for (let octave = Math.floor(pitch / 12) - 2; octave <= Math.floor(pitch / 12); octave++) {
    names.split('').forEach((step, index) => {
      const alter = pitch - ((octave + 1) * 12 + semitones[index]);
      if (Math.abs(alter) > 1) return;
      const next =
        (alter === scoreKeyAlter(step, fifths) ? 0 : 4) +
        Math.abs(alter) +
        (alter && Math.sign(alter) !== (fifths < 0 ? -1 : 1) ? 2 : 0);
      if (next < cost) {
        best = { step, octave, alter, position: (octave - 4) * 7 + index - 2 };
        cost = next;
      }
    });
  }
  return best;
}
export function validNaturalPitch(pitch: number, naturalPitch: unknown): naturalPitch is number {
  return (
    typeof naturalPitch === 'number' &&
    Number.isInteger(naturalPitch) &&
    naturalPitch >= 0 &&
    naturalPitch <= 127 &&
    [0, 2, 4, 5, 7, 9, 11].includes(naturalPitch % 12) &&
    Math.abs(pitch - naturalPitch) <= 1
  );
}

export function spellScoreTone(tone: ScoreTone, fifths = 0) {
  return tone.naturalPitch === undefined
    ? spellScorePitch(tone.pitch, fifths)
    : { ...spellScorePitch(tone.naturalPitch), alter: tone.pitch - tone.naturalPitch };
}

export function scoreNaturalPitch(tone: ScoreTone, fifths = 0) {
  return tone.pitch - spellScoreTone(tone, fifths).alter;
}

export function scoreKeyboardInputAlters(naturalPitch: number, fifths = 0) {
  const base = scoreKeyAlter(spellScorePitch(naturalPitch).step, fifths);
  return [base, base === 0 ? 1 : 0] as const;
}

export function nextScoreNaturalPitch(pitch: number, direction: number) {
  let next = pitch + direction;
  while (![0, 2, 4, 5, 7, 9, 11].includes((next + 120) % 12)) next += direction;
  return Math.max(24, Math.min(96, next));
}

// Prefer the chosen alteration, then another tone on this staff position. Only an
// empty position clears the entire chord; removing a tone never closes time.
export function deleteScorePitch(score: Score, id: string, naturalPitch: number, alter = 0): Score {
  const note = score.notes.find((n) => n.id === id);
  if (!note || note.rest || note.blank) return deleteScorePosition(score, id);
  const tones = noteTones(note);
  let index = tones.findIndex(
    (tone) =>
      scoreNaturalPitch(tone, score.keySignature) === naturalPitch &&
      tone.pitch === naturalPitch + alter,
  );
  if (index < 0)
    index = tones.findIndex((tone) => scoreNaturalPitch(tone, score.keySignature) === naturalPitch);
  if (index < 0 || tones.length === 1) return deleteScorePosition(score, id);
  const remaining = tones.filter((_, i) => i !== index);
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((n) =>
      n.id === id ? { ...n, pitch: remaining[0].pitch, tones: remaining } : n,
    ),
  });
}

export function scoreAccidentalMarks(fragments: ScoreFragment[], fifths = 0) {
  const accidentals = new Map<number, number>();
  return fragments.map(({ note, continued }) => {
    const tones = noteTones(note);
    const spellings = tones.map((tone) => spellScoreTone(tone, fifths));
    const alterations = new Map<number, Set<number>>();
    spellings.forEach(({ position, alter }, i) => {
      if (tones[i].dead) return;
      if (!alterations.has(position)) alterations.set(position, new Set());
      alterations.get(position)!.add(alter);
    });
    const marks = tones.map((tone, i) => {
      if (tone.dead || note.rest || note.blank) return '';
      const spelling = spellings[i];
      const previous = accidentals.get(spelling.position) ?? scoreKeyAlter(spelling.step, fifths);
      return continued ||
        (alterations.get(spelling.position)!.size === 1 && spelling.alter === previous)
        ? ''
        : spelling.alter > 0
          ? '♯'
          : spelling.alter < 0
            ? '♭'
            : '♮';
    });
    alterations.forEach((values, position) =>
      accidentals.set(position, values.size > 1 ? NaN : [...values][0]),
    );
    return marks;
  });
}

export function setScoreDotted(score: Score, ids: string[], enabled: boolean): Score {
  let result = score;
  for (const note of score.notes.filter((note) => ids.includes(note.id) && !note.blank).reverse()) {
    const written = writtenScoreBeats(note, note.beats);
    const base = DOTTED_SCORE_BEATS.includes(written) ? written / 1.5 : written;
    if (![4, 2, 1, 0.5, 0.25, 0.125].includes(base))
      throw new Error('점음표는 온음표부터 32분음표까지 적용할 수 있어요.');
    result = setScoreDuration(
      result,
      note.id,
      scoreBeat((enabled ? base * 1.5 : base) * (note.tuplet ? 2 / 3 : 1)),
      () => crypto.randomUUID(),
    );
  }
  return result;
}

export function scoreTupletGroups(notes: ScoreNote[]): ScoreNote[][] {
  const groups: ScoreNote[][] = [];
  let group: ScoreNote[] = [];
  for (const note of notes) {
    if (!note.tuplet || note.blank || (group.length && note.beats !== group[0].beats)) {
      if (group.length) groups.push(group);
      group = [];
    }
    if (note.tuplet && !note.blank) group.push(note);
    if (group.length === 3) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  return groups;
}

export function setScoreTriplet(score: Score, ids: string[], enabled: boolean): Score {
  const first = score.notes.find((note) => note.id === ids[0]);
  if (!first) throw new Error('셋잇단음표로 묶을 음표를 선택해주세요.');
  const rows = score.notes.filter((note) => note.part === first.part);
  const start = rows.indexOf(first);
  const selected =
    ids.length === 1 ? rows.slice(start, start + 3) : rows.filter((note) => ids.includes(note.id));
  if (
    selected.length !== 3 ||
    selected.some(
      (note, i) =>
        note !== rows[start + i] ||
        note.blank ||
        note.beats !== first.beats ||
        note.tuplet !== first.tuplet,
    )
  )
    throw new Error('같은 길이의 이어지는 세 음표 또는 쉼표를 선택해주세요.');
  const written = writtenScoreBeats(first, first.beats);
  if (![4, 2, 1, 0.5, 0.25, 0.125, 0.0625].includes(written))
    throw new Error('점이 없는 온음표부터 64분음표까지 셋잇단음표로 묶을 수 있어요.');
  const beats = scoreBeat(written * (enabled ? 2 / 3 : 1));
  let result = score;
  for (const note of [...selected].reverse()) {
    result = setScoreDuration(result, note.id, beats, () => crypto.randomUUID());
    result = {
      ...result,
      notes: result.notes.map((item) =>
        item.id === note.id ? { ...item, tuplet: enabled ? 3 : undefined } : item,
      ),
    };
  }
  return result;
}

function renamePartMap<T>(
  map: Record<string, T> | undefined,
  previous: string | null,
  name: string,
) {
  if (!map) return undefined;
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key === previous ? name : key, value]),
  );
}
export function renameScorePart(score: Score, previous: string | null, input: string): Score {
  const name = input.trim();
  if (!name || name.length > 40) throw new Error('파트 이름은 1~40자로 입력해주세요.');
  if (score.parts.some((part) => part === name && part !== previous))
    throw new Error('이미 같은 이름의 파트가 있어요.');
  if (previous !== null && !score.parts.includes(previous))
    throw new Error('파트를 찾을 수 없어요.');
  if (previous === null && score.parts.length >= 16)
    throw new Error('파트는 최대 16개까지 추가할 수 있어요.');
  return {
    ...score,
    parts:
      previous === null
        ? [...score.parts, name]
        : score.parts.map((part) => (part === previous ? name : part)),
    notes: score.notes.map((note) => (note.part === previous ? { ...note, part: name } : note)),
    measureChords: {
      ...Object.fromEntries(
        Object.entries(score.measureChords ?? {}).filter(([key]) => key !== previous),
      ),
      ...(previous && score.measureChords?.[previous]
        ? { [name]: score.measureChords[previous] }
        : {}),
    },
    beatChords: {
      ...Object.fromEntries(
        Object.entries(score.beatChords ?? {}).filter(([key]) => key !== previous),
      ),
      ...(previous && score.beatChords?.[previous] ? { [name]: score.beatChords[previous] } : {}),
    },
    instruments: {
      ...Object.fromEntries(
        Object.entries(score.instruments ?? {}).filter(([key]) => key !== previous),
      ),
      [name]: previous ? scoreInstrument(score, previous).id : 'guitar',
    },
    playbackInstruments: {
      ...Object.fromEntries(
        Object.entries(score.playbackInstruments ?? {}).filter(([key]) => key !== previous),
      ),
      ...(previous && score.playbackInstruments?.[previous]
        ? { [name]: score.playbackInstruments[previous] }
        : {}),
    },
    measureLengths: renamePartMap(score.measureLengths, previous, name),
    keyboardStaves: Object.fromEntries(
      Object.entries(score.keyboardStaves ?? {}).map(([right, left]) => [
        right === previous ? name : right,
        left === previous ? name : left,
      ]),
    ),
    drumVoices: Object.fromEntries(
      Object.entries(score.drumVoices ?? {}).map(([upper, lower]) => [
        upper === previous ? name : upper,
        lower === previous ? name : lower,
      ]),
    ),
    partMix: renamePartMap(score.partMix, previous, name),
    capos: renamePartMap(score.capos, previous, name),
    multiMeasureRests: renamePartMap(score.multiMeasureRests, previous, name),
    directions: renamePartMap(score.directions, previous, name),
    guitarToneChanges: renamePartMap(score.guitarToneChanges, previous, name),
    measureWidths: renamePartMap(score.measureWidths, previous, name),
    equalWidthRows: {
      ...Object.fromEntries(
        Object.entries(score.equalWidthRows ?? {}).filter(([key]) => key !== previous),
      ),
      ...(previous && score.equalWidthRows?.[previous]
        ? { [name]: score.equalWidthRows[previous] }
        : {}),
    },
    systemLayout: {
      ...Object.fromEntries(
        Object.entries(score.systemLayout ?? {}).filter(([key]) => key !== previous),
      ),
      ...(previous && score.systemLayout?.[previous]
        ? { [name]: score.systemLayout[previous] }
        : {}),
    },
  };
}

export function removeScoreNotes(score: Score, ids: string[]): Score {
  const removed = new Set(ids);
  if (Object.keys(score.measureLengths ?? {}).length) {
    let result = score;
    for (const note of score.notes.filter((note) => removed.has(note.id)).reverse()) {
      const next = retimeScore(
        result,
        result.notes.filter((item) => item.id !== note.id),
        [note.part],
      );
      result = resizeDurationMeasure(result, next, note, -note.beats);
    }
    return result;
  }
  return retimeScore(
    score,
    score.notes.filter((note) => !removed.has(note.id)),
    [...new Set(score.notes.filter((note) => removed.has(note.id)).map((note) => note.part))],
  );
}

// Structural edits move annotations with their original rhythmic slot. Audio anchors
// are absolute times, so invalidate anchors whose note has moved rather than guessing.
function retimeScore(
  score: Score,
  notes: ScoreNote[],
  parts: string[],
  mapBeat?: (beat: number) => number | null,
): Score {
  const sync = { ...score.sync };
  const measureChords = { ...score.measureChords };
  const beatChords = { ...score.beatChords };
  const guitarToneChanges = { ...score.guitarToneChanges };
  for (const part of parts) {
    let oldEnd = 0,
      newEnd = 0;
    const old = score.notes
      .filter((note) => note.part === part)
      .map((note) => {
        const start = oldEnd;
        oldEnd = scoreBeat(oldEnd + note.beats);
        return { note, start, end: oldEnd };
      });
    const starts = new Map(
      notes
        .filter((note) => note.part === part)
        .map((note) => {
          const start = newEnd;
          newEnd = scoreBeat(newEnd + note.beats);
          return [note.id, start] as const;
        }),
    );
    for (const { note, start } of old) if (starts.get(note.id) !== start) delete sync[note.id];
    const fixed: Record<number, string> = Object.fromEntries(
      Object.entries(score.measureChords?.[part] ?? {}).map(([bar, chord]) => [
        scoreMeasureStart(score, part, Number(bar)),
        chord,
      ]),
    );
    Object.assign(fixed, score.beatChords?.[part]);
    const moved: Record<number, string> = {};
    for (const [position, chord] of Object.entries(fixed)) {
      const beat = Number(position);
      const slot = old.find(({ start, end }) => beat >= start && beat < end);
      const start = slot ? starts.get(slot.note.id) : undefined;
      const next = mapBeat
        ? mapBeat(beat)
        : slot
          ? start === undefined
            ? null
            : start + beat - slot.start
          : beat + newEnd - oldEnd;
      if (next !== null) moved[scoreBeat(next)] = chord;
    }
    measureChords[part] = {};
    beatChords[part] = moved;
    if (score.guitarToneChanges?.[part]) {
      const changes: Record<number, GuitarTone> = {};
      for (const [position, tone] of Object.entries(score.guitarToneChanges[part])) {
        const beat = +position,
          slot = old.find(({ start, end }) => beat >= start && beat < end);
        const start = slot ? starts.get(slot.note.id) : undefined;
        const next = mapBeat
          ? mapBeat(beat)
          : slot
            ? start === undefined
              ? null
              : start + beat - slot.start
            : beat + newEnd - oldEnd;
        if (next !== null && next >= 0) changes[scoreBeat(next)] = tone;
      }
      guitarToneChanges[part] = changes;
    }
  }
  return cleanScoreConnections({
    ...score,
    notes,
    sync,
    measureChords,
    beatChords,
    ...(score.guitarToneChanges ? { guitarToneChanges } : {}),
  });
}

export function setScoreArticulation(
  score: Score,
  ids: string[],
  key: 'accent' | 'staccato' | 'ghost' | 'dead',
): Score {
  const chosen = new Set(ids);
  const targets = score.notes.filter((note) => chosen.has(note.id) && !note.rest && !note.blank);
  if (!targets.length) return score;
  const enabled = !targets.every((note) => note[key]);
  return {
    ...score,
    notes: score.notes.map((note) =>
      targets.includes(note)
        ? {
            ...note,
            [key]: enabled,
            ...(key === 'dead' ? { ghost: false } : key === 'ghost' ? { dead: false } : {}),
            ...(key === 'dead' || key === 'ghost'
              ? {
                  tones: noteTones(note).map((tone) => ({
                    ...tone,
                    [key]: enabled,
                    [key === 'dead' ? 'ghost' : 'dead']: false,
                  })),
                }
              : {}),
          }
        : note,
    ),
  };
}

// For TAB the target is a string; for a staff-only part it is the 1-based tone index.
export function selectedScoreTone(score: Score, note: ScoreNote, selected: number) {
  if (scoreInstrument(score, note.part).id === 'drums')
    return noteTones(note).find((tone) => tone.pitch === drumAtRow(selected).pitch);
  const tuning = scoreInstrument(score, note.part).tuning;
  return tuning.length
    ? tabTones(note, tuning).find((tone) => tone.string === selected)
    : noteTones(note)[selected - 1];
}

export function setScoreToneArticulation(
  score: Score,
  ids: string[],
  selected: number,
  key: 'ghost' | 'dead',
): Score {
  const targets = score.notes.filter(
    (note) =>
      ids.includes(note.id) &&
      !note.blank &&
      !note.rest &&
      selectedScoreTone(score, note, selected),
  );
  if (!targets.length) return score;
  const enabled = !targets.every((note) => selectedScoreTone(score, note, selected)?.[key]);
  return cleanScoreConnections({
    ...score,
    notes: score.notes.map((note) => {
      if (!targets.includes(note)) return note;
      const tuning = scoreInstrument(score, note.part).tuning;
      const tones = tuning.length ? tabTones(note, tuning) : noteTones(note);
      return {
        ...note,
        ghost: false,
        dead: false,
        tones: tones.map((tone, index) =>
          (
            scoreInstrument(score, note.part).id === 'drums'
              ? tone.pitch === drumAtRow(selected).pitch
              : tuning.length
                ? tone.string === selected
                : index === selected - 1
          )
            ? { ...tone, [key]: enabled, [key === 'dead' ? 'ghost' : 'dead']: false }
            : tone,
        ),
      };
    }),
  });
}

export function setScoreDurations(
  score: Score,
  ids: string[],
  beats: number,
  makeId: () => string,
): Score {
  const chosen = new Set(ids);
  // Work from right to left so every selected note keeps its original identity.
  return score.notes
    .filter((note) => chosen.has(note.id) && !note.blank)
    .reverse()
    .reduce(
      (next, note) =>
        note.beats === beats ? next : setScoreDuration(next, note.id, beats, makeId),
      score,
    );
}

export function removeScorePart(score: Score, part: string): Score {
  if (score.parts.length <= 1) throw new Error('최소 한 개의 파트가 필요해요.');
  return {
    ...removeScoreNotes(
      score,
      score.notes.filter((note) => note.part === part).map((note) => note.id),
    ),
    parts: score.parts.filter((name) => name !== part),
    capos: Object.fromEntries(Object.entries(score.capos ?? {}).filter(([name]) => name !== part)),
    keyboardStaves: Object.fromEntries(
      Object.entries(score.keyboardStaves ?? {}).filter(
        ([right, left]) => right !== part && left !== part,
      ),
    ),
    drumVoices: Object.fromEntries(
      Object.entries(score.drumVoices ?? {}).filter(
        ([upper, lower]) => upper !== part && lower !== part,
      ),
    ),
    partMix: Object.fromEntries(
      Object.entries(score.partMix ?? {}).filter(([key]) => key !== part),
    ),
    measureChords: Object.fromEntries(
      Object.entries(score.measureChords ?? {}).filter(([key]) => key !== part),
    ),
    beatChords: Object.fromEntries(
      Object.entries(score.beatChords ?? {}).filter(([key]) => key !== part),
    ),
    instruments: Object.fromEntries(
      Object.entries(score.instruments ?? {}).filter(([key]) => key !== part),
    ),
    playbackInstruments: Object.fromEntries(
      Object.entries(score.playbackInstruments ?? {}).filter(([key]) => key !== part),
    ),
    systemLayout: Object.fromEntries(
      Object.entries(score.systemLayout ?? {}).filter(([key]) => key !== part),
    ),
    measureLengths: Object.fromEntries(
      Object.entries(score.measureLengths ?? {}).filter(([key]) => key !== part),
    ),
    measureWidths: Object.fromEntries(
      Object.entries(score.measureWidths ?? {}).filter(([key]) => key !== part),
    ),
    directions: Object.fromEntries(
      Object.entries(score.directions ?? {}).filter(([key]) => key !== part),
    ),
    guitarToneChanges: Object.fromEntries(
      Object.entries(score.guitarToneChanges ?? {}).filter(([key]) => key !== part),
    ),
    multiMeasureRests: Object.fromEntries(
      Object.entries(score.multiMeasureRests ?? {}).filter(([key]) => key !== part),
    ),
    equalWidthRows: Object.fromEntries(
      Object.entries(score.equalWidthRows ?? {}).filter(([key]) => key !== part),
    ),
  };
}

export function insertScoreNote(score: Score, note: ScoreNote, after?: string | null): Score {
  if (score.notes.length >= 2000) throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  const index = after
    ? score.notes.findIndex((item) => item.id === after && item.part === note.part)
    : -1;
  const notes = [...score.notes];
  notes.splice(index < 0 ? notes.length : index + 1, 0, note);
  const next = retimeScore(score, notes, [note.part]);
  const anchor = index >= 0 ? score.notes[index] : undefined;
  return anchor && score.measureLengths?.[note.part]
    ? resizeDurationMeasure(score, next, anchor, note.beats)
    : next;
}

// Empty editor beats occupy time without displaying a rest. Export treats them as silence.
export function appendScoreNoteAt(
  score: Score,
  note: ScoreNote,
  beat: number,
  makeId: () => string,
): Score {
  const end = score.notes
    .filter((item) => item.part === note.part)
    .reduce((sum, item) => scoreBeat(sum + item.beats), 0);
  if (!Number.isFinite(beat) || beat < end || !isScoreBeat(beat) || beat - end > 64)
    throw new Error('입력 위치를 확인해주세요.');
  beat = scoreBeat(beat);
  const additions: ScoreNote[] = [];
  for (let at = end; at < beat;) {
    const beats = scoreBeat(Math.min(1, note.beats, beat - at));
    if (beats <= 0 || !isScoreBeat(beats)) throw new Error('음표 길이를 확인해주세요.');
    additions.push({
      ...note,
      id: makeId(),
      beats,
      rest: true,
      blank: true,
      tones: [],
      chord: '',
      lyric: '',
      accent: false,
      staccato: false,
      ghost: false,
      dead: false,
    });
    at = scoreBeat(at + beats);
  }
  if (score.notes.length + additions.length + 1 > 2000)
    throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  return { ...score, notes: [...score.notes, ...additions, note] };
}

// Fill the missing tail of a shortened measure without borrowing the next bar's notes.
export function appendScoreMeasureNote(
  score: Score,
  note: ScoreNote,
  bar: number,
  offset: number,
  makeId: () => string,
): Score {
  const start = scoreMeasureStart(score, note.part, bar);
  const duration = scoreMeasureDuration(score, note.part, bar);
  if (offset < duration || duration >= scoreBarBeats(score))
    return appendScoreNoteAt(score, note, scoreBeat(start + offset), makeId);
  if (!isScoreBeat(offset) || offset < 0 || offset > 64)
    throw new Error('입력 위치를 확인해주세요.');
  const rows = score.notes.filter((item) => item.part === note.part);
  let at = 0;
  const following = rows.find((item) => {
    const here = at;
    at = scoreBeat(at + item.beats);
    return here >= scoreBeat(start + duration);
  });
  const additions = appendScoreNoteAt(
    { ...score, notes: [] },
    note,
    scoreBeat(offset - duration),
    makeId,
  ).notes;
  if (score.notes.length + additions.length > 2000)
    throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  const notes = [...score.notes];
  notes.splice(following ? notes.indexOf(following) : notes.length, 0, ...additions);
  const next = retimeScore(score, notes, [note.part]);
  return {
    ...next,
    measureLengths: {
      ...next.measureLengths,
      [note.part]: { ...next.measureLengths?.[note.part], [bar]: scoreBeat(offset + note.beats) },
    },
  };
}

export function moveScoreNote(score: Score, id: string, direction: -1 | 1): Score {
  const current = score.notes.find((note) => note.id === id);
  if (!current) return score;
  const part = score.notes.filter((note) => note.part === current.part);
  const other = part[part.indexOf(current) + direction];
  if (!other) return score;
  const notes = [...score.notes];
  const from = notes.indexOf(current);
  const to = notes.indexOf(other);
  [notes[from], notes[to]] = [notes[to], notes[from]];
  return retimeScore(score, notes, [current.part]);
}

// Insert a copied passage without overwriting notes or reusing their audio anchors.
export function readScoreClipboard(text: string): ScoreClipboardNote[] | null {
  if (text.length > 2_000_000) return null;
  try {
    const value = JSON.parse(text);
    if (
      value?.type !== 'moajam-score' ||
      value.version !== 1 ||
      !Array.isArray(value.notes) ||
      !value.notes.length ||
      value.notes.length > 2000
    )
      return null;
    const integer = (n: unknown, min: number, max: number) =>
      typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
    for (const note of value.notes) {
      if (
        note?.copiedGuitarTones !== undefined &&
        (!Array.isArray(note.copiedGuitarTones) ||
          note.copiedGuitarTones.length > 1024 ||
          note.copiedGuitarTones.some(
            (change: { offset: number; tone: string }) =>
              !change ||
              !Number.isFinite(change.offset) ||
              change.offset < 0 ||
              change.offset >= note.beats ||
              !isScoreBeat(change.offset) ||
              !Object.hasOwn(guitarToneLabels, change.tone),
          ))
      )
        return null;
      if (note?.graceBeats !== undefined && (note.beats !== 0 || note.rest || note.blank))
        return null;
      if (
        note?.copiedConnection !== undefined &&
        !Object.hasOwn(scoreConnectionLabels, note.copiedConnection)
      )
        return null;
      if (
        note?.copiedChords !== undefined &&
        (!Array.isArray(note.copiedChords) ||
          note.copiedChords.length > 1024 ||
          note.copiedChords.some(
            (change: { offset: number; chord: string }) =>
              !change ||
              !Number.isFinite(change.offset) ||
              change.offset < 0 ||
              change.offset >= note.beats ||
              !isScoreBeat(change.offset) ||
              typeof change.chord !== 'string' ||
              change.chord.length > 40,
          ))
      )
        return null;
      if (
        !note ||
        !integer(note.pitch, 0, 127) ||
        typeof note.beats !== 'number' ||
        !Number.isFinite(note.beats) ||
        (note.beats <= 0 && !(note.beats === 0 && (note.graceBeats ?? 0) > 0)) ||
        note.beats > 64 ||
        !isScoreBeat(note.beats) ||
        (note.tuplet !== undefined && note.tuplet !== 3) ||
        (note.slideOut !== undefined && note.slideOut !== 'up' && note.slideOut !== 'down') ||
        (note.slideIn !== undefined && note.slideIn !== 'up' && note.slideIn !== 'down') ||
        typeof note.rest !== 'boolean' ||
        typeof note.accent !== 'boolean' ||
        typeof note.chord !== 'string' ||
        note.chord.length > 1000 ||
        typeof note.lyric !== 'string' ||
        note.lyric.length > 10000 ||
        ['blank', 'ghost', 'dead', 'staccato'].some(
          (key) => note[key] !== undefined && typeof note[key] !== 'boolean',
        )
      )
        return null;
      if (
        note.tones !== undefined &&
        (!Array.isArray(note.tones) ||
          note.tones.length > 16 ||
          note.tones.some(
            (tone: ScoreTone) =>
              !tone ||
              !integer(tone.pitch, 0, 127) ||
              (tone.naturalPitch !== undefined &&
                !validNaturalPitch(tone.pitch, tone.naturalPitch)) ||
              (tone.string !== undefined && !integer(tone.string, 1, 6)) ||
              (tone.fret !== undefined && !integer(tone.fret, 0, 24)) ||
              (tone.ghost !== undefined && typeof tone.ghost !== 'boolean') ||
              (tone.dead !== undefined && typeof tone.dead !== 'boolean') ||
              (tone.drumTechnique !== undefined &&
                !validDrumTechnique(tone.pitch, tone.drumTechnique)),
          ))
      )
        return null;
    }
    return value.notes.map((note: ScoreClipboardNote) => ({
      id: typeof note.id === 'string' ? note.id.slice(0, 200) : '',
      tuplet: note.tuplet === 3 ? 3 : undefined,
      slurTo: typeof note.slurTo === 'string' ? note.slurTo.slice(0, 200) : undefined,
      slideOut: note.slideOut,
      slideIn: note.slideIn,
      part: '',
      pitch: note.pitch,
      beats: note.beats,
      rest: note.rest,
      chord: note.chord,
      lyric: note.lyric,
      accent: note.accent,
      ...readNoteExpression(note),
      copiedConnection: note.copiedConnection,
      copiedGuitarTones: note.copiedGuitarTones?.map((change) => ({ ...change })),
      blank: note.blank,
      ghost: note.ghost,
      dead: note.dead,
      staccato: note.staccato,
      tones: note.tones?.map(
        ({ pitch, naturalPitch, string, fret, ghost, dead, drumTechnique }) => ({
          pitch,
          ...(naturalPitch === undefined ? {} : { naturalPitch }),
          string,
          fret,
          ghost,
          dead,
          drumTechnique,
        }),
      ),
      copiedChords: note.copiedChords?.map(({ offset, chord }) => ({ offset, chord })),
    }));
  } catch {
    return null;
  }
}

export function pasteScoreNotes(
  score: Score,
  part: string,
  copied: ScoreClipboardNote[],
  beat: number,
  makeId: () => string,
): { score: Score; ids: string[] } {
  if (
    !score.parts.includes(part) ||
    !copied.length ||
    !Number.isFinite(beat) ||
    beat < 0 ||
    !isScoreBeat(beat) ||
    copied.some(
      (note) =>
        !Number.isFinite(note.beats) ||
        (note.beats <= 0 && !(note.beats === 0 && (note.graceBeats ?? 0) > 0)) ||
        note.beats > 64 ||
        !isScoreBeat(note.beats),
    )
  )
    throw new Error('붙여넣을 위치와 음표 길이를 확인해주세요.');
  beat = scoreBeat(beat);
  const insertedChords: Record<number, string> = {};
  const insertedGuitarTones: Record<number, GuitarTone> = {};
  let copiedAt = beat;
  const additions: ScoreNote[] = copied.map(
    ({ copiedChords, copiedConnection, copiedGuitarTones, ...note }) => {
      for (const change of copiedGuitarTones ?? [])
        insertedGuitarTones[scoreBeat(copiedAt + change.offset)] = change.tone;
      for (const change of copiedChords ?? [])
        insertedChords[scoreBeat(copiedAt + change.offset)] = change.chord;
      copiedAt = scoreBeat(copiedAt + note.beats);
      return {
        ...note,
        connection: copiedConnection ? { type: copiedConnection, targetId: '' } : undefined,
        part,
        id: makeId(),
        tones: note.tones?.map((tone) => ({ ...tone })),
      };
    },
  );
  additions.forEach((note, i) => {
    const target = copied.findIndex((item) => item.id === copied[i].slurTo);
    note.slurTo = target > i ? additions[target].id : undefined;
    const type = copied[i].copiedConnection;
    if (type && additions[i + 1]) note.connection = { type, targetId: additions[i + 1].id };
  });
  const notes: ScoreNote[] = [];
  const sync = { ...score.sync };
  let at = 0,
    inserted = false;
  for (const note of score.notes) {
    if (note.part !== part) {
      notes.push(note);
      continue;
    }
    if (!inserted && beat === at) {
      notes.push(...additions);
      inserted = true;
    }
    if (!inserted && beat > at && beat < at + note.beats) {
      if (!note.blank) throw new Error('음표 시작이나 빈 박을 선택해 붙여넣어주세요.');
      notes.push({ ...note, beats: scoreBeat(beat - at) }, ...additions, {
        ...note,
        id: makeId(),
        beats: scoreBeat(at + note.beats - beat),
      });
      inserted = true;
    } else notes.push(note);
    if (inserted) delete sync[note.id];
    at = scoreBeat(at + note.beats);
  }
  let next = { ...score, notes, sync };
  if (!inserted) {
    next = appendScoreNoteAt(next, additions[0], beat, makeId);
    next = { ...next, notes: [...next.notes, ...additions.slice(1)] };
  }
  if (next.notes.length > 2000) throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  const retimed = retimeScore(score, next.notes, [part], (position) =>
    position >= beat ? position + copiedAt - beat : position,
  );
  next = {
    ...retimed,
    sync: next.sync,
    ...(Object.keys(insertedGuitarTones).length
      ? {
          guitarToneChanges: {
            ...retimed.guitarToneChanges,
            [part]: { ...retimed.guitarToneChanges?.[part], ...insertedGuitarTones },
          },
        }
      : {}),
    beatChords: {
      ...retimed.beatChords,
      [part]: { ...retimed.beatChords?.[part], ...insertedChords },
    },
  };
  return { score: next, ids: additions.map((note) => note.id) };
}

export type ScoreFragment = {
  note: ScoreNote;
  beats: number;
  offset: number;
  continued: boolean;
  continues: boolean;
};

export function scoreSystemRows(
  score: Score,
  part: string,
  count: number,
): { start: number; count: number; capacity: number }[] {
  const rows: { start: number; count: number; capacity: number }[] = [];
  for (let start = 0; start < Math.max(1, count);) {
    const requested = score.systemLayout?.[part]?.[rows.length] ?? 4;
    const capacity =
      Number.isInteger(requested) && requested >= 1 && requested <= 16 ? requested : 4;
    const size = Math.min(capacity, Math.max(1, count) - start);
    rows.push({ start, count: size, capacity });
    start = scoreBeat(start + size);
  }
  return rows;
}

// Keep boundaries before the moved measure, then reflow the remaining measures
// using the default row capacity. Note order and beat positions never change.
export function moveScoreMeasureToRow(
  score: Score,
  part: string,
  measure: number,
  direction: -1 | 1,
  count: number,
  rows = scoreSystemRows(score, part, count),
): Score {
  const index = rows.findIndex((row) => measure >= row.start && measure < row.start + row.count);
  if (index < 0) return score;
  const row = rows[index],
    offset = measure - row.start;
  const capacities = rows.slice(0, index).map((item) => item.capacity);
  if (direction === 1) {
    if (offset === 0) return score;
    capacities.push(offset);
  } else {
    if (index === 0 || capacities[index - 1] + offset + 1 > 16) return score;
    capacities[index - 1] += offset + 1;
  }
  // Expanded long multi-measure rests may span more than one ordinary row.
  const bounded = capacities.flatMap((capacity) =>
    Array.from({ length: Math.ceil(capacity / 16) }, (_, index) =>
      Math.min(16, capacity - index * 16),
    ),
  );
  return { ...score, systemLayout: { ...score.systemLayout, [part]: bounded } };
}

export function scorePlaybackBeats(score: Score, part: string): number {
  const total = score.notes
    .filter((note) => note.part === part)
    .reduce((sum, note) => scoreBeat(sum + note.beats), 0);
  return total
    ? scoreMeasureStart(
        score,
        part,
        Math.max(
          scoreMeasureAtBeat(score, part, total - MIN_SCORE_BEATS).bar + 1,
          ...Object.keys(score.repeats ?? {}).map((bar) => Number(bar) + 1),
        ),
      )
    : 0;
}

// An explicit end plays just the selected written interval once, ignoring repeat
// barlines. The playback clock repeats that interval without escaping its bounds.
export function scorePlaybackFrom(score: Score, part: string, from = 0, to?: number) {
  const performance = scorePerformance(score, part);
  score = performance.score;
  from = performance.toPerformed(from);
  const totalBeats = scorePlaybackBeats(score, part);
  const lastBeat =
    to === undefined
      ? totalBeats
      : Math.max(0, Math.min(totalBeats, Number.isFinite(to) ? performance.toPerformed(to) : 0));
  const startBeat = Number.isFinite(from) ? Math.max(0, Math.min(lastBeat, from)) : 0;
  const events: { note: ScoreNote; offset: number; beats: number }[] = [];
  const segments: { startBeat: number; endBeat: number; offset: number }[] = [];
  const rows = scoreGracePerformance(score, part).notes.filter((note) => note.part === part);
  let elapsed = 0;
  const add = (start: number, end: number) => {
    if (end <= start) return;
    const previous = segments.at(-1);
    if (previous?.endBeat === start) previous.endBeat = end;
    else segments.push({ startBeat: start, endBeat: end, offset: elapsed });
    elapsed += end - start;
  };
  const lastBar = lastBeat ? scoreMeasureAtBeat(score, part, lastBeat - MIN_SCORE_BEATS).bar : -1;
  let bar = scoreMeasureAtBeat(score, part, startBeat).bar;
  let anchor = 0;
  // A selection inside a repeat still knows where that repeat starts.
  for (let index = 0; index < bar; index++) {
    if (score.repeats?.[index]?.start) anchor = index;
    if (score.repeats?.[index]?.end) anchor = index + 1;
  }
  const passes = new Map<number, number>();
  const jumps = new Set<number>();
  let repeatPass = 1,
    returnMode: 'fine' | 'coda' | 'none' | undefined;
  const segno = Object.entries(score.navigation ?? {}).find(([, n]) => n.segno)?.[0];
  const coda = Object.entries(score.navigation ?? {}).find(([, n]) => n.coda)?.[0];
  let first = true,
    visits = 0;
  if (to !== undefined) add(startBeat, lastBeat);
  while (to === undefined && bar <= lastBar && visits++ < 256000) {
    const marker = score.repeats?.[bar];
    if (marker?.start) {
      anchor = bar;
      if (!returnMode) {
        const end = Object.keys(score.repeats ?? {})
          .map(Number)
          .sort((a, b) => a - b)
          .find((index) => index >= bar && score.repeats?.[index]?.end);
        repeatPass = end === undefined ? 1 : (passes.get(end) ?? 1);
      }
    }
    const navigation = score.navigation?.[bar];
    const playEnding = !navigation?.ending || navigation.ending === repeatPass;
    const start = scoreMeasureStart(score, part, bar);
    if (playEnding)
      add(
        first ? Math.max(start, startBeat) : start,
        Math.min(lastBeat, start + scoreMeasureDuration(score, part, bar)),
      );
    first = false;
    if (playEnding && navigation?.fine && returnMode === 'fine') break;
    if (playEnding && navigation?.toCoda && returnMode === 'coda') {
      if (coda === undefined) throw new Error('To Coda의 도착 코다를 지정해주세요.');
      bar = Number(coda);
      returnMode = 'none';
      continue;
    }
    if (playEnding && navigation?.jump && !jumps.has(bar)) {
      const jump = navigation.jump;
      if (jump.startsWith('ds') && segno === undefined)
        throw new Error('D.S.의 도착 세뇨를 지정해주세요.');
      if (jump.endsWith('coda') && coda === undefined)
        throw new Error('코다 도착 지점을 지정해주세요.');
      jumps.add(bar);
      returnMode = jump.endsWith('fine') ? 'fine' : jump.endsWith('coda') ? 'coda' : 'none';
      bar = jump.startsWith('ds') ? Number(segno) : 0;
      repeatPass = 2;
      continue;
    }
    if (!returnMode && marker?.end && (passes.get(bar) ?? 1) < (marker.times ?? 2)) {
      passes.set(bar, (passes.get(bar) ?? 1) + 1);
      repeatPass = passes.get(bar)!;
      bar = Math.min(anchor, bar);
    } else {
      if (marker?.end) anchor = bar + 1;
      bar++;
    }
  }
  for (const segment of segments) {
    let at = 0;
    for (const note of rows) {
      const sum = at + note.beats;
      const end = Math.abs(sum - scoreBeat(sum)) < 1e-8 ? scoreBeat(sum) : sum;
      if (end > segment.startBeat && at < segment.endBeat) {
        const start = Math.max(at, segment.startBeat);
        events.push({
          note,
          offset: segment.offset + start - segment.startBeat,
          beats: Math.min(end, segment.endBeat) - start,
        });
      }
      at = end;
    }
  }
  return {
    startBeat,
    endBeat: startBeat + elapsed,
    events,
    segments,
    toWritten: performance.toWritten,
  };
}
export function scorePlaybackPosition(
  segments: { startBeat: number; endBeat: number; offset: number }[],
  elapsed: number,
) {
  const segment =
    segments.find((item) => elapsed < item.offset + item.endBeat - item.startBeat) ??
    segments.at(-1);
  return segment
    ? Math.min(
        segment.endBeat - MIN_SCORE_BEATS,
        segment.startBeat + Math.max(0, elapsed - segment.offset),
      )
    : 0;
}

export function scoreMeasurePosition(
  score: Score,
  part: string,
  beat: number,
  direction: -1 | 1,
): { id: string | null; beat: number } {
  const target = scoreMeasureStart(
    score,
    part,
    Math.max(0, scoreMeasureAtBeat(score, part, beat).bar + direction),
  );
  let at = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    if (target < at + note.beats) return { id: note.id, beat: target };
    at = scoreBeat(at + note.beats);
  }
  return { id: null, beat: target };
}
export function scoreMeasures(score: Score, part: string): ScoreFragment[][] {
  const measures: ScoreFragment[][] = [];
  let measure: ScoreFragment[] = [];
  let used = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    if (note.graceBeats !== undefined && note.beats === 0) {
      measure.push({ note, beats: 0, offset: used, continued: false, continues: false });
      continue;
    }
    if (
      !Number.isFinite(note.beats) ||
      (note.beats <= 0 && !(note.beats === 0 && (note.graceBeats ?? 0) > 0)) ||
      note.beats > 64 ||
      !isScoreBeat(note.beats)
    )
      throw new Error('음표 길이는 64분음표 단위로 입력해주세요.');
    let remaining = Math.round(note.beats * SCORE_DIVISIONS);
    let continued = false;
    while (remaining > 0) {
      const capacity = Math.round(
        scoreMeasureDuration(score, part, measures.length) * SCORE_DIVISIONS,
      );
      const usedTicks = Math.round(used * SCORE_DIVISIONS);
      const available = Math.min(capacity - usedTicks, remaining);
      const candidates = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125, 0.0625].map(
        (value) => Math.round(value * SCORE_DIVISIONS * (note.tuplet ? 2 / 3 : 1)),
      );
      const ticks = candidates.find((value) => value <= available) ?? available;
      const beats = ticks / SCORE_DIVISIONS;
      remaining -= ticks;
      measure.push({ note, beats, offset: used, continued, continues: remaining > 0 });
      used = (usedTicks + ticks) / SCORE_DIVISIONS;
      continued = true;
      if (usedTicks + ticks === capacity) {
        measures.push(measure);
        measure = [];
        used = 0;
      }
    }
  }
  if (measure.length || !measures.length) measures.push(measure);
  return measures;
}

// Diatonic steps from E4 (bottom line of the treble staff), with sharps on the same staff step.
export function staffPosition(pitch: number, fifths = 0): number {
  return spellScorePitch(pitch, fifths).position;
}

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// Sixteen divisions per quarter note preserve durations through 64th notes.
export function scoreToMusicXml(score: Score): string {
  score = cleanScoreConnections(score);
  const parts = score.parts
    .map(
      (name, i) =>
        `<score-part id="P${i + 1}"><part-name>${escape(name)}</part-name><score-instrument id="I${i + 1}"><instrument-name>${scoreInstrument(score, name).id}</instrument-name></score-instrument>${scoreInstrument(score, name).id === 'drums' ? scoreDrums.map((drum) => `<score-instrument id="I${i + 1}D${drum.pitch}"><instrument-name>${drum.label}</instrument-name></score-instrument>`).join('') + scoreDrums.map((drum) => `<midi-instrument id="I${i + 1}D${drum.pitch}"><midi-channel>10</midi-channel><midi-unpitched>${drum.pitch + 1}</midi-unpitched></midi-instrument>`).join('') : ''}</score-part>`,
    )
    .join('');
  const bodies = score.parts
    .map((name, i) => {
      const measures: string[] = [];
      let contents = '';
      let used = 0;
      const finish = () => {
        measures.push(contents);
        contents = '';
        used = 0;
      };
      const writtenNotes = score.notes.filter((item) => item.part === name);
      const partNotes =
        scoreInstrument(score, name).id === 'drums'
          ? writtenNotes
          : resolveRhythmSlashes(
              writtenNotes,
              scoreChordPositions(score, name),
              scoreInstrument(score, name).capo,
              scoreInstrument(score, name).id === 'bass',
            );
      const slurNumbers = new Map<string, number>();
      const activeSlurs = new Map<number, number>();
      partNotes.forEach((note, index) => {
        for (const [number, end] of activeSlurs) if (end <= index) activeSlurs.delete(number);
        if (!note.slurTo) return;
        const number = [2, 3, 4, 5, 6].find((value) => !activeSlurs.has(value));
        if (!number)
          throw new Error('MusicXML에는 동시에 겹치는 이음줄을 5개까지 저장할 수 있어요.');
        slurNumbers.set(note.id, number);
        activeSlurs.set(
          number,
          partNotes.findIndex((item) => item.id === note.slurTo),
        );
      });
      const incoming = new Map(
        partNotes
          .filter((n) => n.connection)
          .map((n) => [n.connection!.targetId, n.connection!.type]),
      );
      for (const note of partNotes) {
        if (
          !Number.isFinite(note.beats) ||
          (note.beats <= 0 && !(note.beats === 0 && (note.graceBeats ?? 0) > 0)) ||
          note.beats > 64 ||
          !isScoreBeat(note.beats) ||
          !Number.isInteger(note.pitch) ||
          note.pitch < 0 ||
          note.pitch > 127
        )
          throw new Error('음표의 음정과 길이를 확인해주세요.');
        let remaining = Math.round(note.beats * SCORE_DIVISIONS);
        let continued = false;
        while (remaining > 0 || (note.graceBeats !== undefined && !continued)) {
          const capacity = scoreMeasureDuration(score, name, measures.length) * SCORE_DIVISIONS;
          const duration = Math.min(capacity - used, remaining);
          remaining = scoreBeat(remaining - duration);
          const linkIn = !continued ? incoming.get(note.id) : undefined;
          const linkOut = !remaining ? note.connection?.type : undefined;
          const ties = note.rest
            ? ''
            : `${continued || linkIn === 'tie' ? '<tie type="stop"/>' : ''}${remaining || linkOut === 'tie' ? '<tie type="start"/>' : ''}`;
          const articulations =
            (!note.rest && !continued
              ? `${note.accent ? '<accent/>' : ''}${note.marcato ? '<strong-accent type="up"/>' : ''}${note.staccato ? '<staccato/>' : ''}`
              : '') +
            (!note.rest && !continued && note.slideIn
              ? `<${note.slideIn === 'up' ? 'scoop' : 'plop'} line-type="wavy"/>`
              : '') +
            (!note.rest && !remaining && note.slideOut
              ? `<${note.slideOut === 'up' ? 'doit' : 'falloff'} line-type="wavy"/>`
              : '');
          const notation = `${!note.rest && continued ? '<tied type="stop"/>' : ''}${!note.rest && remaining ? '<tied type="start"/>' : ''}${articulations ? `<articulations>${articulations}</articulations>` : ''}`;
          if (note.chord && !continued)
            contents += `<direction><direction-type><words>${escape(note.chord)}</words></direction-type></direction>`;
          const tones = note.rest
            ? [{ pitch: note.pitch }]
            : tabTones(note, scoreInstrument(score, name).tuning);
          if (note.graceSlide && !continued && !note.rest) {
            const source = note.graceSlide,
              pitch = spellScorePitch(source.pitch, score.keySignature);
            contents += `<note id="moajam-grace-slide-${i}-${measures.length}-${used}"><grace slash="yes" steal-time-following="20"/><pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch><type>eighth</type><notations><slide type="start" number="6">S</slide><technical><string>${source.string}</string><fret>${source.fret}</fret></technical></notations></note>`;
          }
          const tupletGroup = note.tuplet
            ? scoreTupletGroups(partNotes).find((group) =>
                group.some((item) => item.id === note.id),
              )
            : undefined;
          const written = writtenScoreBeats(note, duration / SCORE_DIVISIONS);
          const dotted = DOTTED_SCORE_BEATS.includes(written);
          const base = dotted ? written / 1.5 : written;
          const type = (
            {
              4: 'whole',
              2: 'half',
              1: 'quarter',
              0.5: 'eighth',
              0.25: '16th',
              0.125: '32nd',
              0.0625: '64th',
            } as Record<number, string>
          )[base];
          const timeModification = `${type ? `<type>${type}</type>${dotted ? '<dot/>' : ''}` : ''}${note.tuplet ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : ''}`;
          tones.forEach((tone, toneIndex) => {
            if (!Number.isInteger(tone.pitch) || tone.pitch < 0 || tone.pitch > 127)
              throw new Error('음표의 음정을 확인해주세요.');
            const pitch = spellScoreTone(tone, score.keySignature);
            const percussion = scoreInstrument(score, name).id === 'drums';
            const drum = percussion && !note.rest ? drumForPitch(tone.pitch) : undefined;
            if (percussion && !note.rest && !drum)
              throw new Error('지원하지 않는 드럼 타격이 있어요. 드럼 악기를 다시 선택해주세요.');
            let linkedNotation =
                note.graceSlide && !continued ? '<slide type="stop" number="6"/>' : '',
              linkedTechnical = '';
            for (const [type, edge] of [
              [linkIn, 'stop'],
              [linkOut, 'start'],
            ] as const) {
              if (type === 'tie')
                linkedNotation += `<tied type="${edge}" id="moajam-manual-tie-${edge}-${escape(note.id)}-${toneIndex}"/>`;
              else if (type === 'slide') linkedNotation += `<slide type="${edge}" number="1"/>`;
              else if (type === 'glissando')
                linkedNotation += `<glissando type="${edge}" number="1" line-type="solid"/>`;
              else if (type) {
                const tag = type === 'hammer' ? 'hammer-on' : 'pull-off';
                linkedTechnical += `<${tag} type="${edge}" number="1">${type === 'hammer' ? 'H' : 'P'}</${tag}>`;
                linkedNotation += `<slur type="${edge}" number="1"/>`;
              }
            }
            if (!toneIndex && tupletGroup) {
              if (tupletGroup[0].id === note.id && !continued)
                linkedNotation += '<tuplet type="start" number="1" bracket="yes"/>';
              if (tupletGroup.at(-1)!.id === note.id && !remaining)
                linkedNotation += '<tuplet type="stop" number="1"/>';
            }
            if (!toneIndex) {
              for (const from of partNotes.filter((item) => item.slurTo)) {
                const number = slurNumbers.get(from.id)!;
                if (from.slurTo === note.id && !remaining)
                  linkedNotation += `<slur type="stop" number="${number}" id="moajam-slur-stop-${escape(from.id)}"/>`;
                if (from.id === note.id && !continued)
                  linkedNotation += `<slur type="start" number="${number}" id="moajam-slur-start-${escape(from.id)}"/>`;
              }
            }
            const fingering =
              !note.rest && tone.string && tone.fret !== undefined
                ? `<string>${tone.string}</string><fret>${tone.fret}</fret>`
                : '';
            const technical =
              fingering || linkedTechnical || drum
                ? `<technical>${fingering}${linkedTechnical}${drum ? drumTechnicalXml(tone) : ''}${drum && note.staccato ? '<other-technical>moajam-beat-staccato</other-technical>' : ''}</technical>`
                : '';
            contents += `<note${note.graceBeats !== undefined ? ` id="moajam-grace-note-${i}-${partNotes.indexOf(note)}-${Math.round(note.graceBeats * SCORE_DIVISIONS)}"` : ''}${note.blank ? ' print-object="no"' : ''}>${toneIndex ? '<chord/>' : ''}${note.graceBeats !== undefined ? `<grace slash="yes" steal-time-following="20"/>` : ''}${note.rest ? '<rest/>' : drum ? `<unpitched><display-step>${drum.step}</display-step><display-octave>${drum.octave}</display-octave></unpitched>` : `<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`}${note.graceBeats !== undefined ? '' : `<duration>${duration}</duration>`}${ties}${drum ? `<instrument id="I${i + 1}D${drum.pitch}"/>` : ''}${timeModification}${drum ? `<notehead${tone.ghost ? ' parentheses="yes"' : ''}${drumNotation(tone).hollow ? ' filled="no"' : ''}>${drumNotation(tone).head}</notehead>` : note.slash && !note.rest ? '<notehead>slash</notehead>' : tone.dead && !note.rest ? '<notehead>x</notehead>' : tone.ghost && !note.rest ? '<notehead parentheses="yes">normal</notehead>' : ''}${notation || technical || linkedNotation ? `<notations>${notation}${tone.drumTechnique === 'choke' && !note.staccato ? '<articulations><staccato/></articulations>' : ''}${tone.drumTechnique === 'double' ? '<ornaments><tremolo type="single">1</tremolo></ornaments>' : ''}${linkedNotation}${technical}</notations>` : ''}${note.lyric && !continued && !toneIndex ? `<lyric><text>${escape(note.lyric)}</text></lyric>` : ''}</note>`;
          });
          used = scoreBeat(used + duration);
          continued = true;
          if (used === capacity) finish();
        }
      }
      if (used || contents || !measures.length) {
        const capacity = scoreMeasureDuration(score, name, measures.length) * SCORE_DIVISIONS;
        if (used < capacity)
          contents += `<note print-object="no"><rest/><duration>${capacity - used}</duration></note>`;
        finish();
      }
      for (const [beat, tone] of Object.entries(score.guitarToneChanges?.[name] ?? {})) {
        const location = scoreMeasureAtBeat(score, name, +beat);
        if (measures[location.bar] !== undefined)
          measures[location.bar] =
            `<direction id="moajam-guitar-tone-${i}-${beat}" placement="above"><direction-type><words>${guitarToneLabels[tone]} →</words></direction-type><offset>${Math.round(location.offset * SCORE_DIVISIONS)}</offset></direction>` +
            measures[location.bar];
      }
      const clef = scoreInstrument(score, name).clef;
      while (measures.length < scoreMeasureCount(score, name))
        measures.push(
          `<note print-object="no"><rest/><duration>${scoreMeasureDuration(score, name, measures.length) * SCORE_DIVISIONS}</duration></note>`,
        );
      for (const [index, chord] of Object.entries(score.measureChords?.[name] ?? {})) {
        if (chord.trim() && measures[Number(index)] !== undefined)
          measures[Number(index)] =
            `<direction id="moajam-measure-chord-${i}-${index}" placement="above"><direction-type><words>${escape(chord)}</words></direction-type></direction>${measures[Number(index)]}`;
      }
      for (const [beat, chord] of Object.entries(score.beatChords?.[name] ?? {}).sort(
        ([a], [b]) => Number(b) - Number(a),
      )) {
        const location = scoreMeasureAtBeat(score, name, Number(beat));
        const index = location.bar;
        if (chord.trim() && measures[index] !== undefined)
          measures[index] =
            `<direction id="moajam-beat-chord-${i}-${Number(beat) * SCORE_DIVISIONS}" placement="above"><direction-type><words>${escape(chord)}</words></direction-type><offset>${location.offset * SCORE_DIVISIONS}</offset></direction>${measures[index]}`;
      }
      if (scoreInstrument(score, name).capo && measures.length)
        measures[0] = `<direction id="moajam-capo-${i}" placement="above"><direction-type><words>Capo = ${scoreInstrument(score, name).capo} fret</words></direction-type></direction>${measures[0]}`;
      return `<part id="P${i + 1}">${measures.map((measure, index) => `<measure number="${index + 1}"${scoreMeasureDuration(score, name, index) !== scoreBarBeats(score) ? ' implicit="yes"' : ''} width="${score.measureWidths?.[name]?.[index] ?? 100}">${index === 0 ? `<attributes><divisions>${SCORE_DIVISIONS}</divisions><key><fifths>${clef === 'percussion' ? 0 : (score.keySignature ?? 0)}</fifths></key><time><beats>${scoreTimeSignature(score).beats}</beats><beat-type>${scoreTimeSignature(score).beatType}</beat-type></time><clef><sign>${clef === 'percussion' ? 'percussion' : clef === 'bass8' || clef === 'bass' ? 'F' : 'G'}</sign><line>${clef === 'bass8' || clef === 'bass' ? 4 : 2}</line>${clef === 'bass8' || clef === 'treble8' ? '<clef-octave-change>-1</clef-octave-change>' : ''}</clef></attributes><direction><sound tempo="${score.bpm}">${scoreRhythmFeelXml(score)}</sound></direction>` : ''}${score.repeats?.[index]?.start ? '<barline location="left"><repeat direction="forward"/></barline>' : ''}${[...directionWords(score.directions?.[directionOwner(score, name)]?.[index]), ...navigationWords(score.navigation?.[index])].map((word, wordIndex) => `<direction id="moajam-expression-${i}-${index}-${wordIndex}" placement="above"><direction-type><words>${escape(word)}</words></direction-type></direction>`).join('')}${measure}${score.repeats?.[index]?.end || score.barlines?.[index] === 'double' ? `<barline location="right">${score.barlines?.[index] === 'double' ? '<bar-style>light-light</bar-style>' : ''}${score.repeats?.[index]?.end ? `<repeat direction="backward" times="${score.repeats[index].times ?? 2}"/>` : ''}</barline>` : ''}</measure>`).join('')}</part>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escape(score.title)}</work-title></work><identification><miscellaneous><miscellaneous-field name="moajam-keyboard-staves">${escape(JSON.stringify(score.keyboardStaves ?? {}))}</miscellaneous-field><miscellaneous-field name="moajam-drum-voices">${escape(JSON.stringify(score.drumVoices ?? {}))}</miscellaneous-field><miscellaneous-field name="moajam-expression">${escape(
    JSON.stringify({
      systemGap: score.systemGap,
      directions: score.directions ?? {},
      guitarToneChanges: score.guitarToneChanges ?? {},
      navigation: score.navigation ?? {},
      notes: score.parts.map((part) => {
        let beat = 0;
        return score.notes
          .filter((n) => n.part === part)
          .map((n) => {
            const entry = { beat, beats: n.beats, ...readNoteExpression(n) };
            beat = scoreBeat(beat + n.beats);
            return entry;
          });
      }),
    }),
  )}</miscellaneous-field><miscellaneous-field name="moajam-multi-measure-rests">${escape(JSON.stringify(score.multiMeasureRests ?? {}))}</miscellaneous-field><miscellaneous-field name="moajam-capos">${escape(JSON.stringify(score.capos ?? {}))}</miscellaneous-field></miscellaneous></identification><part-list>${parts}</part-list>${bodies}</score-partwise>`;
}

function scoreRhythmFeelXml(score: Score) {
  if (!score.rhythmFeel) return '';
  const feel = scoreRhythmFeels[score.rhythmFeel];
  return score.rhythmFeel === 'straight'
    ? '<swing><straight/></swing>'
    : `<swing><first>${feel.first}</first><second>${feel.second}</second><swing-type>${feel.unit === 0.5 ? 'eighth' : '16th'}</swing-type></swing>`;
}
