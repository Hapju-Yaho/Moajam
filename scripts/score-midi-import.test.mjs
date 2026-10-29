import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const src = (p) => import(moduleUrl(new URL(p, import.meta.url)));
const { readScoreMidi, insertScoreMidi, midiInsertionRange } = await src(
  '../packages/app/src/lib/scoreMidiImport.ts',
);
const { scoreToMidi } = await src('../packages/app/src/lib/scoreMidi.ts');
const { validateScoreDocument } = await src('../packages/app/src/lib/scoreFile.ts');
const note = (id, part, pitch, beats) => ({
  id,
  part,
  pitch,
  beats,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  tones: [{ pitch }],
});
const base = () => ({
  title: 'Import',
  bpm: 90,
  timeSignature: { beats: 4, beatType: 4 },
  parts: ['Keys', 'Bass'],
  instruments: { Keys: 'piano', Bass: 'bass' },
  sync: {},
  notes: [note('k', 'Keys', 60, 4), note('b', 'Bass', 40, 4)],
});
const midi = {
  bpm: 160,
  meter: { beats: 4, beatType: 4 },
  beats: 4,
  bars: 1,
  warnings: [],
  tracks: [
    {
      name: 'Melody',
      channel: 0,
      program: 0,
      notes: [
        { pitch: 64, start: 0, end: 1 },
        { pitch: 64, start: 1, end: 2 },
        { pitch: 67, start: 3, end: 4 },
      ],
    },
  ],
};
let serial = 0;
const id = () => `import-${serial++}`;
test('reads exported SMF metadata, tracks, note positions and rejects malformed files', () => {
  const score = base();
  const bytes = scoreToMidi(score, ['Keys', 'Bass']);
  const parsed = readScoreMidi(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.equal(parsed.bars, 1);
  assert.equal(parsed.bpm, 90);
  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.tracks[0].notes[0].start, 0);
  assert.equal(parsed.tracks[0].notes[0].end, 4);
  assert.throws(() => readScoreMidi(new ArrayBuffer(2)));
  assert.throws(() => readScoreMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + 20)));
});
test('preview detects overwrite, insertion replaces only target bars, fills rests and keeps BPM', () => {
  const score = base(),
    original = JSON.stringify(score);
  assert.equal(midiInsertionRange(score, midi, 'Keys', 1).conflicts, true);
  assert.equal(midiInsertionRange(score, midi, 'Keys', 2).conflicts, false);
  const inserted = insertScoreMidi(score, midi, 0, 'Keys', 1, 0.25, id);
  assert.equal(inserted.bpm, 90);
  assert.deepEqual(inserted.timeSignature, score.timeSignature);
  assert.deepEqual(
    inserted.notes.find((n) => n.id === 'b'),
    score.notes[1],
  );
  const keys = inserted.notes.filter((n) => n.part === 'Keys');
  assert.equal(
    keys.reduce((sum, n) => sum + n.beats, 0),
    4,
  );
  assert.deepEqual(
    keys.filter((n) => !n.rest).map((n) => n.pitch),
    [64, 64, 67],
  );
  assert.ok(keys.some((n) => n.rest && n.beats === 1));
  assert.equal(keys[0].connection, undefined);
  assert.equal(JSON.stringify(score), original);
  assert.ok(
    validateScoreDocument(inserted),
  );
});
test('keyboard/drum logical parts route both voices and report conflicts on either staff', () => {
  const score = base();
  score.parts = ['Keys', 'Left', 'Bass'];
  score.keyboardStaves = { Keys: 'Left' };
  score.instruments.Left = 'pianoBass';
  score.notes.push(note('left', 'Left', 48, 4));
  const data = {
    ...midi,
    tracks: [
      {
        ...midi.tracks[0],
        notes: [
          { pitch: 48, start: 0, end: 4 },
          { pitch: 72, start: 0, end: 4 },
        ],
      },
    ],
  };
  const result = insertScoreMidi(score, data, 0, 'Keys', 1, 0.25, id);
  assert.ok(result.notes.filter((n) => n.part === 'Left' && !n.rest).every((n) => n.pitch === 48));
  assert.ok(result.notes.filter((n) => n.part === 'Keys' && !n.rest).every((n) => n.pitch === 72));
});
test('sustained notes are divided at barlines with ties and irregular timing snaps to the grid', () => {
  const data = {
    ...midi,
    beats: 8,
    bars: 2,
    tracks: [{ ...midi.tracks[0], notes: [{ pitch: 65, start: 0.03, end: 7.96 }] }],
  };
  const result = insertScoreMidi(base(), data, 0, 'Keys', 2, 0.25, id);
  const notes = result.notes.filter((n) => n.part === 'Keys' && n.pitch === 65);
  assert.deepEqual(
    notes.map((n) => n.beats),
    [4, 4],
  );
  assert.equal(notes[0].connection.targetId, notes[1].id);
});
