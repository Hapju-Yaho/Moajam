import {
  detectSamplePitch,
  MIN_SAMPLE_REGION,
  usesAutomaticSampleRoot,
  type InstrumentSample,
} from './samplePitch';
import { validateAudioFile } from './trackParts';

export type PreparedInstrumentSample = {
  buffer: AudioBuffer;
  rootMidi: number;
  sustain: boolean;
  loopStart: number;
  loopEnd: number;
  playbackGain?: number;
};

export type PreparedPlaybackInstrument =
  | PreparedInstrumentSample
  | {
      kind: 'soundfont';
      samples: ReadonlyMap<number, PreparedInstrumentSample>;
    };

export function playbackSample(
  instrument: PreparedPlaybackInstrument,
  pitch: number,
): PreparedInstrumentSample {
  if (!('kind' in instrument)) return instrument;
  let selected: PreparedInstrumentSample | undefined;
  for (const sample of instrument.samples.values()) {
    if (!selected || Math.abs(sample.rootMidi - pitch) < Math.abs(selected.rootMidi - pitch))
      selected = sample;
  }
  if (!selected) throw new Error('악기 음원이 준비되지 않았어요. 다시 재생해주세요.');
  return selected;
}

const decoded = new WeakMap<Blob, AudioBuffer>();

export function instrumentSampleGain(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++)
    for (const value of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value));
  // One fixed, stereo-linked gain: preserve the waveform and leave peak headroom.
  return peak > 0 ? Math.min(2, 0.85 / peak) : 1;
}

function analysisChannel(original: AudioBuffer) {
  // Analyze the strongest channel without mixing or altering playback channels.
  let channel = original.getChannelData(0);
  let bestEnergy = 0;
  for (let c = 0; c < original.numberOfChannels; c++) {
    const data = original.getChannelData(c);
    let energy = 0;
    for (let i = 0; i < data.length; i++) energy += data[i] ** 2;
    if (energy > bestEnergy) {
      bestEnergy = energy;
      channel = data;
    }
  }
  return channel;
}

function analyzeSampleBuffer(original: AudioBuffer) {
  if (original.duration > 15 || original.duration < 0.15)
    throw new Error('0.15초에서 15초 사이의 단음 녹음을 선택해주세요.');
  const mono = new Float32Array(original.length);
  const channel = analysisChannel(original);
  let mean = 0;
  for (const value of channel) mean += value;
  mean /= channel.length;
  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    mono[i] = channel[i] - mean;
    peak = Math.max(peak, Math.abs(mono[i]));
  }
  if (peak < 0.002) throw new Error('악기 소리를 찾지 못했어요. 조금 더 크게 녹음해주세요.');
  const threshold = Math.max(0.002, peak * 0.015);
  let first = 0,
    last = mono.length - 1;
  while (first < last && Math.abs(mono[first]) < threshold) first++;
  while (last > first && Math.abs(mono[last]) < threshold) last--;
  first = Math.max(0, first - Math.floor(original.sampleRate * 0.003));
  if ((last - first) / original.sampleRate < 0.12)
    throw new Error('소리가 너무 짧아요. 한 음을 1~3초 정도 유지해 녹음해주세요.');
  return { mono, first, last };
}

export function prepareSampleBuffer(
  context: BaseAudioContext,
  original: AudioBuffer,
  region?: { trimStart: number; trimEnd: number },
): AudioBuffer {
  const analyzed = analyzeSampleBuffer(original);
  const { mono } = analyzed;
  let { first, last } = analyzed;
  if (region) {
    const { trimStart, trimEnd } = region;
    if (
      !Number.isFinite(trimStart) ||
      !Number.isFinite(trimEnd) ||
      trimStart < 0 ||
      trimEnd > original.duration + 1e-6 ||
      trimEnd - trimStart < MIN_SAMPLE_REGION - 1e-6
    )
      throw new Error('재생 구간을 확인해주세요. 시작과 끝은 최소 0.05초 이상 떨어져 있어야 해요.');
    first = Math.round(trimStart * original.sampleRate);
    last = Math.min(original.length, Math.round(trimEnd * original.sampleRate)) - 1;
  }
  let peak = 0;
  for (let i = first; i <= last; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak < 0.002)
    throw new Error('선택한 구간에 악기 소리가 없어요. 시작과 끝을 다시 정해주세요.');
  const buffer = context.createBuffer(
    original.numberOfChannels,
    last - first + 1,
    original.sampleRate,
  );
  const fade = Math.min(Math.floor(original.sampleRate * 0.003), buffer.length / 4);
  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    const input = original.getChannelData(channel);
    const output = buffer.getChannelData(channel);
    for (let i = 0; i < output.length; i++) {
      // Preserve recorded levels and stereo; only soften the cut edges to avoid clicks.
      output[i] = input[first + i] * Math.min(1, i / fade, (output.length - 1 - i) / fade);
    }
  }
  return buffer;
}

