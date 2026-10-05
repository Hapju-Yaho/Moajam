import { scoreRhythmFeels, type Score } from '../lib/score';

// Share vector notation between the live score and PDF export.
export function ScoreRhythmFeel({
  feel,
  x,
  y,
}: {
  feel: NonNullable<Score['rhythmFeel']>;
  x: number;
  y: number;
}) {
  if (feel === 'straight') return null;
  const setting = scoreRhythmFeels[feel];
  const flags = setting.unit === 0.5 ? 1 : 2;
  const triplet = setting.first === 2;
  const scottish = setting.first === 1;
  const rightFlags = triplet
    ? [flags - 1, flags]
    : scottish
      ? [flags + 1, flags]
      : [flags, flags + 1];
  const pair = (start: number, counts: number[], dot = -1) => (
    <g>
      {counts.map((count, index) => {
        const cx = start + index * 24;
        return (
          <g key={index}>
            <ellipse
              cx={cx}
              cy="28"
              rx="3.5"
              ry="2.4"
              transform={`rotate(-18 ${cx} 28)`}
              stroke="none"
            />
            <path d={`M${cx + 3} 28V12`} fill="none" />
            {Math.min(...counts) === 0 &&
              Array.from({ length: count }, (_, flag) => (
                <path key={flag} d={`M${cx + 3} ${12 + flag * 4}q9 5 5 12`} fill="none" />
              ))}
            {dot === index && <circle cx={cx + 8} cy="27" r="1.2" stroke="none" />}
          </g>
        );
      })}
      {Math.min(...counts) > 0 &&
        Array.from({ length: Math.max(...counts) }, (_, level) => {
          const both = counts.every((count) => count > level);
          const left = counts[0] > level;
          return (
            <path
              key={level}
              strokeWidth="2"
              d={`M${start + 3 + (both || left ? 0 : 17)} ${12 + level * 4}h${both ? 24 : 7}`}
            />
          );
        })}
    </g>
  );
  return (
    <g
      transform={`translate(${x} ${y})`}
      fill="#344b3e"
      stroke="#344b3e"
      strokeWidth="1.1"
      role="img"
      aria-label={`곡 전체 리듬: ${setting.label}`}
      data-rhythm-feel={feel}
    >
      <title>{setting.label}</title>
      {pair(4, [flags, flags])}
      <path d="M43 18h10m-10 5h10" />
      {pair(68, rightFlags, triplet ? -1 : scottish ? 1 : 0)}
      {triplet && (
        <g aria-label="셋잇단 비율 2 대 1">
          <path d="M66 8V4h9m12 0h13v4" fill="none" />
          <text x="81" y="8" textAnchor="middle" stroke="none" fontSize="10">
            3
          </text>
        </g>
      )}
    </g>
  );
}
