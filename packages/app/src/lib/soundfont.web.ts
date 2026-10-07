import { isSoundfontInstrument, type SoundfontInstrumentId } from './soundfontCatalog';
import { prepareDrumKit } from './drumKit.web';
import type { PreparedInstrumentSample, PreparedPlaybackInstrument } from './instrumentSample.web';

const banks = new Map<SoundfontInstrumentId, Promise<Map<number, string>>>();
const decoded = new Map<string, Promise<AudioBuffer>>();

// The rendered soundfont recordings are quiet. Apply one fixed gain to the
// entire note (linked across stereo channels), leaving its waveform and decay
// intact. Chord mixing and accent headroom are handled by scoreAudio.
export function normalizeSoundfontVolume(buffer: AudioBuffer): AudioBuffer {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const value of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value));
  }
  if (!peak) return buffer;
  const gain = Math.min(16, 0.85 / peak);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) data[index] *= gain;
  }
  return buffer;
}

export function soundfontMidi(note: string): number {
  const match = /^([A-G])(b|#)?(-?\d)$/.exec(note);
  if (!match) throw new Error('악기 음원에 잘못된 음높이가 있어요.');
  const step = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]]!;
  return (Number(match[3]) + 1) * 12 + step + (match[2] === 'b' ? -1 : match[2] === '#' ? 1 : 0);
}

async function loadBank(id: SoundfontInstrumentId) {
  if (!isSoundfontInstrument(id)) throw new Error('사용할 악기를 다시 선택해주세요.');
  let pending = banks.get(id);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`/soundfonts/fluidr3/${id}.json`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error('악기 음원을 불러오지 못했어요. 다시 재생해주세요.');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('악기 음원을 읽을 수 없어요.');
      const notes = new Map<number, string>();
      for (const [name, value] of Object.entries(data)) {
        if (typeof value !== 'string' || !value.startsWith('data:audio/mp3;base64,'))
          throw new Error('악기 음원 형식이 올바르지 않아요.');
        notes.set(soundfontMidi(name), value);
      }
      if (!notes.size) throw new Error('악기 음원이 비어 있어요.');
      return notes;
    })();
    banks.set(id, pending);
    if (banks.size > 4) banks.delete(banks.keys().next().value!);
    void pending.catch(() => {
      if (banks.get(id) === pending) banks.delete(id);
    });
  }
  return pending;
}

export async function prepareSoundfontInstrument(
  id: SoundfontInstrumentId,
  pitches: number[],
): Promise<PreparedPlaybackInstrument> {
  if (id === 'drum_kit') return prepareDrumKit();
  const bank = await loadBank(id);
  const roots = [...bank.keys()];
  const nearest = (pitch: number) =>
    roots.reduce((best, root) => (Math.abs(root - pitch) < Math.abs(best - pitch) ? root : best));
  const needed = [...new Set(pitches.filter(Number.isFinite).map(nearest))];
  if (!needed.length) needed.push(nearest(60));
  const samples = new Map<number, PreparedInstrumentSample>();
  await Promise.all(
    needed.map(async (rootMidi) => {
      const key = `${id}/${rootMidi}`;
      let pending = decoded.get(key);
      if (!pending) {
        pending = (async () => {
          const bytes = Uint8Array.from(atob(bank.get(rootMidi)!.split(',')[1]), (char) =>
            char.charCodeAt(0),
          );
          const context = new OfflineAudioContext(2, 1, 44100);
          return normalizeSoundfontVolume(await context.decodeAudioData(bytes.buffer));
        })();
        decoded.set(key, pending);
        if (decoded.size > 96) decoded.delete(decoded.keys().next().value!);
        void pending.catch(() => {
          if (decoded.get(key) === pending) decoded.delete(key);
        });
      }
      const buffer = await pending;
      samples.set(rootMidi, {
        buffer,
        rootMidi,
        sustain: false,
        loopStart: 0,
        loopEnd: buffer.duration,
      });
    }),
  );
  return { kind: 'soundfont', samples };
}
