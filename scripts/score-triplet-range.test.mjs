import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const m = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const n = (id, part, beats = 1) => ({
  id,
  part,
  beats,
  pitch: 60,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
});
const score = {
  title: 'Triplet',
  bpm: 120,
  parts: ['Keys', 'Bass'],
  sync: { later: 8 },
  measureLengths: { Keys: { 0: 4, 1: 4 } },
  notes: [...Array.from({ length: 8 }, (_, i) => n('k' + i, 'Keys')), n('bass', 'Bass', 8)],
};
test('range triplets preserve meter, later note positions and the other instrument', () => {
  const next = m.setScoreTriplet(score, ['k0', 'k1', 'k2'], true);
  assert.equal(m.scoreMeasureDuration(next, 'Keys', 0), 4);
  assert.equal(m.scoreMeasureStart(next, 'Keys', 1), 4);
  const keys = next.notes.filter((n) => n.part === 'Keys');
  assert.equal(
    keys.slice(0, 3).reduce((s, n) => s + n.beats, 0),
    2,
  );
  assert.ok(keys[3].blank && keys[3].beats === 1);
  assert.equal(keys[4].id, 'k3');
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Bass'),
    score.notes.filter((n) => n.part === 'Bass'),
  );
  assert.equal(m.scorePlaybackFrom(next, 'Keys').endBeat, 8);
  const back = m.setScoreTriplet(next, ['k0', 'k1', 'k2'], false);
  assert.deepEqual(back.notes, score.notes);
  assert.deepEqual(back.measureLengths, score.measureLengths);
});
test('triplet conversion rejects a cross-bar selection without modifying the score', () => {
  const before = JSON.stringify(score);
  assert.throws(() => m.setScoreTriplet(score, ['k3', 'k4', 'k5'], true));
  assert.equal(JSON.stringify(score), before);
});
