import { detectSamplePitch, type InstrumentSample } from './samplePitch';
import { validateAudioFile } from './trackParts';

export type PreparedInstrumentSample = {
  buffer: AudioBuffer;
  rootMidi: number;
  sustain: boolean;
  loopStart: number;
  loopEnd: number;
};

const decoded = new WeakMap<Blob, AudioBuffer>();

export function prepareSampleBuffer(context: BaseAudioContext, original: AudioBuffer): AudioBuffer {
  if (original.duration > 15 || original.duration < 0.15)
    throw new Error('0.15초에서 15초 사이의 단음 녹음을 선택해주세요.');
  const mono = new Float32Array(original.length);
  // Use the strongest channel: averaging opposite-phase stereo can cancel the note.
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
  const buffer = context.createBuffer(1, last - first + 1, original.sampleRate);
  const output = buffer.getChannelData(0);
  const fade = Math.min(Math.floor(original.sampleRate * 0.003), output.length / 4);
  for (let i = 0; i < output.length; i++) {
    output[i] =
      mono[first + i] * (0.8 / peak) * Math.min(1, i / fade, (output.length - 1 - i) / fade);
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
  const buffer = prepareSampleBuffer(context, original);
  decoded.set(file, buffer);
  return buffer;
}

export async function importInstrumentSample(file: File): Promise<InstrumentSample> {
  validateAudioFile(file);
  if (file.size > 10 * 1024 * 1024) throw new Error('악기 녹음은 10MB 이하로 선택해주세요.');
  const buffer = await decode(file);
  const rootMidi = detectSamplePitch(buffer.getChannelData(0), buffer.sampleRate);
  return { file, name: file.name, rootMidi, enabled: true, sustain: false };
}

export async function prepareInstrumentSample(
  sample: InstrumentSample,
): Promise<PreparedInstrumentSample> {
  if (
    sample.rootMidi === null ||
    !Number.isFinite(sample.rootMidi) ||
    sample.rootMidi < 0 ||
    sample.rootMidi > 127
  )
    throw new Error('내 악기 소리의 기준 음을 먼저 지정해주세요.');
  const buffer = await decode(sample.file);
  const data = buffer.getChannelData(0);
  // Match ascending zero crossings to reduce clicks when sustaining a note.
  const crossing = (time: number) => {
    const from = Math.floor(time * buffer.sampleRate);
    const end = Math.min(data.length - 1, from + Math.ceil(buffer.sampleRate / 30));
    for (let i = from; i < end; i++)
      if (data[i] <= 0 && data[i + 1] > 0) return i / buffer.sampleRate;
    return time;
  };
  return {
    buffer,
    rootMidi: sample.rootMidi,
    sustain: sample.sustain,
    loopStart: crossing(buffer.duration * 0.3),
    loopEnd: crossing(buffer.duration * 0.8),
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
