// Queue audio ahead on the AudioContext clock, so a loop boundary does not wait
// for React or a timer to restart playback. No accumulating per-note timeouts.
export function createScorePlaybackClock(
  startAt: number,
  duration: number,
  repeat: boolean,
  schedule: (when: number) => void,
) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid playback duration');
  let nextCycle = 0;
  return (now: number) => {
    const elapsed = Math.max(0, now - startAt);
    if (repeat && startAt + nextCycle * duration < now) nextCycle = Math.ceil(elapsed / duration);
    while ((repeat || nextCycle === 0) && startAt + nextCycle * duration < now + 1) {
      schedule(startAt + nextCycle * duration);
      nextCycle++;
    }
    return {
      elapsed: repeat ? elapsed % duration : Math.min(elapsed, duration),
      ended: !repeat && elapsed >= duration,
    };
  };
}
