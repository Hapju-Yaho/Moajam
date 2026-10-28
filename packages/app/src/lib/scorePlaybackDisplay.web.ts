import { useLayoutEffect, useRef, type RefObject } from 'react';

export type ScorePlaybackPosition = { current: (() => number | null) | null };

/** Update the current measure and optional beat dots from the audio clock. */
export function useScorePlaybackDisplay(
  root: RefObject<HTMLDivElement | null>,
  position: ScorePlaybackPosition | undefined,
  fallback: number | null,
) {
  const latestFallback = useRef(fallback);
  latestFallback.current = fallback;
  const active = fallback !== null;
  useLayoutEffect(() => {
    if (!active || !root.current) return;
    const readBars = () =>
      [...root.current!.querySelectorAll<SVGGElement>('[data-playback-measure]')].map((bar) => ({
        element: bar,
        start: Number(bar.dataset.playbackStart),
        end: Number(bar.dataset.playbackEnd),
        unit: Number(
          bar.querySelector<SVGGElement>('[data-metronome-unit]')?.dataset.metronomeUnit ?? 1,
        ),
        dots: [...bar.querySelectorAll<SVGCircleElement>('[data-metronome-beat]')],
      }));
    let bars = readBars();
    let dirty = false;
    const observer = new MutationObserver(() => {
      dirty = true;
    });
    observer.observe(root.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-playback-start', 'data-playback-end', 'data-metronome-unit'],
    });
    let lastRow: SVGSVGElement | null = null;
    let previousDot: SVGCircleElement | undefined;
    let frame = 0;
    let previousBar: SVGGElement | undefined;
    let previousNextBar: SVGGElement | undefined;
    const draw = () => {
      const refreshed = dirty;
      if (dirty) {
        bars = readBars();
        dirty = false;
      }
      const beat = position ? (position.current?.() ?? null) : latestFallback.current;
      const bar =
        beat === null ? undefined : bars.find((bar) => beat >= bar.start && beat < bar.end);
      if (previousBar !== bar?.element || refreshed) {
        previousBar?.removeAttribute('data-playing-measure');
        previousBar?.removeAttribute('data-playback-active');
        bar?.element.setAttribute('data-playing-measure', 'true');
        bar?.element.setAttribute('data-playback-active', 'true');
        if (bar) {
          const row = bar.element.closest('svg')!;
          if (row !== lastRow) {
            scrollPlaybackMeasure(bar.element, lastRow ? 'smooth' : 'instant');
            lastRow = row;
          }
        }
        previousBar = bar?.element;
        const next = bar ? bars.find((item) => item.start >= bar.end && item !== bar) : undefined;
        previousNextBar?.removeAttribute('data-next-playing-measure');
        next?.element.setAttribute('data-next-playing-measure', 'true');
        previousNextBar = next?.element;
      }
      const dot =
        bar && beat !== null
          ? bar.dots[Math.floor((beat - bar.start) / bar.unit) % Math.max(1, bar.dots.length)]
          : undefined;
      if (dot !== previousDot) {
        previousDot?.removeAttribute('data-active');
        dot?.setAttribute('data-active', 'true');
        previousDot = dot;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      previousBar?.removeAttribute('data-playing-measure');
      previousBar?.removeAttribute('data-playback-active');
      previousNextBar?.removeAttribute('data-next-playing-measure');
      previousDot?.removeAttribute('data-active');
    };
  }, [root, position, active]);
}

function scrollPlaybackMeasure(measure: Element, behavior: ScrollBehavior) {
  // Bring the workspace into view before centering its measure, otherwise an
  // offscreen nested viewport can leave half the measure clipped at its edge.
  const scrollers: { element: HTMLElement; vertical: boolean; horizontal: boolean }[] = [];
  let parent = measure.parentElement;
  while (parent) {
    const expanded = parent.matches('.score-editor-viewport[data-expanded="true"]');
    const style = getComputedStyle(parent);
    const vertical =
      /(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight;
    const horizontal =
      /(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth;
    if (vertical || horizontal) scrollers.unshift({ element: parent, vertical, horizontal });
    // Fullscreen lives in the top layer; never scroll its inert app ancestors.
    if (expanded) break;
    parent = parent.parentElement;
  }
  scrollers.forEach(({ element, vertical, horizontal }, index) => {
    const bounds = (scrollers[index + 1]?.element ?? measure).getBoundingClientRect();
    const viewport = element.getBoundingClientRect();
    if (vertical) {
      const expanded = element.matches('.score-editor-viewport[data-expanded="true"]');
      const toolbar = expanded
        ? (element.querySelector('.score-editor-viewbar')?.getBoundingClientRect().height ?? 0)
        : 0;
      const top = Math.max(0, viewport.top + element.clientTop) + toolbar;
      const bottom = Math.min(
        window.innerHeight,
        viewport.top + element.clientTop + element.clientHeight,
      );
      element.scrollBy({
        top: (bounds.top + bounds.bottom - top - bottom) / 2,
        behavior,
      });
    }
    if (horizontal) {
      element.scrollBy({
        left:
          (bounds.left + bounds.right) / 2 -
          viewport.left -
          element.clientLeft -
          element.clientWidth / 2,
        behavior,
      });
    }
  });
}
