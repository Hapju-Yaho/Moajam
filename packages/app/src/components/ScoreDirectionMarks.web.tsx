import type { Score } from '../lib/score';
import {
  directionOwner,
  directionWords,
  navigationWords,
  directionAt,
  dynamicLevels,
} from '../lib/scoreExpression';
export function ScoreDirectionMarks({
  score,
  part,
  bar,
  width,
  baseline,
  repeatPattern,
  xAt,
  barBeats,
}: {
  score: Score;
  part: string;
  bar: number;
  width: number;
  baseline: number;
  repeatPattern: boolean;
  xAt: (offset: number) => number;
  barBeats: number;
}) {
  const owner = directionOwner(score, part),
    d = score.directions?.[owner]?.[bar],
    n = score.navigation?.[bar];
  const words = [...directionWords(d), ...navigationWords(n)];
  const entries = Object.entries(score.directions?.[owner] ?? {});
  const ranges = entries.flatMap(([key, entry]) => [
    ...(entry.swell
      ? [
          {
            start: +key,
            end: entry.swell.endBar,
            from: directionAt(score, part, +key).gain,
            to: entry.swell.to,
          },
        ]
      : []),
    ...(entry.swells ?? []).map((range) => ({
      start: +key + range.startOffset,
      end: range.endBar + range.endOffset,
      from: range.from,
      to: range.to,
    })),
  ]);
  const changes = [
    ...entries.filter(([, entry]) => entry.dynamic).map(([key]) => +key),
    ...ranges.map((range) => range.start),
  ];
  const visibleRanges = ranges
    .map((range) => ({
      ...range,
      visibleEnd: Math.min(range.end, ...changes.filter((at) => at > range.start)),
    }))
    .filter((range) => range.start < bar + 1 && range.visibleEnd > bar);
  return (
    <g data-score-directions={bar} fill="currentColor" pointerEvents="none">
      {words.map((word, index) => (
        <text
          key={word}
          x="12"
          y={baseline - (words.length - 1 - index) * 16}
          fontSize="13"
          fontWeight="600"
        >
          {word}
        </text>
      ))}
      {n?.ending && (
        <g aria-label={`${n.ending}번 괄호`}>
          <path d={`M2 42V30H${width - 2}V42`} fill="none" stroke="currentColor" />
          <text x="9" y="44" fontSize="12">
            {n.ending}.
          </text>
        </g>
      )}
      {visibleRanges.map((range, index) => {
        const start = Math.max(bar, range.start),
          end = Math.min(bar + 1, range.visibleEnd);
        const crescendo = dynamicLevels[range.to] > range.from;
        const a = (start - range.start) / (range.end - range.start),
          b = (end - range.start) / (range.end - range.start);
        const left = 8 * (crescendo ? a : 1 - a),
          right = 8 * (crescendo ? b : 1 - b);
        const x1 = start === bar ? 2 : xAt((start - bar) * barBeats);
        const x2 = end === bar + 1 ? width - 2 : xAt((end - bar) * barBeats);
        return (
          <g key={index}>
            <path
              aria-label={crescendo ? '크레셴도' : '디크레셴도'}
              data-swell-start={range.start}
              data-swell-end={range.visibleEnd}
              d={`M${x1} ${174 - left}L${x2} ${174 - right}M${x1} ${174 + left}L${x2} ${174 + right}`}
              fill="none"
              stroke="currentColor"
            />
            {end === range.end && (
              <text x={x2} y="187" textAnchor="end" fontSize="12" fontStyle="italic">
                {range.to}
              </text>
            )}
          </g>
        );
      })}
      {repeatPattern && (
        <text
          aria-label="앞 마디 반복 기호"
          x={width / 2}
          y="112"
          textAnchor="middle"
          fontSize="32"
        >
          %
        </text>
      )}
    </g>
  );
}
