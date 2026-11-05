import styledWeb from '@emotion/styled';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScorePlaybackValue } from '@lib/scorePlaybackSubscription.web';
import type { ScorePlaybackPosition } from '@lib/scorePlaybackDisplay.web';

/** Keep row geometry in the document while avoiding thousands of offscreen SVG nodes. */
export function ScoreSystemViewport({
  enabled,
  active,
  initialVisible,
  width,
  height,
  children,
  playbackPosition,
  playing = false,
  playbackStart = 0,
  playbackEnd = 0,
}: {
  enabled: boolean;
  active: boolean;
  initialVisible: boolean;
  width: number;
  height: number;
  children: () => ReactNode;
  playbackPosition?: ScorePlaybackPosition;
  playing?: boolean;
  playbackStart?: number;
  playbackEnd?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(initialVisible);
  const playbackActive = useScorePlaybackValue(
    playbackPosition,
    enabled && playing,
    (beat) => beat !== null && beat >= playbackStart && beat < playbackEnd,
  );
  useEffect(() => {
    if (!enabled || !root.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '1000px 0px',
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [enabled]);
  if (!enabled || typeof IntersectionObserver === 'undefined') return children();
  return (
    <ScoreSystemViewportContainer
      ref={root}
      data-score-system-viewport="true"
      $width={width}
      $height={height}
    >
      {(visible || active || playbackActive) && children()}
    </ScoreSystemViewportContainer>
  );
}

const ScoreSystemViewportContainer = styledWeb('div')<{ $width: number; $height: number }>(
  ({ $width, $height }) => ({ '&&&&': { width: $width, height: $height, flexShrink: 0 } }),
);
