export type InstrumentSample = {
  file: Blob;
  name: string;
  rootMidi: number | null;
  enabled: boolean;
  sustain: boolean;
  trimStart?: number;
  trimEnd?: number;
  autoRoot?: boolean;
};

export const MIN_SAMPLE_REGION = 0.05;

// Old recordings with an unset or subsonic root need detection, not a huge playback rate.
export function usesAutomaticSampleRoot(sample: InstrumentSample) {
  return sample.autoRoot ?? (sample.rootMidi === null || sample.rootMidi < 24);
}

// Analyze audible windows rather than silence or the quiet tail of a pluck.
// Octave-related estimates can occur when a bass harmonic dominates its attack;
// accept the lower root only when multiple windows independently support it.
export function detectSamplePitch(samples: Float32Array, sampleRate: number): number | null {
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const rate = sampleRate / stride;
  const availableSamples = Math.floor(samples.length / stride);
  if (availableSamples < rate * 0.045) return null;
  const size = Math.min(2048, Math.floor((availableSamples * 0.75) / 2) * 2);
  const minLag = Math.max(2, Math.floor(rate / 1400));
  const maxLag = Math.min(size / 2, Math.ceil(rate / 35));
  const available = availableSamples - size;
  if (available < 0) return null;
  const downsampled = new Float32Array(availableSamples);
  let mean = 0;
  for (let i = 0; i < availableSamples; i++) {
    let value = 0;
    for (let j = 0; j < stride; j++) value += samples[i * stride + j];
    downsampled[i] = value / stride;
    mean += downsampled[i];
  }
  mean /= availableSamples;
  const energySum = new Float64Array(availableSamples + 1);
  for (let i = 0; i < availableSamples; i++) {
    downsampled[i] -= mean;
    energySum[i + 1] = energySum[i] + downsampled[i] ** 2;
  }
  const offsets: number[] = [];
  const hop = Math.max(1, Math.min(Math.floor(size / 4), Math.floor(available / 4)));
  for (let offset = 0; offset <= available; offset += hop) offsets.push(offset);
  if (offsets.at(-1) !== available) offsets.push(available);
  const energyAt = (offset: number) => (energySum[offset + size] - energySum[offset]) / size;
  const loudest = Math.max(...offsets.map(energyAt));
  if (loudest < 0.0005 ** 2) return null;
  const audible = offsets.filter(
    (offset) => energyAt(offset) >= Math.max(0.0005 ** 2, loudest * 0.0025),
  );
  const frames =
    audible.length <= 24
      ? audible
      : Array.from({ length: 24 }, (_, i) => audible[Math.round((i * (audible.length - 1)) / 23)]);
  const pitches: number[] = [];
  for (const offset of frames) {
    const frame = downsampled.subarray(offset, offset + size);
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
  const octaveDistance = (a: number, b: number) => Math.abs(a - b - 12 * Math.round((a - b) / 12));
  let consensus: number[] = [];
  for (const pitch of pitches) {
    const matching = pitches.filter((other) => octaveDistance(pitch, other) < 0.4);
    if (matching.length > consensus.length) consensus = matching;
  }
  if (consensus.length < Math.max(3, Math.ceil(pitches.length * 0.7))) return null;
  for (const pitch of consensus) {
    const matching = consensus.filter((other) => Math.abs(pitch - other) < 0.4);
    if (matching.length >= 3) return matching[Math.floor(matching.length / 2)];
  }
  return null;
}

export function samplePlaybackRate(pitch: number, rootMidi: number) {
  return 2 ** ((pitch - rootMidi) / 12);
}
