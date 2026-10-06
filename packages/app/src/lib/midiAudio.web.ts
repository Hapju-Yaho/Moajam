import type { MidiSequence } from './midi';
import type { SoundfontInstrumentId } from './soundfontCatalog';
import { prepareSoundfontInstrument } from './soundfont.web';
import { scheduleScoreNote } from './scoreAudio.web';
const cache = new WeakMap<MidiSequence, Map<SoundfontInstrumentId, Promise<AudioBuffer>>>();
export function renderMidi(
  sequence: MidiSequence,
  instrument: SoundfontInstrumentId,
): Promise<AudioBuffer> {
  const instruments = cache.get(sequence) ?? new Map<SoundfontInstrumentId, Promise<AudioBuffer>>();
  cache.set(sequence, instruments);
  let pending = instruments.get(instrument);
  if (!pending) {
    pending = (async () => {
      const context = new OfflineAudioContext(
        2,
        Math.max(1, Math.ceil(sequence.duration * 44100)),
        44100,
      );
      if (sequence.notes.length) {
        const bank = await prepareSoundfontInstrument(
          instrument,
          sequence.notes.map((note) => note.pitch),
        );
        for (const note of sequence.notes) {
          const gain = context.createGain();
          gain.gain.value = note.velocity / 127;
          gain.connect(context.destination);
          scheduleScoreNote(
            context,
            gain,
            {
              id: note.id,
              part: 'MIDI',
              pitch: note.pitch,
              beats: note.duration * 2,
              rest: false,
              accent: false,
              chord: '',
              lyric: '',
            },
            note.start,
            120,
            note.duration * 2,
            bank,
          );
        }
      }
      return context.startRendering();
    })();
    instruments.set(instrument, pending);
    void pending.catch(() => instruments.delete(instrument));
  }
  return pending;
}
