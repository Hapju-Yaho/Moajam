import { scoreSlidePath } from '../lib/scoreLayout';
import type { ScoreConnectionType } from '../lib/score';

/** Notation-shaped icons: pitch rises upward and time advances to the right. */
export function ScoreConnectionIcon({
  type,
  direction = 'up',
  label = 'H/P',
}: {
  type: ScoreConnectionType | 'slur' | 'slideIn' | 'slideOut' | 'hammerPull';
  label?: 'H' | 'P' | 'H/P';
  direction?: 'up' | 'down';
}) {
  const note = (x: number, y: number) => (
    <g>
      <ellipse
        cx={x}
        cy={y}
        rx="2.8"
        ry="1.9"
        fill="currentColor"
        transform={`rotate(-20 ${x} ${y})`}
      />
      <path d={`M${x + 2.5} ${y}v-8`} />
    </g>
  );
  const edge = type === 'slideIn' || type === 'slideOut';
  const y1 = direction === 'up' ? 22 : 10,
    y2 = direction === 'up' ? 10 : 22;
  return (
    <svg
      viewBox="0 0 36 30"
      data-connection-icon={type}
      data-direction={edge ? direction : undefined}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {edge ? (
        <>
          {note(type === 'slideIn' ? 29 : 7, type === 'slideIn' ? y2 : y1)}
          <path
            d={scoreSlidePath(type === 'slideIn' ? 4 : 12, y1, type === 'slideIn' ? 24 : 33, y2)}
          />
        </>
      ) : (
        <>
          {note(6, 21)}
          {note(30, type === 'tie' ? 21 : 15)}
          {type === 'tie' && (
            <path data-tie-continuation="true" d="M26 17q-3 4 0 8M34 17q3 4 0 8" />
          )}
          {type === 'slide' || type === 'glissando' ? (
            <>
              <path d="M12 20L24 15" />
              {type === 'slide' && <path data-legato-arc="true" d="M7 10Q18 0 28 5" />}
            </>
          ) : (
            <>
              <path d={type === 'tie' ? 'M10 24Q18 30 26 24' : 'M7 10Q18 0 28 5'} />
              {(type === 'hammer' || type === 'pull' || type === 'hammerPull') && (
                <text
                  x="18"
                  y="16"
                  fill="currentColor"
                  stroke="none"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                >
                  {type === 'hammerPull' ? label : type === 'hammer' ? 'H' : 'P'}
                </text>
              )}
            </>
          )}
        </>
      )}
    </svg>
  );
}
