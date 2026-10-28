import type { ReactNode } from 'react';
import type { ScorePlaybackPosition } from '../lib/scorePlaybackDisplay.web';
import { useScorePlaybackValue } from '../lib/scorePlaybackSubscription.web';

export function ScoreReferencePosition({
  clock,
  playing,
  fallback,
  children,
}: {
  clock: ScorePlaybackPosition;
  playing: boolean;
  fallback: number;
  children: (seconds: number) => ReactNode;
}) {
  const seconds = useScorePlaybackValue(clock, playing, (time) =>
    playing && time !== null ? Math.floor(time * 4) / 4 : fallback,
  );
  return <>{children(seconds)}</>;
}
