import { randomUUID } from 'node:crypto';
import { RecognitionError } from './pdf-recognition.client.js';

export type PdfWarning = { part: string; measure: number; code: string };
export const supportedDrumPitches: readonly number[] = [
  35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 55, 56, 57,
];
type Tone = {
  drumTechnique?: 'rimshot' | 'roll2' | 'roll3';
  pitch: number;
  string?: number;
  fret?: number;
  dead?: boolean;
  ghost?: boolean;
  palmMute?: boolean;
  vibrato?: boolean;
  harmonic?: 'natural' | 'pinch';
  bassTechnique?: 'thumb' | 'pluck';
  bend?: { kind: 'bend' | 'release' | 'prebend' | 'prebend-release'; amount: 2 };
};
type Note = {
  id: string;
  part: string;
  pitch: number;
  beats: number;
  rest: boolean;
  accent: boolean;
  chord: string;
  lyric: string;
  tones: Tone[];
  tuplet?: 3;
  connection?: { type: 'tie' | 'hammer' | 'pull' | 'slide'; targetId: string };
  slideIn?: 'up' | 'down';
};
export type ConvertedScore = {
  title: string;
  bpm: number;
  keySignature: number;
  timeSignature: { beats: number; beatType: number };
  parts: string[];
  notes: Note[];
  sync: Record<string, number>;
  instruments: Record<string, string>;
  capos: Record<string, number>;
  keyboardStaves: Record<string, string>;
  drumVoices: Record<string, string>;
  measureLengths: Record<string, Record<number, number>>;
};
export type RecognitionData = {
  bpm: number | null;
  key: number | null;
  parts: Part[];
  warnings: PdfWarning[];
};
type Event = {
  staff: string;
  voice: string;
  onset: number[];
  duration: number[];
  notes: {
    pitch: number | null;
    string: number | null;
    fret: number | null;
    drum: string | null;
    dead?: boolean;
  }[];
  techniques: string[];
  tie: string;
};
type Measure = {
  restCount?: number | null;
  number: number;
  page: number;
  meter: number[];
  events: Event[];
  reading?: string;
};
type Part = { id: string; name: string; instrument: string; capo: number; measures: Measure[] };
const tunings: Record<string, number[]> = {
  guitar: [64, 59, 55, 50, 45, 40],
  dropD: [64, 59, 55, 50, 45, 38],
  guitarHalfDown: [63, 58, 54, 49, 44, 39],
  bass: [43, 38, 33, 28],
  bassHalfDown: [42, 37, 32, 27],
  bassDropD: [43, 38, 33, 26],
  piano: [],
  standard: [],
  drums: [],
};
const fail = (message: string): never => {
  throw new RecognitionError('SCORE_VALIDATION', message);
};
const obj = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('악보 JSON 구조가 올바르지 않아요.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k)))
    fail('허용하지 않는 데이터 키입니다.');
  return row;
};
const integer = (n: unknown, min: number, max: number): number => {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max)
    return fail('악보 숫자 범위를 확인해주세요.');
  return n;
};
const text = (v: unknown, max = 80): string => {
  if (typeof v !== 'string' || v.length > max) return fail('악보 텍스트를 확인해주세요.');
  return v;
};
const array = (v: unknown, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max)
    return fail('악보 데이터가 비어 있거나 허용 크기를 초과했어요.');
  return v;
};
function fraction(v: unknown, duration = false) {
  const a = array(v, 2);
  if (a.length !== 2) return fail('박자는 분수 두 숫자로 표현해야 합니다.');
  const ticks = (integer(a[0], duration ? 1 : 0, 6144) * 48) / integer(a[1], 1, 192);
  if (!Number.isInteger(ticks) || ticks > 3072 || (duration && !ticks))
    fail('1/48박 격자에 맞지 않는 리듬입니다.');
  return ticks;
}
export function validateRecognition(value: unknown, pageCount: number): RecognitionData {
  const root = obj(value);
  const parts = array(root.parts, 8);
  if (!parts.length) fail('인식된 악기 파트가 없어요.');
  if (root.bpm !== null) integer(root.bpm, 30, 300);
  if (root.key !== null) integer(root.key, -7, 7);
  let count = 0;
  const ids = new Set<string>();
  for (const value of parts) {
    const p = obj(value),
      id = text(p.id, 40);
    if (!id || ids.has(id)) fail('파트 ID가 중복되었어요.');
    ids.add(id);
    if (!text(p.name, 40).trim() || !Object.hasOwn(tunings, text(p.instrument)))
      fail('지원하지 않는 악기입니다.');
    integer(p.capo, 0, 12);
    const measures = array(p.measures, 128);
    const seen = new Set<number>();
    for (const m of measures) {
      const bar = obj(m),
        number = integer(bar.number, 1, 32000);
      if (bar.restCount != null) {
        const count = integer(bar.restCount, 2, 128);
        if (number + count - 1 > 32000 || array(bar.events, 2000).length)
          fail('여러 마디 쉼표의 길이 또는 음표 구성을 확인해주세요.');
      }
      if (seen.has(number)) fail('중복된 마디입니다.');
      seen.add(number);
      integer(bar.page, 1, pageCount);
      const meter = array(bar.meter, 2);
      if (meter.length !== 2 || ![2, 4, 8, 16].includes(integer(meter[1], 2, 16)))
        fail('지원하지 않는 박자표입니다.');
      integer(meter[0], 1, 16);
      for (const event of array(bar.events, 2000)) {
        if (++count > 2000) fail('음표가 너무 많아요. 최대 2,000개 이벤트까지 변환할 수 있습니다.');
        const e = obj(event);
        const allowedStaff =
          p.instrument === 'piano'
            ? ['main', 'right', 'left']
            : p.instrument === 'drums'
              ? ['main', 'upper', 'lower']
              : ['main'];
        if (!allowedStaff.includes(String(e.staff))) fail('악기와 보표 구성이 맞지 않아요.');
        if (
          !['main', 'right', 'left', 'upper', 'lower'].includes(text(e.staff)) ||
          !['none', 'start', 'stop', 'continue'].includes(text(e.tie))
        )
          fail('보표 또는 붙임줄 정보가 올바르지 않아요.');
        text(e.voice, 20);
        const start = fraction(e.onset),
          length = fraction(e.duration, true);
        if (
          start + length > ((Number(meter[0]) * 4) / Number(meter[1])) * 48 &&
          bar.reading !== 'estimated'
        )
          fail(`${number}마디의 음표가 마디 끝을 넘어갑니다.`);
        for (const note of array(e.notes, 16)) {
          const n = obj(note);
          if (n.dead !== undefined && typeof n.dead !== 'boolean')
            fail('고스트노트 표시가 올바르지 않아요.');
          if (n.pitch !== null) integer(n.pitch, 0, 127);
          if (n.string !== null) integer(n.string, 1, 6);
          if (n.fret !== null) integer(n.fret, 0, 36);
          if (n.drum !== null) text(n.drum, 40);
        }
        array(e.techniques, 16).forEach((t) => text(t, 40));
      }
    }
  }
  const warnings = array(root.warnings, 512).map((v) => {
    const w = obj(v);
    return {
      part: text(w.part, 40),
      measure: integer(w.measure, 0, 32000),
      code: text(w.code, 80),
    };
  });
  if (warnings.some((w) => w.code === 'LIMIT_EXCEEDED'))
    fail('전체 악보가 인식 한도를 초과했어요. PDF를 나눠주세요.');
  return {
    bpm: root.bpm as number | null,
    key: root.key as number | null,
    parts: parts as Part[],
    warnings,
  };
}

