import { DOTTED_SCORE_BEATS } from '../lib/score';

export function DrumRest({
  x,
  y,
  beats,
  whole = false,
  label,
}: {
  x: number;
  y: number;
  beats: number;
  whole?: boolean;
  label: string;
}) {
  const dotted = !whole && DOTTED_SCORE_BEATS.includes(beats);
  const base = dotted ? beats / 1.5 : beats;
  if (whole || base >= 2)
    return (
      <g aria-label={label} data-rest-beats={beats} pointerEvents="none">
        <path d={`M${x - 9} ${y}H${x + 9}`} stroke="currentColor" strokeWidth="1" />
        <rect
          x={x - 6}
          y={whole || base >= 4 ? y : y - 5}
          width="12"
          height="5"
          fill="currentColor"
        />
        {dotted && (
          <circle aria-label="점쉼표 점" cx={x + 12} cy={y - 2} r="1.6" fill="currentColor" />
        )}
      </g>
    );
  return (
    <>
      <text
        aria-label={label}
        data-rest-beats={beats}
        x={x - 7}
        y={y}
        fontSize="26"
        pointerEvents="none"
      >
        {base >= 1
          ? '𝄽'
          : base >= 0.5
            ? '𝄾'
            : base >= 0.25
              ? '𝄿'
              : base >= 0.125
                ? '\u{1D140}'
                : '\u{1D141}'}
      </text>
      {dotted && (
        <circle
          aria-label="점쉼표 점"
          cx={x + 11}
          cy={y - 10}
          r="1.6"
          fill="currentColor"
          pointerEvents="none"
        />
      )}
    </>
  );
}
