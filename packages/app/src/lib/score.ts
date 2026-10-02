export type ScoreTone = {
  pitch: number;
  string?: number;
  fret?: number;
  ghost?: boolean;
  dead?: boolean;
};
export type ScoreConnectionType = 'hammer' | 'pull' | 'slide' | 'tie';
export const scoreConnectionLabels = {
  hammer: '해머링',
  pull: '풀링',
  slide: '슬라이드',
  tie: '붙임줄',
};
export const SCORE_DIVISIONS = 16;
export const MIN_SCORE_BEATS = 1 / SCORE_DIVISIONS;
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
};
export type Score = {
  title: string;
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
  referenceAudioEnabled?: boolean;
  referenceAudioOffset?: number;
  referenceAudioVolume?: number;
};
export function connectionError(
  from: ScoreNote,
  to: ScoreNote | undefined,
  type: ScoreConnectionType,
): string | null {
  if (!to || from.part !== to.part) return '같은 파트의 이어지는 두 음표를 선택해주세요.';
  if ([from, to].some((n) => n.rest || n.blank || noteTones(n).some((t) => t.dead) || n.staccato))
    return '쉼표·빈 박·뮤트·스타카토 음표는 연결할 수 없어요.';
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
  if (type === 'slide' && a[0].pitch === b[0].pitch)
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
  return changed ? { ...score, notes } : score;
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
      at += note.beats;
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
                .map(([beat, chord]) => ({ offset: Number(beat) - start, chord })),
            },
          ]
        : [];
    });
}
export function scoreMeasureCount(score: Score, part: string): number {
  const total = score.notes
    .filter((note) => note.part === part)
    .reduce((sum, note) => sum + note.beats, 0);
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
    .map(([beat]) => Math.floor(Number(beat) / 4) + 1);
  return Math.max(1, Math.ceil(total / 4), ...chordBars, ...beatBars);
}
export function scoreChordPositions(score: Score, part: string): Record<number, string> {
  const chords: Record<number, string> = {};
  let beat = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    if (note.chord.trim()) chords[beat] = note.chord;
    beat += note.beats;
  }
  for (const [bar, chord] of Object.entries(score.measureChords?.[part] ?? {}))
    if (chord.trim()) chords[Number(bar) * 4] = chord;
  return { ...chords, ...score.beatChords?.[part] };
}
export function setScoreBeatChord(score: Score, part: string, beat: number, chord: string): Score {
  if (
    !score.parts.includes(part) ||
    !Number.isFinite(beat) ||
    beat < 0 ||
    beat >= 128000 ||
    !Number.isInteger(beat * SCORE_DIVISIONS)
  )
    throw new Error('코드를 넣을 박 위치를 확인해주세요.');
  const chords = { ...score.beatChords?.[part] };
  if (chord.trim()) chords[beat] = chord.slice(0, 40);
  else delete chords[beat];
  const measures = { ...score.measureChords?.[part] };
  if (beat % 4 === 0) delete measures[beat / 4];
  let at = 0;
  const notes = score.notes.map((note) => {
    if (note.part !== part) return note;
    const clear = at === beat && !!note.chord;
    at += note.beats;
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

// Delete cycles a silent slot between blank and rest without shifting later beats.
export function deleteScorePosition(score: Score, id: string, string?: number): Score {
  const note = score.notes.find((item) => item.id === id);
  if (!note) return score;
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

// Duration edits consume/release blank time without moving following notes or rests.
export function setScoreDuration(
  score: Score,
  id: string,
  beats: number,
  makeId: () => string,
  offset = 0,
): Score {
  const current = score.notes.find((item) => item.id === id);
  if (!current) return score;
  if (
    !Number.isFinite(beats) ||
    beats < MIN_SCORE_BEATS ||
    beats > 6 ||
    !Number.isInteger(beats * SCORE_DIVISIONS)
  )
    throw new Error('음표 길이는 1/16~6박으로 입력해주세요.');
  if (
    !Number.isInteger(offset * SCORE_DIVISIONS) ||
    offset < 0 ||
    offset >= current.beats ||
    (offset && !current.blank)
  )
    throw new Error('입력 위치를 확인해주세요.');
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
  let remaining = beats - (current.beats - offset);
  let tail: ScoreNote | undefined;
  for (let i = part.indexOf(current) + 1; remaining > 0 && i < part.length; i++) {
    const next = part[i];
    if (!next.blank) throw new Error('뒤 음표와 겹치는 길이예요. 먼저 뒤에 빈 박을 삽입해주세요.');
    consumed.add(next.id);
    remaining -= next.beats;
    if (remaining < 0) tail = { ...next, beats: -remaining };
  }
  const replacement = [
    ...(offset ? [blank(offset)] : []),
    { ...current, beats },
    ...(beats < current.beats - offset ? [blank(current.beats - offset - beats)] : []),
    ...(tail ? [tail] : []),
  ];
  const notes = score.notes.flatMap((item) =>
    item.id === id ? replacement : consumed.has(item.id) ? [] : [item],
  );
  if (notes.length > 2000) throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  // A trimmed blank starts later; its previous audio anchor no longer applies.
  if (offset) consumed.add(id);
  return {
    ...score,
    notes,
    sync: Object.fromEntries(Object.entries(score.sync).filter(([key]) => !consumed.has(key))),
  };
}
export const pitchName = (pitch: number) =>
  ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] +
  (Math.floor(pitch / 12) - 1);

// Accidentals last for the same staff position through the current measure.
export function scoreAccidentalMarks(fragments: ScoreFragment[]) {
  const accidentals = new Map<number, boolean>();
  return fragments.map(({ note, continued }) =>
    noteTones(note).map((tone) => {
      if (tone.dead || note.rest || note.blank) return '';
      const step = staffPosition(tone.pitch);
      const sharp = pitchName(tone.pitch).includes('♯');
      const previous = accidentals.get(step) ?? false;
      accidentals.set(step, sharp);
      return continued || sharp === previous ? '' : sharp ? '♯' : '♮';
    }),
  );
}

export function setScoreDotted(score: Score, ids: string[], enabled: boolean): Score {
  const chosen = new Set(ids);
  const parts = new Set<string>();
  const notes = score.notes.map((note) => {
    if (!chosen.has(note.id) || note.blank) return note;
    const dotted = DOTTED_SCORE_BEATS.includes(note.beats);
    const base = dotted ? note.beats / 1.5 : note.beats;
    if (![4, 2, 1, 0.5, 0.25, 0.125].includes(base))
      throw new Error('점음표는 온음표부터 32분음표까지 적용할 수 있어요.');
    const beats = enabled ? base * 1.5 : base;
    if (beats === note.beats) return note;
    parts.add(note.part);
    return { ...note, beats };
  });
  // Shift following notes and their chord anchors together; never overwrite them.
  return parts.size ? retimeScore(score, notes, [...parts]) : score;
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
        oldEnd += note.beats;
        return { note, start, end: oldEnd };
      });
    const starts = new Map(
      notes
        .filter((note) => note.part === part)
        .map((note) => {
          const start = newEnd;
          newEnd += note.beats;
          return [note.id, start] as const;
        }),
    );
    for (const { note, start } of old) if (starts.get(note.id) !== start) delete sync[note.id];
    const fixed: Record<number, string> = Object.fromEntries(
      Object.entries(score.measureChords?.[part] ?? {}).map(([bar, chord]) => [
        Number(bar) * 4,
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
      if (next !== null) moved[next] = chord;
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
  // Work on a new score, from right to left. If any edit overlaps a note, callers
  // receive an error and keep the entire original passage (no partial edit).
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
  return retimeScore(score, notes, [note.part]);
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
    .reduce((sum, item) => sum + item.beats, 0);
  if (
    !Number.isFinite(beat) ||
    beat < end ||
    !Number.isInteger(beat * SCORE_DIVISIONS) ||
    beat - end > 64
  )
    throw new Error('입력 위치를 확인해주세요.');
  const additions: ScoreNote[] = [];
  for (let at = end; at < beat;) {
    const beats = Math.min(1, note.beats, beat - at);
    if (beats <= 0 || !Number.isInteger(beats * SCORE_DIVISIONS))
      throw new Error('음표 길이를 확인해주세요.');
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
    at += beats;
  }
  if (score.notes.length + additions.length + 1 > 2000)
    throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  return { ...score, notes: [...score.notes, ...additions, note] };
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
              !Number.isInteger(change.offset * SCORE_DIVISIONS) ||
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
        !Number.isInteger(note.beats * SCORE_DIVISIONS) ||
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
      id: '',
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
    !Number.isInteger(beat * SCORE_DIVISIONS) ||
    copied.some(
      (note) =>
        !Number.isFinite(note.beats) ||
        note.beats <= 0 ||
        note.beats > 64 ||
        !Number.isInteger(note.beats * SCORE_DIVISIONS),
    )
  )
    throw new Error('붙여넣을 위치와 음표 길이를 확인해주세요.');
  const insertedChords: Record<number, string> = {};
  let copiedAt = beat;
  const additions: ScoreNote[] = copied.map(({ copiedChords, copiedConnection, ...note }) => {
    for (const change of copiedChords ?? [])
      insertedChords[copiedAt + change.offset] = change.chord;
    copiedAt += note.beats;
    return {
      ...note,
      connection: copiedConnection ? { type: copiedConnection, targetId: '' } : undefined,
      part,
      id: makeId(),
      tones: note.tones?.map((tone) => ({ ...tone })),
    };
  });
  additions.forEach((note, i) => {
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
      notes.push({ ...note, beats: beat - at }, ...additions, {
        ...note,
        id: makeId(),
        beats: at + note.beats - beat,
      });
      inserted = true;
    } else notes.push(note);
    if (inserted) delete sync[note.id];
    at += note.beats;
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
    start += size;
  }
  return rows;
}

// Move a layout boundary, preserving chronological note order and beat positions.
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
  const capacities = [
    ...rows.map((item) => item.capacity),
    ...(score.systemLayout?.[part]?.slice(rows.length) ?? []),
  ];
  if (direction === 1) {
    if (offset === 0) return score;
    capacities.splice(index, 1, offset, row.capacity - offset);
  } else {
    if (index === 0 || capacities[index - 1] + offset + 1 > 16) return score;
    capacities[index - 1] += offset + 1;
    if (row.capacity > offset + 1) capacities[index] -= offset + 1;
    else capacities.splice(index, 1);
  }
  return { ...score, systemLayout: { ...score.systemLayout, [part]: capacities } };
}

export function scorePlaybackBeats(score: Score, part: string): number {
  const total = score.notes
    .filter((note) => note.part === part)
    .reduce((sum, note) => sum + note.beats, 0);
  return Math.ceil(total / 4) * 4;
}

export function scorePlaybackFrom(score: Score, part: string, from = 0) {
  const endBeat = scorePlaybackBeats(score, part);
  const startBeat = Number.isFinite(from) ? Math.max(0, Math.min(endBeat, from)) : 0;
  const events: { note: ScoreNote; offset: number; beats: number }[] = [];
  let at = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    const end = at + note.beats;
    if (end > startBeat) {
      const start = Math.max(at, startBeat);
      events.push({ note, offset: start - startBeat, beats: end - start });
    }
    at = end;
  }
  return { startBeat, endBeat, events };
}

export function scoreMeasurePosition(
  score: Score,
  part: string,
  beat: number,
  direction: -1 | 1,
): { id: string | null; beat: number } {
  const target = Math.max(0, Math.floor(beat / 4) + direction) * 4;
  let at = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    if (target < at + note.beats) return { id: note.id, beat: target };
    at += note.beats;
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
      !Number.isInteger(note.beats * SCORE_DIVISIONS)
    )
      throw new Error('음표 길이는 64분음표 단위로 입력해주세요.');
    let remaining = note.beats;
    let continued = false;
    while (remaining > 0) {
      const available = Math.min(4 - used, remaining);
      const beats = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125, 0.0625].find(
        (value) => value <= available,
      )!;
      remaining -= beats;
      measure.push({ note, beats, offset: used, continued, continues: remaining > 0 });
      used += beats;
      continued = true;
      if (used === 4) {
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
export function staffPosition(pitch: number): number {
  const steps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return (Math.floor(pitch / 12) - 5) * 7 + steps[pitch % 12] - 2;
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
          !Number.isInteger(note.beats * SCORE_DIVISIONS) ||
          !Number.isInteger(note.pitch) ||
          note.pitch < 0 ||
          note.pitch > 127
        )
          throw new Error('음표의 음정과 길이를 확인해주세요.');
        let remaining = Math.round(note.beats * SCORE_DIVISIONS);
        let continued = false;
        while (remaining > 0) {
          const duration = Math.min(4 * SCORE_DIVISIONS - used, remaining);
          remaining -= duration;
          const linkIn = !continued ? incoming.get(note.id) : undefined;
          const linkOut = !remaining ? note.connection?.type : undefined;
          const ties = note.rest
            ? ''
            : `${continued || linkIn === 'tie' ? '<tie type="stop"/>' : ''}${remaining || linkOut === 'tie' ? '<tie type="start"/>' : ''}`;
          const articulations =
            !note.rest && !continued
              ? `${note.accent ? '<accent/>' : ''}${note.staccato ? '<staccato/>' : ''}`
              : '';
          const notation = `${!note.rest && continued ? '<tied type="stop"/>' : ''}${!note.rest && remaining ? '<tied type="start"/>' : ''}${articulations ? `<articulations>${articulations}</articulations>` : ''}`;
          if (note.chord && !continued)
            contents += `<direction><direction-type><words>${escape(note.chord)}</words></direction-type></direction>`;
          const tones = note.rest
            ? [{ pitch: note.pitch }]
            : tabTones(note, scoreInstrument(score, name).tuning);
          tones.forEach((tone, toneIndex) => {
            if (!Number.isInteger(tone.pitch) || tone.pitch < 0 || tone.pitch > 127)
              throw new Error('음표의 음정을 확인해주세요.');
            const pitch = pitchName(tone.pitch);
            let linkedNotation = '',
              linkedTechnical = '';
            for (const [type, edge] of [
              [linkIn, 'stop'],
              [linkOut, 'start'],
            ] as const) {
              if (type === 'tie')
                linkedNotation += `<tied type="${edge}" id="moajam-manual-tie-${edge}-${escape(note.id)}-${toneIndex}"/>`;
              else if (type === 'slide') linkedNotation += `<slide type="${edge}" number="1"/>`;
              else if (type) {
                const tag = type === 'hammer' ? 'hammer-on' : 'pull-off';
                linkedTechnical += `<${tag} type="${edge}" number="1">${type === 'hammer' ? 'H' : 'P'}</${tag}>`;
                linkedNotation += `<slur type="${edge}" number="1"/>`;
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
            contents += `<note${note.blank ? ' print-object="no"' : ''}>${toneIndex ? '<chord/>' : ''}${note.rest ? '<rest/>' : `<pitch><step>${pitch[0]}</step>${pitch.includes('♯') ? '<alter>1</alter>' : ''}<octave>${Math.floor(tone.pitch / 12) - 1}</octave></pitch>`}<duration>${duration}</duration>${ties}${tone.dead && !note.rest ? '<notehead>x</notehead>' : tone.ghost && !note.rest ? '<notehead parentheses="yes">normal</notehead>' : ''}${notation || technical || linkedNotation ? `<notations>${notation}${linkedNotation}${technical}</notations>` : ''}${note.lyric && !continued && !toneIndex ? `<lyric><text>${escape(note.lyric)}</text></lyric>` : ''}</note>`;
          });
          used += duration;
          continued = true;
          if (used === 4 * SCORE_DIVISIONS) finish();
        }
      }
      if (used || !measures.length) {
        if (used < 4 * SCORE_DIVISIONS)
          contents += `<note><rest/><duration>${4 * SCORE_DIVISIONS - used}</duration></note>`;
        finish();
      }
      const clef = scoreInstrument(score, name).clef;
      while (measures.length < scoreMeasureCount(score, name))
        measures.push(
          `<note print-object="no"><rest/><duration>${4 * SCORE_DIVISIONS}</duration></note>`,
        );
      for (const [index, chord] of Object.entries(score.measureChords?.[name] ?? {})) {
        if (chord.trim() && measures[Number(index)] !== undefined)
          measures[Number(index)] =
            `<direction id="moajam-measure-chord-${i}-${index}" placement="above"><direction-type><words>${escape(chord)}</words></direction-type></direction>${measures[Number(index)]}`;
      }
      for (const [beat, chord] of Object.entries(score.beatChords?.[name] ?? {}).sort(
        ([a], [b]) => Number(b) - Number(a),
      )) {
        const index = Math.floor(Number(beat) / 4);
        if (chord.trim() && measures[index] !== undefined)
          measures[index] =
            `<direction id="moajam-beat-chord-${i}-${Number(beat) * SCORE_DIVISIONS}" placement="above"><direction-type><words>${escape(chord)}</words></direction-type><offset>${(Number(beat) % 4) * SCORE_DIVISIONS}</offset></direction>${measures[index]}`;
      }
      return `<part id="P${i + 1}">${measures.map((measure, index) => `<measure number="${index + 1}">${index === 0 ? `<attributes><divisions>${SCORE_DIVISIONS}</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${clef === 'bass8' ? 'F' : 'G'}</sign><line>${clef === 'bass8' ? 4 : 2}</line>${clef !== 'treble' ? '<clef-octave-change>-1</clef-octave-change>' : ''}</clef></attributes><direction><sound tempo="${score.bpm}"/></direction>` : ''}${measure}</measure>`).join('')}</part>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escape(score.title)}</work-title></work><part-list>${parts}</part-list>${bodies}</score-partwise>`;
}
