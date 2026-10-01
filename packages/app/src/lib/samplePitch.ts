export type InstrumentSample = {
  file: Blob;
  name: string;
  rootMidi: number | null;
  enabled: boolean;
  sustain: boolean;
};

// YIN's first reliable difference minimum avoids choosing an octave solely because
// a harmonic is louder than the fundamental. Multiple windows reject unstable audio.
export function detectSamplePitch(samples: Float32Array, sampleRate: number): number | null {
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const rate = sampleRate / stride;
  const size = 2048;
  const minLag = Math.max(2, Math.floor(rate / 1400));
  const maxLag = Math.min(size / 2, Math.ceil(rate / 35));
  const available = Math.floor(samples.length / stride) - size;
  if (available < 0) return null;
  const pitches: number[] = [];
  for (const fraction of [0.05, 0.2, 0.4, 0.6, 0.8]) {
    const offset = Math.floor(available * fraction);
    const frame = new Float32Array(size);
    let energy = 0;
    for (let i = 0; i < size; i++) {
      let sum = 0;
      for (let j = 0; j < stride; j++) sum += samples[(offset + i) * stride + j];
      frame[i] = sum / stride;
      energy += frame[i] ** 2;
    }
    if (Math.sqrt(energy / size) < 0.008) continue;
    const difference = new Float64Array(maxLag + 1);
    let cumulative = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let value = 0;
      for (let i = 0; i < size / 2; i++) value += (frame[i] - frame[i + lag]) ** 2;
      cumulative += value;
      difference[lag] = cumulative > 0 ? (value * lag) / cumulative : 1;
    }
    for (let lag = minLag; lag < maxLag; lag++) {
      if (difference[lag] >= 0.15) continue;
      while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
      const left = difference[lag - 1],
        mid = difference[lag],
        right = difference[lag + 1];
      const denominator = left - 2 * mid + right;
      const shift = denominator
        ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * denominator)))
        : 0;
      pitches.push(69 + 12 * Math.log2(rate / (lag + shift) / 440));
      break;
    }
  }
  if (pitches.length < 3) return null;
  pitches.sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)];
  return pitches.filter((pitch) => Math.abs(pitch - median) < 0.4).length >= 3 ? median : null;
}

export function samplePlaybackRate(pitch: number, rootMidi: number) {
  return 2 ** ((pitch - rootMidi) / 12);
}
