import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ScorePlaybackPosition } from './scorePlaybackDisplay.web';

// One animation clock per playback source, shared by the small UI subscribers.
const clocks = new WeakMap<ScorePlaybackPosition, ReturnType<typeof createClock>>();
function createClock(position: ScorePlaybackPosition) {
  const listeners = new Set<() => void>();
  let frame = 0;
  let beat: number | null = null;
  const tick = () => {
    beat = position.current?.() ?? null;
    listeners.forEach((listener) => listener());
    if (listeners.size) frame = requestAnimationFrame(tick);
  };
  return {
    get: () => beat,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        beat = position.current?.() ?? null;
        frame = requestAnimationFrame(tick);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) cancelAnimationFrame(frame);
      };
    },
  };
}

/** Select a primitive snapshot; React only renders when that displayed value changes. */
export function useScorePlaybackValue<T extends string | number | boolean | null>(
  position: ScorePlaybackPosition | undefined,
  enabled: boolean,
  select: (beat: number | null) => T,
) {
  const selector = useRef(select);
  selector.current = select;
  let clock = position ? clocks.get(position) : undefined;
  if (position && !clock) {
    clock = createClock(position);
    clocks.set(position, clock);
  }
  const subscribe = useCallback(
    (listener: () => void) => (enabled && clock ? clock.subscribe(listener) : () => {}),
    [clock, enabled],
  );
  const snapshot = useCallback(
    () => selector.current(enabled && clock ? clock.get() : null),
    [clock, enabled],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