export function convertRecognition(raw: unknown, pageCount: number, title: string) {
  const grouped = validateRecognition(raw, pageCount);
  const original = validateRecognition(
    {
      ...grouped,
      parts: grouped.parts.map((p) => ({
        ...p,
        measures: p.measures.flatMap((m) =>
          Array.from({ length: m.restCount ?? 1 }, (_, i) => ({
            ...m,
            number: m.number + i,
            restCount: null,
            events: m.events,
          })),
        ),
      })),
    },
    pageCount,
  );
  const recognized = original.parts.filter((p) => p.measures.length > 0);
  if (!recognized.length)
    fail(
      `인식된 마디가 없어요. ${original.parts.map((p) => p.name).join(', ')} 파트의 음표를 읽지 못했습니다. PDF가 빈 파일이라는 뜻은 아닙니다.`,
    );
  const numbers = recognized.flatMap((p) => p.measures.map((m) => m.number));
  const sourceStartMeasure = Math.min(...numbers);
  if (Math.max(...numbers) - sourceStartMeasure + 1 > 128)
    fail('인식된 악보 구간이 128마디를 초과합니다. PDF를 나눠주세요.');
  // Keep original written numbers in the recognition data for targeted reanalysis;
  // the editable project starts at bar 1 even for an extracted middle PDF page.
  const data: RecognitionData = {
    ...original,
    parts: recognized.map((p) => ({
      ...p,
      measures: p.measures.map((m) => ({ ...m, number: m.number - sourceStartMeasure + 1 })),
    })),
    warnings: original.warnings.map((w) => ({
      ...w,
      measure: w.measure ? Math.max(0, w.measure - sourceStartMeasure + 1) : 0,
    })),
  };
  const warnings = data.warnings.map((w) => ({
    ...w,
    part: data.parts.find((p) => p.id === w.part)?.name ?? w.part,
  }));
  const warn = (part: string, measure: number, code: string) => {
    if (
      warnings.length < 512 &&
      !warnings.some((w) => w.part === part && w.measure === measure && w.code === code)
    )
      warnings.push({ part, measure, code });
  };
  for (const p of original.parts.filter((p) => !p.measures.length))
    warn(p.name, 0, 'NO_MEASURES_PART');
  if (sourceStartMeasure !== 1) warn('', 1, 'MEASURE_NUMBER_REBASED');
  if (data.bpm === null) warn('', 0, 'BPM_DEFAULT_120');
  if (data.key === null) warn('', 0, 'KEY_DEFAULT_C');
  const meters = new Map<number, number[]>();
  let bars = 0;
  for (const p of data.parts)
    for (const m of p.measures) {
      const old = meters.get(m.number);
      if (old && old.join('/') !== m.meter.join('/'))
        fail(`${m.number}마디의 파트별 박자가 다릅니다.`);
      meters.set(m.number, m.meter);
      bars = Math.max(bars, m.number);
    }
  const first = meters.get(1);
  if (!first) fail('첫 마디가 없습니다.');
  // Omitted TAB systems retain their written duration and inherit the last meter.
  let inheritedMeter = first!;
  for (let number = 1; number <= bars; number++) {
    inheritedMeter = meters.get(number) ?? inheritedMeter;
    if (!meters.has(number)) meters.set(number, inheritedMeter);
  }
  // Preserve overfull estimated bars without shifting another part's bar numbers.
  const extended = new Map<number, number>();
  for (const p of data.parts)
    for (const m of p.measures) {
      if (m.reading !== 'estimated') continue;
      const duration = Math.max(
        ((m.meter[0] * 4) / m.meter[1]) * 48,
        ...m.events.map((e) => fraction(e.onset) + fraction(e.duration, true)),
      );
      extended.set(m.number, Math.max(extended.get(m.number) ?? 0, duration));
    }
  const score: ConvertedScore = {
    title: title.slice(0, 1000),
    bpm: data.bpm ?? 120,
    keySignature: data.key ?? 0,
    timeSignature: { beats: first![0], beatType: first![1] },
    parts: [],
    notes: [],
    sync: {},
    instruments: {},
    capos: {},
    keyboardStaves: {},
    drumVoices: {},
    measureLengths: {},
  };
  const names = new Set<string>();
  const unique = (name: string) => {
    let result = name.trim().slice(0, 32) || 'Part';
    const base = result;
    let i = 2;
    while (names.has(result) || ['__proto__', 'constructor', 'prototype'].includes(result))
      result = `${base} ${i++}`;
    names.add(result);
    return result;
  };
  for (const p of data.parts) {
    const main = unique(p.name),
      secondary =
        p.instrument === 'piano'
          ? unique(`${main} LH`)
          : p.instrument === 'drums'
            ? unique(`${main} Lower`)
            : null;
    if (secondary)
      (p.instrument === 'piano' ? score.keyboardStaves : score.drumVoices)[main] = secondary;
    const lanes = [main, ...(secondary ? [secondary] : [])];
    score.parts.push(...lanes);
    for (const lane of lanes) {
      score.instruments[lane] =
        p.instrument === 'piano' && lane === secondary ? 'pianoBass' : p.instrument;
      if (p.capo && tunings[p.instrument].length) score.capos[lane] = p.capo;
      score.measureLengths[lane] = {};
      const output: { note: Note; tie: string; tech: string[]; bar: number }[] = [];
      const append = (ticks: number, tones: Tone[], bar: number, event?: Event) => {
        if (!ticks) return;
        if (score.notes.length + output.length >= 2000)
          fail('쉼표를 포함한 악보 크기가 2,000개를 초과합니다. PDF를 나눠주세요.');
        const beats = ticks / 48;
        output.push({
          note: {
            id: randomUUID(),
            part: lane,
            pitch: tones[0]?.pitch ?? 60,
            beats,
            rest: !tones.length,
            tones,
            accent: event?.techniques.includes('accent') ?? false,
            chord: '',
            lyric: '',
            ...([8, 16, 32, 64, 128].includes(ticks) ? { tuplet: 3 as const } : {}),
          },
          tie: event?.tie ?? 'none',
          tech: event?.techniques ?? [],
          bar,
        });
      };
      for (let number = 1; number <= bars; number++) {
        const m = p.measures.find((m) => m.number === number);
        const meter = meters.get(number) ?? first!;
        const writtenCapacity = ((meter[0] * 4) / meter[1]) * 48;
        const capacity = Math.max(writtenCapacity, extended.get(number) ?? 0);
        if (capacity > writtenCapacity)
          warn(
            main,
            number,
            m?.reading === 'estimated' ? 'ESTIMATED_BAR_OVERFLOW' : 'ESTIMATED_BAR_ALIGNMENT',
          );
        if (meter.join('/') !== first!.join('/')) warn(main, number, 'METER_CHANGE_TIMING_ONLY');
        score.measureLengths[lane][number - 1] = capacity / 48;
        const isSecondary = lane === secondary;
        const rawEvents = (m?.events ?? []).filter((e) => {
          const second =
            p.instrument === 'piano'
              ? e.staff === 'left'
              : p.instrument === 'drums' && e.staff === 'lower';
          if (!secondary && e.staff !== 'main') fail(`${main}: 지원하지 않는 보표 구성입니다.`);
          return Boolean(second) === isSecondary;
        });
        // Equal-length simultaneous events from separate voices form one chord.
        const groups = new Map<string, Event>();
        for (const e of rawEvents) {
          const key = `${fraction(e.onset)}:${fraction(e.duration, true)}`,
            old = groups.get(key);
          if (old) {
            if (old.tie !== e.tie) warn(main, number, 'PARTIAL_CHORD_TIE');
            groups.set(key, {
              ...old,
              notes: [...old.notes, ...e.notes],
              techniques: [...new Set([...old.techniques, ...e.techniques])],
            });
          } else groups.set(key, { ...e });
        }
        const events = [...groups.values()].sort((a, b) => fraction(a.onset) - fraction(b.onset));
        let at = 0;
        for (const e of events) {
          const start = fraction(e.onset),
            length = fraction(e.duration, true);
          if (start < at)
            fail(`${main} ${number}마디에 서로 겹치는 성부가 있습니다. PDF의 성부를 확인해주세요.`);
          if (start > at) {
            append(start - at, [], number);
            warn(main, number, 'GAP_FILLED_WITH_REST');
          }
          const tones = e.notes.map((n) => {
            const tuning = tunings[p.instrument];
            let pitch = n.pitch;
            const tone: Tone = { pitch: 0 };
            const dead =
              n.dead === true ||
              (n.dead === undefined && e.techniques.includes('ghost') && !!tuning.length);
            if (dead && tuning.length) {
              if (n.string === null || n.string > tuning.length)
                fail(`${main} ${number}마디의 고스트노트 줄 번호를 확인해주세요.`);
              // Editor storage requires a numeric pitch/fret even for X. These
              // placeholders are not recognized pitches and render as X via dead.
              const string = integer(n.string, 1, tuning.length);
              tone.string = string;
              tone.fret = 0;
              tone.dead = true;
              pitch = tuning[string - 1] + p.capo;
            } else if (dead) {
              fail('타브 고스트노트는 줄이 있는 악기에만 적용할 수 있어요.');
            } else if (tuning.length && n.string !== null && n.fret !== null) {
              if (n.string > tuning.length) fail(`${main}: 줄 번호가 악기의 줄 수를 초과합니다.`);
              const expected = tuning[n.string - 1] + n.fret + p.capo;
              if (
                pitch !== null &&
                pitch !== expected &&
                !e.techniques.includes('natural-harmonic') &&
                !e.techniques.includes('pinch-harmonic')
              )
                warn(main, number, 'TAB_PITCH_MISMATCH');
              pitch = expected;
              tone.string = n.string;
              tone.fret = n.fret;
            } else if (tuning.length) warn(main, number, 'TAB_POSITION_MISSING');
            if (pitch === null) fail(`${main} ${number}마디에 음높이가 없는 음표가 있습니다.`);
            tone.pitch = integer(pitch, 0, 127);
            if (p.instrument === 'drums') {
              if (n.drum === 'snare-rimshot' && tone.pitch === 38) tone.drumTechnique = 'rimshot';
              const roll = /^(?:snare|tom)-(roll[23])$/.exec(n.drum ?? '')?.[1];
              if (roll && [38, 50, 47, 48, 43, 45, 41].includes(tone.pitch))
                tone.drumTechnique = roll as 'roll2' | 'roll3';
            }
            if (p.instrument === 'drums' && !supportedDrumPitches.includes(tone.pitch))
              warn(main, number, 'DRUM_MAPPING_REVIEW');
            for (const t of e.techniques) {
              if (t === 'ghost') {
                if (tuning.length && n.dead === undefined) tone.dead = true;
                tone.ghost = !tuning.length;
              } else if (t === 'palm-mute' && tuning.length) tone.palmMute = true;
              else if (t === 'vibrato' && tuning.length) tone.vibrato = true;
              else if (
                t === 'natural-harmonic' &&
                tuning.length &&
                n.fret !== null &&
                [3, 4, 5, 7, 9, 12, 16, 19, 24].includes(n.fret)
              )
                tone.harmonic = 'natural';
              else if (t === 'pinch-harmonic' && tuning.length) tone.harmonic = 'pinch';
              else if (
                ['bend', 'release', 'prebend', 'prebend-release'].includes(t) &&
                tuning.length
              ) {
                tone.bend = { kind: t as 'bend', amount: 2 };
                warn(main, number, 'TECHNIQUE_DEFAULTS');
              } else if ((t === 'thumb' || t === 'pluck') && p.instrument.startsWith('bass'))
                tone.bassTechnique = t;
              else if (!['accent', 'slide-up', 'slide-down', 'hammer', 'pull'].includes(t))
                warn(main, number, 'TECHNIQUE_REVIEW');
            }
            if ([tone.palmMute, tone.harmonic, tone.bend].filter(Boolean).length > 1) {
              delete tone.harmonic;
              delete tone.bend;
              warn(main, number, 'TECHNIQUE_CONFLICT');
            }
            return tone;
          });
          if (tones.length > 16) fail('한 박자의 동시 음표가 16개를 초과합니다.');
          if (
            tones.filter((t) => t.string).length !==
            new Set(tones.filter((t) => t.string).map((t) => t.string)).size
          )
            fail(`${main} ${number}마디에 같은 줄의 음표가 겹칩니다.`);
          append(length, tones, number, e);
          at = start + length;
        }
        if (at < capacity) {
          append(capacity - at, [], number);
          if (m && events.length) warn(main, number, 'GAP_FILLED_WITH_REST');
        }
        if (!m) warn(main, number, 'MISSING_MEASURE_REST');
      }
      for (let i = 0; i < output.length; i++) {
        const row = output[i],
          next = output[i + 1];
        if (row.tie === 'start' || row.tie === 'continue') {
          if (
            next &&
            !row.note.rest &&
            !next.note.rest &&
            row.note.tones
              .map((t) => t.pitch)
              .sort((a, b) => a - b)
              .join(',') ===
              next.note.tones
                .map((t) => t.pitch)
                .sort((a, b) => a - b)
                .join(',')
          )
            row.note.connection = { type: 'tie', targetId: next.note.id };
          else warn(main, row.bar, 'TIE_REVIEW');
        } else if (
          (row.tech.includes('hammer') ||
            row.tech.includes('pull') ||
            row.tech.includes('slide-up') ||
            row.tech.includes('slide-down')) &&
          next &&
          row.note.tones.length === 1 &&
          next.note.tones.length === 1 &&
          row.note.tones[0].string !== undefined &&
          row.note.tones[0].string === next.note.tones[0].string
        )
          row.note.connection = {
            type: row.tech.includes('hammer')
              ? 'hammer'
              : row.tech.includes('pull')
                ? 'pull'
                : 'slide',
            targetId: next.note.id,
          };
        else if (row.tech.includes('slide-up') || row.tech.includes('slide-down'))
          row.note.slideIn = row.tech.includes('slide-up') ? 'up' : 'down';
        if (!row.note.connection && (row.tech.includes('hammer') || row.tech.includes('pull')))
          warn(main, row.bar, 'CONNECTION_REVIEW');
      }
      // Keep the same connection constraints as the editor's document validator.
      for (let i = 0; i < output.length; i++) {
        const row = output[i],
          n = row.note,
          next = output[i + 1]?.note;
        if (n.slideIn && (n.rest || n.tones.length !== 1 || n.tones.some((t) => t.dead))) {
          delete n.slideIn;
          warn(main, row.bar, 'SLIDE_REVIEW');
        }
        if (!n.connection || !next) continue;
        const tones = [...n.tones, ...next.tones],
          type = n.connection.type;
        if (type === 'tie') {
          if (tones.some((t) => t.dead || t.bend || t.harmonic))
            fail(
              `${main} ${row.bar}마디: 붙임줄과 벤딩·하모닉스가 겹쳐 현재 편집기에서 표현할 수 없어요.`,
            );
          if (tones.some((t) => t.palmMute)) {
            tones.forEach((t) => delete t.palmMute);
            warn(main, row.bar, 'TECHNIQUE_DROPPED_FOR_TIE');
          }
        }
        if (
          next.slideIn ||
          tones.some((t) => t.dead || t.bend || t.harmonic || t.palmMute) ||
          (type === 'hammer' && n.pitch >= next.pitch) ||
          (type === 'pull' && n.pitch <= next.pitch) ||
          (type === 'slide' && n.pitch === next.pitch)
        ) {
          delete n.connection;
          warn(main, row.bar, 'CONNECTION_REVIEW');
        }
      }
      score.notes.push(...output.map((r) => r.note));
    }
  }
  if (
    !score.notes.some((n) => !n.rest) &&
    !grouped.parts.some((p) => p.measures.some((m) => (m.restCount ?? 0) > 1))
  )
    fail('인식된 음표가 없습니다.');
  return { score, warnings, data: original, measures: bars, sourceStartMeasure };
}

