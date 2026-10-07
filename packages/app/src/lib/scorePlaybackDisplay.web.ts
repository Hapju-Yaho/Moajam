import { useLayoutEffect, type RefObject } from 'react';

export type ScorePlaybackPosition = { current: (() => number | null) | null };

export function playbackX(points: number[][], beat: number) {
  const right = points.findIndex((point) => point[0] > beat);
  if (right < 0) return points.at(-1)![1];
  if (right === 0) return points[0][1];
  const a = points[right - 1],
    b = points[right];
  return a[1] + ((b[1] - a[1]) * (beat - a[0])) / (b[0] - a[0]);
}

/** Animate only the playhead and current measure background, using the audio clock.
 * No React state updates, DOM measurements or full-score searches per frame. */
export function useScorePlaybackDisplay(
  root: RefObject<HTMLDivElement | null>,
  position: ScorePlaybackPosition | undefined,
  fallback: number | null,
) {
  useLayoutEffect(() => {
    if (fallback === null || !root.current) return;
    const bars = [...root.current.querySelectorAll<SVGGElement>('[data-playback-points]')].map(
      (bar) => ({
        element: bar,
        start: Number(bar.dataset.playbackStart),
        end: Number(bar.dataset.playbackEnd),
        points: JSON.parse(bar.dataset.playbackPoints!) as number[][],
        line: bar.closest('svg')!.querySelector<SVGLineElement>('[data-playback-cursor]')!,
      }),
    );
    let frame = 0,
      previousLine: SVGLineElement | undefined,
      previousBar: SVGGElement | undefined;
    const draw = () => {
      const beat = position ? (position.current?.() ?? null) : fallback;
      const bar =
        beat === null ? undefined : bars.find((bar) => beat >= bar.start && beat < bar.end);
      if (previousBar !== bar?.element) {
        previousBar?.removeAttribute('data-playing-measure');
        bar?.element.setAttribute('data-playing-measure', 'true');
        previousBar = bar?.element;
      }
      if (previousLine && previousLine !== bar?.line)
        previousLine.setAttribute('visibility', 'hidden');
      if (bar && beat !== null) {
        bar.line.setAttribute('transform', `translate(${playbackX(bar.points, beat)},0)`);
        bar.line.setAttribute('visibility', 'visible');
      }
      previousLine = bar?.line;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      previousLine?.setAttribute('visibility', 'hidden');
      previousBar?.removeAttribute('data-playing-measure');
    };
  });
}
