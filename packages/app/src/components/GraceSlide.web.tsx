export function GraceSlide({
  x,
  y,
  targetY,
  fret,
}: {
  x: number;
  y: number;
  targetY: number;
  fret?: number;
}) {
  const from = x - 28;
  const ledgers: number[] = [];
  if (fret === undefined) {
    for (let line = 72; line >= y; line -= 10) ledgers.push(line);
    for (let line = 132; line <= y; line += 10) ledgers.push(line);
  }
  return (
    <g
      aria-label="박 안 슬라이드 꾸밈음"
      data-grace-slide={fret === undefined ? 'staff' : 'tab'}
      fill="#293e34"
      stroke="#293e34"
      pointerEvents="none"
    >
      {ledgers.map((line) => (
        <path key={line} d={`M${from - 6} ${line}h12`} strokeWidth="0.8" />
      ))}
      {fret === undefined ? (
        <>
          <ellipse cx={from} cy={y} rx={3} ry={2} transform={`rotate(-18 ${from} ${y})`} />
          <path d={`M${from + 3} ${y}v-18q7 3 3 8m-8 3l9 -7`} fill="none" strokeWidth="1" />
        </>
      ) : (
        <text
          x={from}
          y={y + 3}
          textAnchor="middle"
          fontSize="9"
          stroke="#fffefb"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {fret}
        </text>
      )}
      <path d={`M${from + 7} ${y - 3}L${x - 8} ${targetY - 3}`} fill="none" strokeWidth="1" />
      <text
        x={from + 11}
        y={Math.min(y, targetY) - 14}
        fontSize="10"
        textAnchor="middle"
        stroke="none"
      >
        S
      </text>
    </g>
  );
}