export function mergeRecognition(
  previous: RecognitionData,
  patch: unknown,
  target: { page: number; measure?: number },
  pages: number,
) {
  const next = validateRecognition(patch, pages);
  const isTarget = (m: Measure) =>
    m.page === target.page && (target.measure === undefined || m.number === target.measure);
  if (next.parts.some((p) => p.measures.some((m) => !isTarget(m))))
    fail('재분석 결과가 요청한 범위를 벗어났어요.');
  if (
    next.parts.some(
      (p) =>
        !previous.parts.some(
          (old) => old.id === p.id && old.instrument === p.instrument && old.capo === p.capo,
        ),
    )
  )
    fail('재분석 파트 ID가 기존 결과와 다릅니다.');
  for (const p of previous.parts)
    for (const m of p.measures.filter(isTarget))
      if (!next.parts.find((n) => n.id === p.id)?.measures.some((n) => n.number === m.number))
        fail('재분석에서 기존 마디가 누락됐어요.');
  return {
    ...previous,
    warnings: [
      ...previous.warnings.filter(
        (w) =>
          !previous.parts
            .find((p) => p.id === w.part)
            ?.measures.some((m) => m.number === w.measure && isTarget(m)),
      ),
      ...next.warnings,
    ],
    parts: previous.parts.map((p) => ({
      ...p,
      measures: [
        ...p.measures.filter((m) => !isTarget(m)),
        ...(next.parts.find((n) => n.id === p.id)?.measures ?? []),
      ].sort((a, b) => a.number - b.number),
    })),
  };
}
