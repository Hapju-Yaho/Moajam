import { writtenScoreBeats, type Score, type ScoreFragment } from './score';
import { scoreSilentMeasures as drumSilentMeasures } from './scoreMeasureRests';
export {
  scoreSilentMeasures as drumSilentMeasures,
  scoreCompactSystems as drumCompactSystems,
  inputScoreMeasureRest as inputDrumMeasureRest,
  clearScoreMeasureRest as clearDrumMeasureRest,
  scoreMeasureRestBars as drumMeasureRestBars,
  deleteScoreMeasureRest as deleteDrumMeasureRest,
  scoreRestSystems as drumScoreSystems,
} from './scoreMeasureRests';

// Preserve each entered rest, including dotted and tuplet durations.
export function drumRestGroups(fragments: ScoreFragment[], duration: number, measureRest = false) {
  return fragments
    .filter((f) => f.note.rest && !f.note.blank)
    .map((fragment) => ({
      offset: fragment.offset,
      beats: writtenScoreBeats(fragment.note, fragment.beats),
      whole:
        fragments.length === 1 &&
        fragment.offset === 0 &&
        fragment.beats === duration &&
        (fragment.beats === 4 || measureRest) &&
        !fragment.note.tuplet,
    }));
}

export function setDrumMultiMeasureRest(
  score: Score,
  part: string,
  start: number,
  count: number,
): Score {
  const pair = Object.entries(score.drumVoices ?? {}).find((pair) => pair.includes(part));
  if (!pair) throw new Error('먼저 드럼의 독립 성부를 사용해주세요.');
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    start >= 32000 ||
    !Number.isInteger(count) ||
    (count !== 0 && (count < 2 || count > 128 || start + count > 32000))
  )
    throw new Error('시작 마디와 2~128개의 마디 수를 입력해주세요.');
  const groups = { ...score.multiMeasureRests?.[pair[0]] };
  if (count === 0) delete groups[start];
  else {
    if (
      !drumSilentMeasures(score, pair, start + count)
        .slice(start)
        .every(Boolean)
    )
      throw new Error(
        '모든 성부가 쉬는 연속된 마디만 묶을 수 있어요. 먼저 쉼표로 마디를 채워주세요.',
      );
    if (
      Object.entries(groups).some(
        ([bar, span]) => +bar !== start && +bar < start + count && +bar + span > start,
      )
    )
      throw new Error('이미 설정한 여러 마디 쉼표와 범위가 겹쳐요. 기존 묶음을 먼저 해제해주세요.');
    groups[start] = count;
  }
  return { ...score, multiMeasureRests: { ...score.multiMeasureRests, [pair[0]]: groups } };
}
