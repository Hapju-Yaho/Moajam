import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const m = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const n = (id, beats, patch = {}) => ({
  id,
  part: 'Keys',
  pitch: 60,
  beats,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  ...patch,
});
test('tail entry fits remaining beats and leaves the following measure unchanged', () => {
  const score = {
    title: 'Tail',
    bpm: 120,
    parts: ['Keys'],
    instruments: { Keys: 'piano' },
    sync: {},
    notes: [n('first', 1), n('blank', 3, { rest: true, blank: true }), n('next', 4)],
  };
  const beats = m.scoreEntryDuration(score, 'Keys', 1, 4);
  assert.equal(beats, 3);
  const filled = m.setScoreDuration(score, 'blank', beats, () => crypto.randomUUID());
  assert.equal(m.scoreMeasureCount(filled, 'Keys'), 2);
  assert.deepEqual(
    m.scoreMeasures(filled, 'Keys')[1].map((f) => f.note.id),
    ['next'],
  );
  assert.equal(
    m.scoreMeasures(filled, 'Keys')[0].reduce((sum, f) => sum + f.beats, 0),
    4,
  );
});
test('tail entry uses fractional remaining beats and the current time signature', () => {
  const score = { title: 'Tail', bpm: 120, parts: ['Keys'], sync: {}, notes: [] };
  assert.equal(m.scoreEntryDuration(score, 'Keys', 2.5, 4), 1.5);
  assert.equal(
    m.scoreEntryDuration({ ...score, timeSignature: { beats: 3, beatType: 4 } }, 'Keys', 2, 2),
    1,
  );
  assert.equal(m.scoreEntryDuration(score, 'Keys', 4, 4), 4);
  assert.equal(
    m.scoreEntryDuration({ ...score, measureLengths: { Keys: { 0: 2 } } }, 'Keys', 2, 4, 0),
    2,
  );
});
