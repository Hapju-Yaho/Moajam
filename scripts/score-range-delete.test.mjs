import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const m = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const note = (id, part, beats = 1) => ({
  id,
  part,
  beats,
  pitch: 64,
  string: 1,
  fret: 0,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
});
const base = {
  title: 'Range deletion',
  bpm: 120,
  parts: ['Guitar', 'Bass'],
  sync: { a: 1 },
  measureLengths: { Guitar: { 0: 4, 1: 4 } },
  notes: [
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => note(id, 'Guitar')),
    note('bass', 'Bass', 8),
  ],
};
test('clear a range with explicit measure lengths, then refill without splitting across bars', () => {
  const cleared = m.clearScoreNotes(base, ['a', 'b', 'c', 'd']);
  assert.equal(m.scoreMeasureDuration(cleared, 'Guitar', 0), 4);
  assert.deepEqual(
    m.scoreMeasures(cleared, 'Guitar')[1].map((f) => f.note.id),
    ['e', 'f', 'g', 'h'],
  );
  assert.equal(cleared.sync.a, undefined);
  assert.deepEqual(
    cleared.notes.filter((n) => n.part === 'Bass'),
    base.notes.filter((n) => n.part === 'Bass'),
  );
  const duration = m.setScoreDuration(cleared, 'a', 1, () => crypto.randomUUID());
  const filled = m.setScoreFret(duration, 'a', 1, 3);
  assert.equal(filled.notes.find((n) => n.id === 'a').beats, 1);
  assert.equal(m.scoreMeasures(filled, 'Guitar')[0].filter((f) => f.note.id === 'a').length, 1);
  assert.ok(!m.scoreMeasures(filled, 'Guitar')[1].some((f) => f.note.id === 'a'));
});
test('clearing a sustained range and inserting inside it preserves later notes and total time', () => {
  const score = {
    ...base,
    measureLengths: undefined,
    notes: [note('long', 'Guitar', 8), note('after', 'Guitar', 4), note('bass', 'Bass', 12)],
  };
  const cleared = m.clearScoreNotes(score, ['long']);
  const split = m.setScoreDuration(cleared, 'long', 1, () => crypto.randomUUID(), 4);
  const filled = m.setScoreFret(split, 'long', 1, 5);
  assert.equal(m.scoreMeasureCount(filled, 'Guitar'), 3);
  assert.equal(m.scoreMeasures(filled, 'Guitar')[1][0].note.id, 'long');
  assert.deepEqual(
    m.scoreMeasures(filled, 'Guitar')[2].map((f) => f.note.id),
    ['after'],
  );
  assert.equal(m.scoreMeasureStart(filled, 'Guitar', 2), 8);
});
