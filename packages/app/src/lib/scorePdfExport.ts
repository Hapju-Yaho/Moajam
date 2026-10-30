import { removeScorePart, type Score } from './score';
import { scorePartOwner, scorePartStaves, scoreVisibleParts } from './scoreParts';
import { scoreFileName } from './scoreFile';

/** One file per logical instrument; keep piano hands/drum voices together. */
export function scorePdfExportFiles(score: Score, name: string, extension: string) {
  const owners = scoreVisibleParts(score);
  const base = (name.trim() || score.title)
    .replace(/\.(moajam|musicxml|xml|midi|mid)$/i, '')
    .slice(0, 55);
  const used = new Set<string>();
  return owners.map((owner) => {
    const stem = `${base}${owners.length > 1 ? `_${owner.slice(0, 38)}` : ''}`;
    let fileName = scoreFileName(stem, extension),
      index = 2;
    while (used.has(fileName.toLowerCase()))
      fileName = scoreFileName(`${stem}_${index++}`, extension);
    used.add(fileName.toLowerCase());
    return { owner, name: fileName };
  });
}

export function isolateScorePdfPart(score: Score, part: string): Score {
  if (!score.parts.includes(part)) throw new Error('출력할 파트를 선택해주세요.');
  const keep = new Set(scorePartStaves(score, scorePartOwner(score, part)));
  let result = score;
  for (const other of score.parts) if (!keep.has(other)) result = removeScorePart(result, other);
  return result;
}
