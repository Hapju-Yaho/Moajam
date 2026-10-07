/** The same open, rounded flag contour for staff, TAB and small grace notes. */
export function NoteFlags({
  x,
  y,
  count,
  direction,
  scale = 1,
  color = '#293e34',
}: {
  x: number;
  y: number;
  count: number;
  direction: number;
  scale?: number;
  color?: string;
}) {
  return (
    <g
      data-note-flags="true"
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      pointerEvents="none"
    >
      {Array.from({ length: count }, (_, flag) => (
        <path
          key={flag}
          d={`M0 ${-direction * flag * 6}q12 ${-direction * 7} 6 ${-direction * 15}`}
        />
      ))}
    </g>
  );
}
