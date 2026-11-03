import { RecognitionError } from './pdf-recognition.client.js';

export type MeasureRepeat = {
  start: boolean;
  end: { target: number; times: number } | null;
  ending: { passes: number[]; end: number } | null;
};

export function readMeasureRepeat(value: unknown, number: number, last: number, first: number, barEnd = number): MeasureRepeat | null {
  if (value == null) return null; // Existing saved PDFs have no repetition metadata.
  const fail = (): never => { throw new RecognitionError('STRUCTURE_VALIDATION', `${number}마디의 반복 설정을 확인해주세요.`); };
  if (typeof value !== 'object' || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  if (typeof raw.start !== 'boolean') return fail();
  const result: MeasureRepeat = { start: raw.start, end: null, ending: null };
  if (raw.end != null) {
    const end = raw.end as { target: number; times: number };
    if (!Number.isInteger(end.target) || end.target < first || end.target > barEnd || !Number.isInteger(end.times) || end.times < 2 || end.times > 8) return fail();
    result.end = { target: end.target, times: end.times };
  }
  if (raw.ending != null) {
    const ending = raw.ending as { passes: number[]; end: number };
    if (!Array.isArray(ending.passes) || !ending.passes.length || ending.passes.length > 8 || ending.passes.some((pass) => !Number.isInteger(pass) || pass < 1 || pass > 8) || !Number.isInteger(ending.end) || ending.end < number || ending.end > last) return fail();
    result.ending = { passes: [...new Set(ending.passes)].sort((a, b) => a - b), end: ending.end };
  }
  return result;
}
