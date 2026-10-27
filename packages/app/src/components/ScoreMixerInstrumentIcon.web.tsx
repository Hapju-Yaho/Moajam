import type { Score } from '../lib/score';
import { mixerInstrumentAppearance } from '../lib/scoreMixerAppearance';

export function ScoreMixerInstrumentIcon({ score, part }: { score: Score; part: string }) {
  const { kind, color } = mixerInstrumentAppearance(score, part);
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'guitar' ? (
        <>
          <path d="m14 9 6-6 2 2-6 6M14 9c-2-3-5-2-5 1-5-1-8 5-4 9s10 1 9-4c3 0 4-3 2-4" />
          <circle cx="9" cy="15" r="2" />
          <path d="m5 19 2-2" />
        </>
      ) : kind === 'drums' ? (
        <>
          <ellipse cx="12" cy="9" rx="9" ry="4" />
          <path d="M3 9v8c0 5 18 5 18 0V9M7 12v7m10-7v7M5 2l9 5m6-5-6 5" />
        </>
      ) : kind === 'keyboard' ? (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M7 5v14m5-14v14m5-14v14M5 5v8h3V5m2 0v8h3V5m2 0v8h3V5" />
        </>
      ) : (
        <>
          <rect x="8" y="2" width="8" height="13" rx="4" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" />
        </>
      )}
    </svg>
  );
}
