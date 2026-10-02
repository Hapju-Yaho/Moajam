import {
  cleanScoreConnections,
  scoreConnectionLabels,
  scoreInstruments,
  SCORE_DIVISIONS,
  type Score,
  type ScoreNote,
  type ScoreTone,
} from './score';
import { MIN_SAMPLE_REGION, type InstrumentSample } from './samplePitch';
import { isSoundfontInstrument } from './soundfontCatalog';

export type ScoreDocument = {
  score: Score;
  referenceAudio: Blob | null;
  instrumentSample: InstrumentSample | null;
};
export const MAX_SCORE_FILE_BYTES = 160 * 1024 * 1024;
const invalid = () => new Error('올바른 모아잼 악보 파일이 아니거나 파일 내용이 손상됐어요.');
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw invalid();
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw invalid();
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  const result = number(value, min, max);
  if (!Number.isInteger(result)) throw invalid();
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid();
  return value;
}
function tone(value: unknown): ScoreTone {
  const row = record(value);
  return {
    pitch: integer(row.pitch, 0, 127),
    ...(row.string === undefined ? {} : { string: integer(row.string, 1, 6) }),
    ...(row.fret === undefined ? {} : { fret: integer(row.fret, 0, 36) }),
    ...(row.ghost === undefined ? {} : { ghost: boolean(row.ghost) }),
    ...(row.dead === undefined ? {} : { dead: boolean(row.dead) }),
  };
}
function map<T>(
  value: unknown,
  validKey: (key: string) => boolean,
  parse: (value: unknown) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, item]) => {
      if (!validKey(key)) throw invalid();
      return [key, parse(item)];
    }),
  );
}

export function validateScoreDocument(value: unknown): Score {
  const row = record(value);
  if (!Array.isArray(row.parts) || !row.parts.length || row.parts.length > 16) throw invalid();
  const parts = row.parts.map((part) => text(part, 40));
  if (parts.some((part) => !part.trim()) || new Set(parts).size !== parts.length) throw invalid();
  if (!Array.isArray(row.notes) || row.notes.length > 2000) throw invalid();
  const ids = new Set<string>();
  const notes = row.notes.map((value): ScoreNote => {
    const n = record(value);
    const id = text(n.id, 200),
      part = text(n.part, 40);
    if (!id || ids.has(id) || !parts.includes(part)) throw invalid();
    ids.add(id);
    const beats = number(n.beats, 1 / SCORE_DIVISIONS, 64);
    if (!Number.isInteger(beats * SCORE_DIVISIONS)) throw invalid();
    const note: ScoreNote = {
      id,
      part,
      pitch: integer(n.pitch, 0, 127),
      beats,
      rest: boolean(n.rest),
      accent: boolean(n.accent),
      chord: text(n.chord, 1000),
      lyric: text(n.lyric, 10000),
    };
    for (const key of ['blank', 'ghost', 'dead', 'staccato'] as const)
      if (n[key] !== undefined) note[key] = boolean(n[key]);
    if (n.tones !== undefined) {
      if (!Array.isArray(n.tones) || n.tones.length > 16) throw invalid();
      note.tones = n.tones.map(tone);
    }
    if (n.connection !== undefined) {
      const connection = record(n.connection);
      const type = text(connection.type, 20);
      if (!Object.hasOwn(scoreConnectionLabels, type)) throw invalid();
      note.connection = {
        type: type as NonNullable<ScoreNote['connection']>['type'],
        targetId: text(connection.targetId, 200),
      };
    }
    return note;
  });
  const score: Score = {
    title: text(row.title, 1000),
    bpm: number(row.bpm, 30, 300),
    parts,
    notes,
    sync: map(
      row.sync,
      (id) => ids.has(id),
      (time) => number(time, 0, 36000),
    ),
  };
  const isPart = (key: string) => parts.includes(key);
  if (row.playbackInstruments !== undefined)
    score.playbackInstruments = map(row.playbackInstruments, isPart, (value) => {
      if (!isSoundfontInstrument(value)) throw invalid();
      return value;
    });
  if (row.instruments !== undefined)
    score.instruments = map(row.instruments, isPart, (value) => {
      const id = text(value, 40);
      if (!Object.hasOwn(scoreInstruments, id)) throw invalid();
      return id;
    });
  if (row.systemLayout !== undefined)
    score.systemLayout = map(row.systemLayout, isPart, (value) => {
      if (!Array.isArray(value) || value.length > 32000) throw invalid();
      return value.map((n) => integer(n, 1, 16));
    });
  if (row.equalWidthRows !== undefined)
    score.equalWidthRows = map(row.equalWidthRows, isPart, (value) => {
      if (!Array.isArray(value) || value.length > 32000) throw invalid();
      return [...new Set(value.map((n) => integer(n, 0, 31999)))];
    });
  for (const key of ['measureChords', 'beatChords'] as const) {
    if (row[key] !== undefined)
      score[key] = map(row[key], isPart, (value) =>
        map(
          value,
          (keyName) => {
            const beat = Number(keyName);
            return (
              keyName.trim() !== '' &&
              Number.isFinite(beat) &&
              beat >= 0 &&
              beat < (key === 'measureChords' ? 32000 : 128000) &&
              Number.isInteger(beat * (key === 'measureChords' ? 1 : SCORE_DIVISIONS))
            );
          },
          (chord) => text(chord, 1000),
        ),
      );
  }
  for (const key of ['playbackVolume', 'referenceAudioVolume'] as const)
    if (row[key] !== undefined) score[key] = number(row[key], 0, 1);
  if (row.referenceAudioName !== undefined)
    score.referenceAudioName = text(row.referenceAudioName, 1000);
  if (row.referenceAudioEnabled !== undefined)
    score.referenceAudioEnabled = boolean(row.referenceAudioEnabled);
  if (row.referenceAudioOffset !== undefined)
    score.referenceAudioOffset = number(row.referenceAudioOffset, -36000, 36000);
  const cleaned = cleanScoreConnections(score);
  if (cleaned !== score) throw invalid();
  return score;
}

