import { scoreMeasureAtBeat, type Score } from '../lib/score';
import type { ScorePlaybackPosition } from '../lib/scorePlaybackDisplay.web';
import { useScorePlaybackValue } from '../lib/scorePlaybackSubscription.web';
import type { ReactNode } from 'react';

export function ScorePlaybackMeasure({
  score,
  part,
  position,
  fallback,
  idle,
  children,
}: {
  score: Score;
  part: string;
  position?: ScorePlaybackPosition;
  fallback: number | null;
  idle: number;
  children: (bar: number) => ReactNode;
}) {
  const bar = useScorePlaybackValue(position, fallback !== null, (beat) =>
    fallback === null ? idle : scoreMeasureAtBeat(score, part, beat ?? fallback).bar,
  );
  return <>{children(bar)}</>;
}

export function ScorePlaybackReadout({
  score,
  part,
  position,
  fallback,
  idle,
}: {
  score: Score;
  part: string;
  position?: ScorePlaybackPosition;
  fallback: number | null;
  idle: string;
}) {
  const text = useScorePlaybackValue(position, fallback !== null, (beat) => {
    if (fallback === null) return idle;
    const location = scoreMeasureAtBeat(score, part, beat ?? fallback);
    return `${location.bar + 1}마디 · ${Math.floor(location.offset) + 1}박`;
  });
  return <>{text}</>;
}
