type DrumIcon = 'flam' | 'drag' | 'double' | 'roll2' | 'roll3' | 'buzz';

export function ScoreDrumTechniqueIcon({ type }: { type: DrumIcon }) {
  const grace = type === 'flam' || type === 'drag';
  const slashes = type === 'double' ? 1 : type === 'roll2' ? 2 : type === 'roll3' ? 3 : 0;
  return (
    <svg
      data-drum-technique-icon={type}
      viewBox="0 0 32 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse
        cx={grace ? 24 : 13}
        cy="22"
        rx="4"
        ry="2.8"
        transform={`rotate(-20 ${grace ? 24 : 13} 22)`}
        fill="currentColor"
        stroke="none"
      />
      <path d={grace ? 'M27.5 21V3' : 'M16.5 21V3'} />
      {grace ? (
        <>
          {(type === 'drag' ? [5, 13] : [10]).map((x) => (
            <g key={x} strokeWidth="1.2">
              <ellipse
                cx={x}
                cy="19"
                rx="2.3"
                ry="1.6"
                transform={`rotate(-20 ${x} 19)`}
                fill="currentColor"
                stroke="none"
              />
              <path d={`M${x + 2} 18V8`} />
              <path d={`M${x - 1} 15l6-5`} />
            </g>
          ))}
          {type === 'drag' ? <path d="M7 8h8M7 10h8" /> : <path d="M12 8c5 2 5 4 2 6" />}
        </>
      ) : type === 'buzz' ? (
        <path d="M12 8h9l-10 8h9" strokeWidth="1.8" />
      ) : (
        Array.from({ length: slashes }, (_, i) => (
          <path key={i} d={`M12 ${10 + i * 3.6}l9-4`} strokeWidth="2" strokeLinecap="butt" />
        ))
      )}
    </svg>
  );
}