type AudioFile = { type: string; data: string };
async function encodeAudio(blob: Blob | null, max: number): Promise<AudioFile | null> {
  if (!blob) return null;
  if (!blob.size || blob.size > max) throw invalid();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return { type: blob.type, data: btoa(chunks.join('')) };
}
function decodeAudio(value: unknown, max: number): Blob | null {
  if (value === null) return null;
  const row = record(value);
  const type = text(row.type, 120);
  if (
    type &&
    !/^audio\/[a-z0-9.+-]+(?:;[\w =.-]+)?$/i.test(type) &&
    !['application/octet-stream', 'application/ogg', 'video/webm', 'video/mp4'].includes(type)
  )
    throw invalid();
  const data = text(row.data, Math.ceil(max / 3) * 4);
  if (!data.length || data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data)) throw invalid();
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw invalid();
  }
  if (!binary.length || binary.length > max) throw invalid();
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type });
}

export async function serializeScoreFile(document: ScoreDocument): Promise<string> {
  const score = validateScoreDocument(document.score);
  const sample = document.instrumentSample;
  const file = {
    format: 'moajam-score-file',
    version: 1,
    score,
    referenceAudio: await encodeAudio(document.referenceAudio, 100 * 1024 * 1024),
    instrumentSample: sample
      ? { ...sample, file: await encodeAudio(sample.file, 10 * 1024 * 1024) }
      : null,
  };
  const content = JSON.stringify(file);
  if (new Blob([content]).size > MAX_SCORE_FILE_BYTES)
    throw new Error('악보 파일이 160MB를 넘어요. 연결된 음원을 줄인 뒤 다시 저장해주세요.');
  return content;
}

export function parseScoreFile(content: string): ScoreDocument {
  if (content.length > MAX_SCORE_FILE_BYTES)
    throw new Error('160MB 이하의 악보 파일을 선택해주세요.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content, (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw invalid();
      return value;
    });
  } catch {
    throw invalid();
  }
  const file = record(parsed);
  if (file.format !== 'moajam-score-file') throw invalid();
  if (file.version !== 1)
    throw new Error('이 버전의 악보 파일은 지원하지 않아요. 최신 모아잼에서 열어주세요.');
  const score = validateScoreDocument(file.score);
  const referenceAudio = decodeAudio(file.referenceAudio, 100 * 1024 * 1024);
  let instrumentSample: InstrumentSample | null = null;
  if (file.instrumentSample !== null) {
    const sample = record(file.instrumentSample);
    const audio = decodeAudio(sample.file, 10 * 1024 * 1024);
    if (!audio) throw invalid();
    instrumentSample = {
      file: audio,
      name: text(sample.name, 1000),
      rootMidi: sample.rootMidi === null ? null : number(sample.rootMidi, 0, 127),
      enabled: boolean(sample.enabled),
      sustain: boolean(sample.sustain),
      ...(sample.autoRoot === undefined ? {} : { autoRoot: boolean(sample.autoRoot) }),
      ...(sample.trimStart === undefined && sample.trimEnd === undefined
        ? {}
        : {
            trimStart: number(sample.trimStart, 0, 15),
            trimEnd: number(sample.trimEnd, 0, 15),
          }),
    };
    if (
      instrumentSample.trimStart !== undefined &&
      instrumentSample.trimEnd! - instrumentSample.trimStart < MIN_SAMPLE_REGION - 1e-6
    )
      throw invalid();
  }
  return { score, referenceAudio, instrumentSample };
}

export function scoreFileName(title: string, extension: string): string {
  return `${
    title
      .replace(/[<>:"/\\|?*]/g, '_')
      .split('')
      .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('')
      .trim()
      .slice(0, 100) || '나의 악보'
  }.${extension}`;
}
