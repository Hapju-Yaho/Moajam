export function RhythmSlash({
  x,
  y,
  beats,
  stemEnd,
  direction = 1,
  beamed = false,
  staccato = false,
  accent = false,
}: {
  x: number;
  y: number;
  beats: number;
  stemEnd?: number;
  direction?: number;
  beamed?: boolean;
  staccato?: boolean;
  accent?: boolean;
}) {
  const flags = [1, 0.5, 0.25, 0.125].filter((n) => beats < n).length;
  const end = stemEnd ?? y + direction * (28 + Math.max(0, flags - 2) * 5),
    stemX = x - direction * 5;
  return (
    <g
      data-rhythm-slash="true"
      aria-label="리듬 슬래시"
      fill="#293e34"
      stroke="#293e34"
      pointerEvents="none"
    >
      <path
        d={`M${x - 6} ${y + 7}l9 -16l4 2l-9 16z`}
        fill={beats >= 2 ? '#fffefb' : '#293e34'}
        strokeWidth="1"
      />
      {beats < 4 && <path d={`M${stemX} ${y + direction * 5}V${end}`} strokeWidth="1" />}
      {!beamed &&
        Array.from({ length: flags }, (_, i) => (
          <path
            key={i}
            d={`M${stemX} ${end - direction * i * 6}q12 ${-direction * 7} 6 ${-direction * 15}`}
            strokeWidth="1"
            fill="none"
          />
        ))}
      {[6, 3, 1.5, 0.75, 0.375, 0.1875].includes(beats) && (
        <circle cx={x + 11} cy={y - 3} r="1.5" />
      )}
      {staccato && <circle cx={x} cy={y - direction * 15} r="1.4" />}
      {accent && (
        <text x={x} y={Math.min(end, y) - 10} textAnchor="middle" fontSize="13" stroke="none">
          &gt;
        </text>
      )}
    </g>
  );
}
