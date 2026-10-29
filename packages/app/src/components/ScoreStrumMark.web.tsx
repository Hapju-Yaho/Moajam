export function ScoreStrumMark({
  direction,
  x = 0,
  top = 0,
  bottom = 30,
}: {
  direction: 'up' | 'down';
  x?: number;
  top?: number;
  bottom?: number;
}) {
  const end = direction === 'up' ? top : bottom,
    head = end + (direction === 'up' ? 5 : -5);
  return (
    <path
      data-guitar-strum={direction}
      d={`M${x} ${direction === 'up' ? bottom : top}V${end}M${x - 3} ${head}L${x} ${end}L${x + 3} ${head}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}
