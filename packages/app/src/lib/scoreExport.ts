import { editScoreMeasure, scoreMeasureCount, type Score } from './score';
import { scorePartStaves } from './scoreParts';
import { scoreFileName } from './scoreFile';

export type ScoreExportOptions = {
  parts: string[];
  from: number;
  to: number;
  tab: boolean;
  ensemble: boolean;
  tabOnly?: boolean;
  name?: string;
};
export function scoreExportMeasureCount(score: Score) {
  return Math.max(1, ...score.parts.map((part) => scoreMeasureCount(score, part)));
}
export function scoreExportFiles(
  score: Score,
  options: ScoreExportOptions,
  extension: 'pdf' | 'midi',
) {
  const owners = [...new Set(options.parts)].filter((part) => score.parts.includes(part));
  const base = (options.name?.trim() || score.title).replace(/\.(pdf|midi|mid)$/i, '');
  return owners.map((owner) => ({
    parts: scorePartStaves(score, owner),
    name: scoreFileName(`${base}${owners.length > 1 ? `_${owner}` : ''}`, extension),
  }));
}
export function clampScoreExportRange(
  from: string | number,
  to: string | number,
  count: number,
  changed: 'from' | 'to' = 'to',
) {
  const value = (input: string | number, fallback: number) => {
    const n = String(input).trim() ? Number(input) : fallback;
    return Math.max(1, Math.min(count, Number.isFinite(n) ? Math.round(n) : fallback));
  };
  let first = value(from, 1),
    last = value(to, count);
  if (first > last) {
    if (changed === 'from') last = first;
    else first = last;
  }
  return { from: first, to: last };
}
export function prepareScoreExport(score: Score, options: ScoreExportOptions) {
  const count = scoreExportMeasureCount(score);
  const range = clampScoreExportRange(options.from, options.to, count);
  const parts = [...new Set(options.parts.flatMap((part) => scorePartStaves(score, part)))].filter(
    (part) => score.parts.includes(part),
  );
  if (!parts.length) throw new Error('출력할 파트를 하나 이상 선택해주세요.');
  let result = score;
  let id = 0;
  for (let bar = count - 1; bar >= range.to; bar--)
    result = editScoreMeasure(result, bar, 'delete', () => `export/${id++}`);
  for (let bar = range.from - 2; bar >= 0; bar--)
    result = editScoreMeasure(result, bar, 'delete', () => `export/${id++}`);
  return { score: result, parts };
}
