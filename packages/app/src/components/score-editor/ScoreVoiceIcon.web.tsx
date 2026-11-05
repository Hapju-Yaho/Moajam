export function ScoreVoiceIcon({ drums, lower }: { drums: boolean; lower: boolean }) {
  return (
    <svg data-voice-icon={lower ? 'lower' : 'upper'} viewBox="0 0 28 28" aria-hidden="true">
      {drums ? (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {lower ? (
            <>
              <path d="M4 8h6c0 4 2 6 5 8l7 2c2 .5 3 2 2 4H4Z" />
              <path d="M4 19h6c4 0 5 3 14 2M13 13l-3 2M16 15l-3 2" />
            </>
          ) : (
            <>
              <path d="m5 23 14-15M23 23 9 8" strokeWidth="2.4" />
              <ellipse cx="21" cy="5.5" rx="1.6" ry="3" transform="rotate(40 21 5.5)" />
              <ellipse cx="7" cy="5.5" rx="1.6" ry="3" transform="rotate(-40 7 5.5)" />
            </>
          )}
        </g>
      ) : (
        <text
          x={lower ? 3 : 6}
          y="23"
          fontSize={lower ? 25 : 27}
          fill="currentColor"
          fontFamily="Segoe UI Symbol, serif"
        >
          {lower ? '𝄢' : '𝄞'}
        </text>
      )}
    </svg>
  );
}
