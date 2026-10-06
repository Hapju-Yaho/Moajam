import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
const { outputText } = ts.transpileModule(
  readFileSync(new URL('../packages/app/src/lib/midi.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
);
const { parseMidi, encodeMidi, cropMidi, isMidiFile } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
);
const fixture = (tracks, format = tracks.length > 1 ? 1 : 0) => {
  const bytes = [77, 84, 104, 100, 0, 0, 0, 6, 0, format, 0, tracks.length, 1, 224];
  for (const track of tracks) {
    const n = track.length;
    bytes.push(77, 84, 114, 107, n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...track);
  }
  return Uint8Array.from(bytes).buffer;
};
const note = { id: 'n', pitch: 60, start: 0.5, duration: 1, velocity: 96, channel: 2 };
test('MIDI export/import preserves polyphony, velocity, channels and silent tail', async () => {
  const original = { duration: 3, notes: [note, { ...note, id: 'chord', pitch: 64 }] };
  const parsed = parseMidi(await encodeMidi(original).arrayBuffer());
  assert.equal(parsed.duration, 3);
  assert.deepEqual(
    parsed.notes.map((n) => Object.fromEntries(Object.entries(n).filter(([key]) => key !== 'id'))),
    original.notes.map((n) =>
      Object.fromEntries(Object.entries(n).filter(([key]) => key !== 'id')),
    ),
  );
});
test('format 1 conductor tempo map applies across tracks and running note-on status can end notes', () => {
  const conductor = [0, 255, 81, 3, 7, 161, 32, 0x83, 0x60, 255, 81, 3, 15, 66, 64, 0, 255, 47, 0];
  const notes = [0, 144, 60, 100, 0x87, 0x40, 60, 0, 0, 255, 47, 0];
  const result = parseMidi(fixture([conductor, notes]));
  assert.equal(result.notes[0].duration, 1.5);
});
test('sustain pedal extends the released note until pedal-up', () => {
  const result = parseMidi(
    fixture([
      [
        0, 144, 60, 100, 0, 176, 64, 127, 0x83, 0x60, 128, 60, 0, 0x83, 0x60, 176, 64, 0, 0, 255,
        47, 0,
      ],
    ]),
  );
  assert.equal(result.notes[0].duration, 1);
});
test('archiving a cut MIDI clip includes only its visible segment and rebases notes', () => {
  const result = cropMidi(
    { duration: 4, notes: [note, { ...note, id: 'outside', start: 3 }] },
    0.75,
    0.5,
  );
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].start, 0);
  assert.equal(result.notes[0].duration, 0.5);
  assert.equal(result.duration, 0.5);
});
test('invalid files, truncated tracks, SMPTE division and invalid note data are rejected', () => {
  assert.throws(() => parseMidi(new ArrayBuffer(1)));
  const bytes = new Uint8Array(fixture([[0, 144, 60, 100]]));
  bytes[12] = 0xe7;
  assert.throws(() => parseMidi(bytes.buffer), /SMPTE/);
  assert.throws(() => parseMidi(fixture([[0, 144, 60]])));
  assert.throws(() => encodeMidi({ duration: 1, notes: [{ ...note, pitch: 128 }] }));
  assert.equal(isMidiFile({ name: 'notes.MID', type: '' }), true);
  assert.equal(isMidiFile({ name: 'notes', type: 'audio/midi' }), true);
  assert.equal(isMidiFile({ name: 'song.wav', type: 'audio/wav' }), false);
});
