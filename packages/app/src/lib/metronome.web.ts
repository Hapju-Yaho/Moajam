import { beatSeconds, type TimeSignature } from './practiceTimeline';

export function scheduleClick(
  context: AudioContext,
  time: number,
  accent: boolean,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = accent ? 1400 : 900;
  gain.gain.setValueAtTime(Math.max(0.0001, volume * (accent ? 0.35 : 0.22)), time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + 0.05);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  return oscillator;
}

// Schedule against the audio clock, not the interval clock. The timer only fills the lookahead window.
export function startMetronome(
  context: AudioContext,
  options: {
    bpm: number;
    signature: TimeSignature;
    volume: number;
    position: number;
    beats?: number;
    leadIn?: number;
    onBeat: (beat: number) => void;
  },
) {
  const step = beatSeconds(options.bpm, options.signature);
  const perBar = Number(options.signature.split('/')[0]);
  let index = Math.ceil(options.position / step - 0.001);
  let next = context.currentTime + (options.leadIn ?? 0.025) + index * step - options.position;
  const voices = new Set<OscillatorNode>();
  const indicators = new Set<ReturnType<typeof setTimeout>>();
  const fill = () => {
    while (next < context.currentTime - 0.03) {
      next += step;
      index++;
    }
    while (next < context.currentTime + 0.12 && index < (options.beats ?? Infinity)) {
      const beat = index % perBar;
      const oscillator = scheduleClick(
        context,
        Math.max(context.currentTime, next),
        beat === 0,
        options.volume,
      );
      voices.add(oscillator);
      oscillator.addEventListener('ended', () => voices.delete(oscillator));
      const timer = setTimeout(
        () => {
          indicators.delete(timer);
          options.onBeat(beat);
        },
        Math.max(0, (next - context.currentTime) * 1000),
      );
      indicators.add(timer);
      next += step;
      index++;
    }
  };
  fill();
  const timer = setInterval(fill, 25);
  return () => {
    clearInterval(timer);
    indicators.forEach(clearTimeout);
    voices.forEach((voice) => {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    });
  };
}

export function countIn(
  context: AudioContext,
  options: {
    bpm: number;
    signature: TimeSignature;
    bars: number;
    volume: number;
    signal: AbortSignal;
    onBeat: (remaining: number) => void;
  },
): Promise<boolean> {
  if (!options.bars || options.signal.aborted) return Promise.resolve(!options.signal.aborted);
  const beats = Number(options.signature.split('/')[0]) * options.bars;
  const step = beatSeconds(options.bpm, options.signature);
  return new Promise((resolve) => {
    let remaining = beats;
    const stop = startMetronome(context, {
      ...options,
      position: 0,
      beats,
      onBeat: () => options.onBeat(remaining--),
    });
    const finish = (completed: boolean) => {
      stop();
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      resolve(completed);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), (beats * step + 0.025) * 1000);
    options.signal.addEventListener('abort', abort, { once: true });
  });
}
