import { scoreDrums, drumForPitch } from './scoreDrums';
import type { PreparedPlaybackInstrument } from './instrumentSample.web';

let kit: PreparedPlaybackInstrument | undefined;

// Procedural acoustic-style kit: membrane modes, filtered snare wire and metallic
// partials. No recordings or external sample licences are required.
export function synthesizeDrum(pitch: number, rate = 44100): Float32Array {
  const kick = pitch === 36 || pitch === 35;
  const snare = pitch === 38;
  const stick = pitch === 37;
  const hat = [42, 44, 46].includes(pitch);
  const bell = pitch === 53 || pitch === 56;
  const cymbal = !kick && !snare && !stick && !bell && drumForPitch(pitch)?.head !== 'normal';
  const closed = pitch === 42 || pitch === 44;
  const decay = kick
    ? 0.22
    : snare
      ? 0.13
      : stick
        ? 0.028
        : closed
          ? 0.045
          : hat
            ? 0.22
            : bell
              ? 0.25
              : cymbal
                ? 0.55
                : 0.21;
  const data = new Float32Array(Math.ceil(rate * (decay * 7 + 0.015)));
  let seed = 1729 + pitch,
    phase = 0,
    low = 0,
    previous = 0,
    peak = 0;
  const base = kick ? (pitch === 35 ? 52 : 61) : 102 * 2 ** ((pitch - 43) / 12);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    low += 0.18 * (noise - low);
    const high = noise - low;
    const air = (noise - previous) * 0.5;
    previous = noise;
    phase +=
      (2 * Math.PI * (kick ? base + 95 * Math.exp(-t * 65) : base + 25 * Math.exp(-t * 45))) / rate;
    let hit: number;
    if (kick) {
      // Upper membrane modes and the beater survive small speakers, not only sub-bass.
      hit =
        0.8 * Math.sin(phase) * Math.exp(-t / decay) +
        0.38 * Math.sin(phase * 2.03) * Math.exp(-t / 0.13) +
        0.2 * Math.sin(phase * 3.87) * Math.exp(-t / 0.07) +
        (0.2 * high + 0.13 * Math.sin(2 * Math.PI * 2100 * t)) * Math.exp(-t / 0.008);
    } else if (snare) {
      hit =
        (0.42 * Math.sin(2 * Math.PI * 185 * t) + 0.2 * Math.sin(2 * Math.PI * 330 * t)) *
          Math.exp(-t / 0.065) +
        0.72 * high * Math.exp(-t / decay) +
        0.15 * air * Math.exp(-t / 0.012);
    } else if (stick) {
      hit =
        (0.7 * Math.sin(2 * Math.PI * 1850 * t) +
          0.3 * Math.sin(2 * Math.PI * 2630 * t) +
          0.22 * high) *
        Math.exp(-t / decay);
    } else if (bell) {
      hit = [1, 1.48, 2.12, 2.78].reduce(
        (sum, mode, j) =>
          sum +
          (Math.sin(2 * Math.PI * (pitch === 56 ? 560 : 720) * mode * t) *
            Math.exp(-t / (decay / (1 + j * 0.45)))) /
            (j + 2),
        0,
      );
    } else if (hat || cymbal) {
      const metal = [3211, 4567, 6233, 8111, 10103].reduce(
        (sum, frequency, j) => sum + Math.sin(2 * Math.PI * (frequency + pitch * 13) * t) / (j + 4),
        0,
      );
      hit = (0.72 * air + 0.16 * high + 0.19 * metal) * Math.exp(-t / decay);
    } else {
      hit =
        (0.76 * Math.sin(phase) +
          0.27 * Math.sin(phase * 1.59) * Math.exp(-t / 0.1) +
          0.13 * Math.sin(phase * 2.14)) *
          Math.exp(-t / decay) +
        0.16 * high * Math.exp(-t / 0.009);
    }
    const value =
      hit * Math.min(1, t / 0.0007) * Math.min(1, (data.length - 1 - i) / (rate * 0.015));
    data[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const target = kick
    ? 0.92
    : snare
      ? 0.72
      : stick
        ? 0.5
        : closed
          ? 0.24
          : hat
            ? 0.32
            : cymbal
              ? 0.42
              : 0.62;
  for (let i = 0; i < data.length; i++) data[i] *= target / Math.max(peak, 0.001);
  return data;
}

export function prepareDrumKit(): PreparedPlaybackInstrument {
  if (kit) return kit;
  const rate = 44100;
  const context = new OfflineAudioContext(1, 1, rate);
  const samples = new Map();
  for (const drum of scoreDrums) {
    const data = synthesizeDrum(drum.pitch, rate);
    const buffer = context.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data);
    samples.set(drum.pitch, {
      buffer,
      rootMidi: drum.pitch,
      sustain: false,
      percussion: true,
      loopStart: 0,
      loopEnd: buffer.duration,
    });
  }
  kit = { kind: 'soundfont', samples };
  return kit;
}