async function decode(file: Blob): Promise<AudioBuffer> {
  const cached = decoded.get(file);
  if (cached) return cached;
  const context = new OfflineAudioContext(1, 1, 44100);
  let original: AudioBuffer;
  try {
    original = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('이 녹음을 읽을 수 없어요. WAV 또는 MP3 파일로 다시 선택해주세요.');
  }
  analyzeSampleBuffer(original);
  decoded.set(file, original);
  return original;
}

export async function inspectInstrumentSample(file: Blob) {
  const original = await decode(file);
  const { mono, first, last } = analyzeSampleBuffer(original);
  const peaks = Array.from({ length: 240 }, (_, bin) => {
    let peak = 0;
    const end = Math.floor(((bin + 1) * mono.length) / 240);
    for (let i = Math.floor((bin * mono.length) / 240); i < end; i++)
      peak = Math.max(peak, Math.abs(mono[i]));
    return peak;
  });
  return {
    duration: original.duration,
    trimStart: first / original.sampleRate,
    trimEnd: (last + 1) / original.sampleRate,
    peaks,
  };
}

export async function prepareInstrumentSampleRegion(sample: InstrumentSample) {
  const original = await decode(sample.file);
  if ((sample.trimStart === undefined) !== (sample.trimEnd === undefined))
    throw new Error('녹음의 시작과 끝을 모두 정해주세요.');
  return prepareSampleBuffer(
    new OfflineAudioContext(1, 1, original.sampleRate),
    original,
    sample.trimStart !== undefined && sample.trimEnd !== undefined
      ? { trimStart: sample.trimStart, trimEnd: sample.trimEnd }
      : undefined,
  );
}

export async function importInstrumentSample(file: File): Promise<InstrumentSample> {
  validateAudioFile(file);
  if (file.size > 10 * 1024 * 1024) throw new Error('악기 녹음은 10MB 이하로 선택해주세요.');
  const details = await inspectInstrumentSample(file);
  const buffer = await prepareInstrumentSampleRegion({
    file,
    name: file.name,
    rootMidi: null,
    enabled: true,
    sustain: false,
  });
  const rootMidi = detectSamplePitch(analysisChannel(buffer), buffer.sampleRate);
  return {
    file,
    name: file.name,
    rootMidi,
    enabled: true,
    sustain: false,
    trimStart: details.trimStart,
    trimEnd: details.trimEnd,
    autoRoot: true,
  };
}

export async function detectInstrumentSampleRoot(sample: InstrumentSample): Promise<number | null> {
  const buffer = await prepareInstrumentSampleRegion(sample);
  return detectSamplePitch(analysisChannel(buffer), buffer.sampleRate);
}

export async function prepareInstrumentSample(
  sample: InstrumentSample,
): Promise<PreparedInstrumentSample> {
  const buffer = await prepareInstrumentSampleRegion(sample);
  const rootMidi = usesAutomaticSampleRoot(sample)
    ? detectSamplePitch(analysisChannel(buffer), buffer.sampleRate)
    : sample.rootMidi;
  if (rootMidi === null || !Number.isFinite(rootMidi) || rootMidi < 0 || rootMidi > 127)
    throw new Error(
      '선택 구간의 기준 음을 찾지 못했어요. 구간을 넓히거나 녹음에서 실제 연주한 음을 직접 지정해주세요.',
    );
  const data = analysisChannel(buffer);
  // Match ascending zero crossings to reduce clicks when sustaining a note.
  const crossing = (time: number) => {
    const from = Math.floor(time * buffer.sampleRate);
    const end = Math.min(data.length - 1, from + Math.ceil(buffer.sampleRate / 30));
    for (let i = from; i < end; i++)
      if (data[i] <= 0 && data[i + 1] > 0) return i / buffer.sampleRate;
    return time;
  };
  let loopStart = crossing(buffer.duration * 0.3);
  let loopEnd = crossing(buffer.duration * 0.8);
  // In very short low notes both searches can land on the same crossing.
  if (loopEnd - loopStart < 1 / buffer.sampleRate) {
    loopStart = buffer.duration * 0.3;
    loopEnd = buffer.duration * 0.8;
  }
  return {
    buffer,
    rootMidi,
    sustain: sample.sustain,
    loopStart,
    loopEnd,
    playbackGain: instrumentSampleGain(buffer),
  };
}

export function createSampleVoice(context: BaseAudioContext, sample: PreparedInstrumentSample) {
  const source = context.createBufferSource();
  source.buffer = sample.buffer;
  source.loop = sample.sustain;
  source.loopStart = sample.loopStart;
  source.loopEnd = sample.loopEnd;
  return source;
}
