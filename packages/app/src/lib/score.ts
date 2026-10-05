export type ScoreTone = {
  pitch: number;
  string?: number;
  fret?: number;
  ghost?: boolean;
  dead?: boolean;
};
export type ScoreConnectionType = 'hammer' | 'pull' | 'slide' | 'glissando' | 'tie';
export const scoreConnectionLabels = {
  hammer: '해머링',
  pull: '풀링',
  slide: '슬라이드',
  glissando: '지판 슬라이드',
  tie: '붙임줄',
};
export const SCORE_DIVISIONS = 48;
export const MIN_SCORE_BEATS = 1 / SCORE_DIVISIONS;
export const scoreBeat = (value: number) => Math.round(value * SCORE_DIVISIONS) / SCORE_DIVISIONS;
export const isScoreBeat = (value: number) =>
  Number.isFinite(value) &&
  Math.abs(value * SCORE_DIVISIONS - Math.round(value * SCORE_DIVISIONS)) < 1e-7;
export const writtenScoreBeats = (note: { tuplet?: 3 }, beats: number) =>
  note.tuplet === 3 ? scoreBeat(beats * 1.5) : beats;
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
  staccato?: boolean;
  ghost?: boolean;
  dead?: boolean;
  tones?: ScoreTone[];
  blank?: boolean;
  connection?: { type: ScoreConnectionType; targetId: string };
  slurTo?: string;
  slideOut?: 'up' | 'down';
  tuplet?: 3;
};
export type Score = {
  title: string;
  rhythmFeel?: keyof typeof scoreRhythmFeels;
  timeSignature?: { beats: number; beatType: number };
  keySignature?: number;
  measureLengths?: Record<string, Record<number, number>>;
  measureWidths?: Record<string, Record<number, number>>;
  repeats?: Record<number, { start?: boolean; end?: boolean; times?: number }>;
  barlines?: Record<number, 'double'>;
  bpm: number;
  notes: ScoreNote[];
  parts: string[];
  sync: Record<string, number>;
  instruments?: Record<string, string>;
  systemLayout?: Record<string, number[]>;
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

// Swing belongs to beat positions, including offbeats followed by sustained notes.
// Explicit tuplets and dotted rhythms protect their beat cells from a second swing.
export function scorePerformance(score: Score, part: string) {
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
  if ([from, to].some((n) => n.rest || n.blank || noteTones(n).some((t) => t.dead) || n.staccato))
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
  if (a.length !== 1 || b.length !== 1 || !a[0].string || a[0].string !== b[0].string)
    return '해머링·풀링·슬라이드는 같은 줄의 단음 두 개를 선택해주세요.';
  if (type === 'hammer' && a[0].pitch >= b[0].pitch)
    return '해머링은 낮은 음에서 높은 음으로 연결해주세요.';
  if (type === 'pull' && a[0].pitch <= b[0].pitch)
    return '풀링은 높은 음에서 낮은 음으로 연결해주세요.';
  if ((type === 'slide' || type === 'glissando') && a[0].pitch === b[0].pitch)
    return '슬라이드는 서로 다른 높이의 음을 연결해주세요.';
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
    if (
      note.slideOut &&
      (note.rest ||
        note.blank ||
        note.staccato ||
        noteTones(note).length !== 1 ||
        noteTones(note).some((tone) => tone.dead))
    ) {
      changed = true;
      note = { ...note, slideOut: undefined };
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

export function setScoreConnection(
  score: Score,
  ids: string[],
  type: ScoreConnectionType | null,
): Score {
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
  const ghosts = new Map<string, ScoreTone[]>();
  if (slurTo) {
    const tuning = scoreInstrument(score, from.part).tuning;
    for (let i = a + 1; i <= b; i++) {
      const prior = tuning.length ? tabTones(notes[i - 1], tuning) : noteTones(notes[i - 1]);
      const tones = tuning.length ? tabTones(notes[i], tuning) : noteTones(notes[i]);
      const next = tones.map((tone) =>
        !tone.dead &&
        prior.some(
          (previous) =>
            !previous.dead && previous.pitch === tone.pitch && previous.string === tone.string,
        )
          ? { ...tone, ghost: true }
          : tone,
      );
      if (next.some((tone, index) => tone !== tones[index])) ghosts.set(notes[i].id, next);
    }
  }
  return {
    ...score,
    notes: score.notes.map((note) =>
      note.id === from.id
        ? { ...note, slurTo }
        : ghosts.has(note.id)
          ? { ...note, tones: ghosts.get(note.id), ghost: false }
          : note,
    ),
  };
}

export function setScoreSlideOut(score: Score, ids: string[], direction: 'up' | 'down'): Score {
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
    throw new Error('슬라이드 아웃은 쉼표·뮤트·스타카토가 아닌 단음을 선택해주세요.');
  const remove = selected.every((note) => note.slideOut === direction);
  return {
    ...score,
    notes: score.notes.map((note) =>
      ids.includes(note.id)
        ? {
            ...note,
            slideOut: remove ? undefined : direction,
            connection: remove ? note.connection : undefined,
          }
        : note,
    ),
  };
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
  guitar: { label: '기타 · 표준 튜닝', tuning: [64, 59, 55, 50, 45, 40], clef: 'treble8' },
  dropD: { label: '기타 · Drop D', tuning: [64, 59, 55, 50, 45, 38], clef: 'treble8' },
  bass: { label: '베이스 · 4현', tuning: [43, 38, 33, 28], clef: 'bass8' },
  standard: { label: '오선보 · 일반 악기', tuning: [] as number[], clef: 'treble' },
} as const;
export function scoreInstrument(score: Score, part: string) {
  const id =
    score.instruments?.[part] ??
    (/bass|베이스/i.test(part) ? 'bass' : /guitar|기타/i.test(part) ? 'guitar' : 'standard');
  return {
    id,
    ...(scoreInstruments[id as keyof typeof scoreInstruments] ?? scoreInstruments.standard),
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
  return {
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
  };
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
function spliceScorePartTime(
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
export function scoreAccidentalMarks(fragments: ScoreFragment[], fifths = 0) {
  const accidentals = new Map<number, number>();
  return fragments.map(({ note, continued }) =>
    noteTones(note).map((tone) => {
      if (tone.dead || note.rest || note.blank) return '';
      const spelling = spellScorePitch(tone.pitch, fifths);
      const previous = accidentals.get(spelling.position) ?? scoreKeyAlter(spelling.step, fifths);
      accidentals.set(spelling.position, spelling.alter);
      return continued || spelling.alter === previous
        ? ''
        : spelling.alter > 0
          ? '♯'
          : spelling.alter < 0
            ? '♭'
            : '♮';
    }),
  );
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
  }
  return cleanScoreConnections({ ...score, notes, sync, measureChords, beatChords });
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
          (tuning.length ? tone.string === selected : index === selected - 1)
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
        note.beats <= 0 ||
        note.beats > 64 ||
        !isScoreBeat(note.beats) ||
        (note.tuplet !== undefined && note.tuplet !== 3) ||
        (note.slideOut !== undefined && note.slideOut !== 'up' && note.slideOut !== 'down') ||
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
              (tone.string !== undefined && !integer(tone.string, 1, 6)) ||
              (tone.fret !== undefined && !integer(tone.fret, 0, 24)) ||
              (tone.ghost !== undefined && typeof tone.ghost !== 'boolean') ||
              (tone.dead !== undefined && typeof tone.dead !== 'boolean'),
          ))
      )
        return null;
    }
    return value.notes.map((note: ScoreClipboardNote) => ({
      id: typeof note.id === 'string' ? note.id.slice(0, 200) : '',
      tuplet: note.tuplet === 3 ? 3 : undefined,
      slurTo: typeof note.slurTo === 'string' ? note.slurTo.slice(0, 200) : undefined,
      slideOut: note.slideOut,
      part: '',
      pitch: note.pitch,
      beats: note.beats,
      rest: note.rest,
      chord: note.chord,
      lyric: note.lyric,
      accent: note.accent,
      copiedConnection: note.copiedConnection,
      blank: note.blank,
      ghost: note.ghost,
      dead: note.dead,
      staccato: note.staccato,
      tones: note.tones?.map(({ pitch, string, fret, ghost, dead }) => ({
        pitch,
        string,
        fret,
        ghost,
        dead,
      })),
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
        note.beats <= 0 ||
        note.beats > 64 ||
        !isScoreBeat(note.beats),
    )
  )
    throw new Error('붙여넣을 위치와 음표 길이를 확인해주세요.');
  beat = scoreBeat(beat);
  const insertedChords: Record<number, string> = {};
  let copiedAt = beat;
  const additions: ScoreNote[] = copied.map(({ copiedChords, copiedConnection, ...note }) => {
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
  });
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
): Score {
  const rows = scoreSystemRows(score, part, count);
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
  return { ...score, systemLayout: { ...score.systemLayout, [part]: capacities } };
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
  const rows = score.notes.filter((note) => note.part === part);
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
  let first = true,
    visits = 0;
  if (to !== undefined) add(startBeat, lastBeat);
  while (to === undefined && bar <= lastBar && visits++ < 256000) {
    const marker = score.repeats?.[bar];
    if (marker?.start) anchor = bar;
    const start = scoreMeasureStart(score, part, bar);
    add(
      first ? Math.max(start, startBeat) : start,
      Math.min(lastBeat, start + scoreMeasureDuration(score, part, bar)),
    );
    first = false;
    if (marker?.end && (passes.get(bar) ?? 1) < (marker.times ?? 2)) {
      passes.set(bar, (passes.get(bar) ?? 1) + 1);
      bar = Math.min(anchor, bar);
    } else {
      if (marker?.end) anchor = bar + 1;
      bar++;
    }
  }
  for (const segment of segments) {
    let at = 0;
    for (const note of rows) {
      const end = scoreBeat(at + note.beats);
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
    if (
      !Number.isFinite(note.beats) ||
      note.beats <= 0 ||
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
        `<score-part id="P${i + 1}"><part-name>${escape(name)}</part-name><score-instrument id="I${i + 1}"><instrument-name>${scoreInstrument(score, name).id}</instrument-name></score-instrument></score-part>`,
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
      const partNotes = score.notes.filter((item) => item.part === name);
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
          note.beats <= 0 ||
          note.beats > 64 ||
          !isScoreBeat(note.beats) ||
          !Number.isInteger(note.pitch) ||
          note.pitch < 0 ||
          note.pitch > 127
        )
          throw new Error('음표의 음정과 길이를 확인해주세요.');
        let remaining = Math.round(note.beats * SCORE_DIVISIONS);
        let continued = false;
        while (remaining > 0) {
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
              ? `${note.accent ? '<accent/>' : ''}${note.staccato ? '<staccato/>' : ''}`
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
            const pitch = spellScorePitch(tone.pitch, score.keySignature);
            let linkedNotation = '',
              linkedTechnical = '';
            for (const [type, edge] of [
              [linkIn, 'stop'],
              [linkOut, 'start'],
            ] as const) {
              if (type === 'tie')
                linkedNotation += `<tied type="${edge}" id="moajam-manual-tie-${edge}-${escape(note.id)}-${toneIndex}"/>`;
              else if (type === 'slide') linkedNotation += `<slide type="${edge}" number="1"/>`;
              else if (type === 'glissando')
                linkedNotation += `<glissando type="${edge}" number="1" line-type="wavy"/>`;
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
              fingering || linkedTechnical
                ? `<technical>${fingering}${linkedTechnical}</technical>`
                : '';
            contents += `<note${note.blank ? ' print-object="no"' : ''}>${toneIndex ? '<chord/>' : ''}${note.rest ? '<rest/>' : `<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`}<duration>${duration}</duration>${ties}${timeModification}${tone.dead && !note.rest ? '<notehead>x</notehead>' : tone.ghost && !note.rest ? '<notehead parentheses="yes">normal</notehead>' : ''}${notation || technical || linkedNotation ? `<notations>${notation}${linkedNotation}${technical}</notations>` : ''}${note.lyric && !continued && !toneIndex ? `<lyric><text>${escape(note.lyric)}</text></lyric>` : ''}</note>`;
          });
          used = scoreBeat(used + duration);
          continued = true;
          if (used === capacity) finish();
        }
      }
      if (used || !measures.length) {
        const capacity = scoreMeasureDuration(score, name, measures.length) * SCORE_DIVISIONS;
        if (used < capacity)
          contents += `<note print-object="no"><rest/><duration>${capacity - used}</duration></note>`;
        finish();
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
      return `<part id="P${i + 1}">${measures.map((measure, index) => `<measure number="${index + 1}"${scoreMeasureDuration(score, name, index) !== scoreBarBeats(score) ? ' implicit="yes"' : ''} width="${score.measureWidths?.[name]?.[index] ?? 100}">${index === 0 ? `<attributes><divisions>${SCORE_DIVISIONS}</divisions><key><fifths>${score.keySignature ?? 0}</fifths></key><time><beats>${scoreTimeSignature(score).beats}</beats><beat-type>${scoreTimeSignature(score).beatType}</beat-type></time><clef><sign>${clef === 'bass8' ? 'F' : 'G'}</sign><line>${clef === 'bass8' ? 4 : 2}</line>${clef !== 'treble' ? '<clef-octave-change>-1</clef-octave-change>' : ''}</clef></attributes><direction><sound tempo="${score.bpm}">${scoreRhythmFeelXml(score)}</sound></direction>` : ''}${score.repeats?.[index]?.start ? '<barline location="left"><repeat direction="forward"/></barline>' : ''}${measure}${score.repeats?.[index]?.end || score.barlines?.[index] === 'double' ? `<barline location="right">${score.barlines?.[index] === 'double' ? '<bar-style>light-light</bar-style>' : ''}${score.repeats?.[index]?.end ? `<repeat direction="backward" times="${score.repeats[index].times ?? 2}"/>` : ''}</barline>` : ''}</measure>`).join('')}</part>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escape(score.title)}</work-title></work><part-list>${parts}</part-list>${bodies}</score-partwise>`;
}

function scoreRhythmFeelXml(score: Score) {
  if (!score.rhythmFeel) return '';
  const feel = scoreRhythmFeels[score.rhythmFeel];
  return score.rhythmFeel === 'straight'
    ? '<swing><straight/></swing>'
    : `<swing><first>${feel.first}</first><second>${feel.second}</second><swing-type>${feel.unit === 0.5 ? 'eighth' : '16th'}</swing-type></swing>`;
}
