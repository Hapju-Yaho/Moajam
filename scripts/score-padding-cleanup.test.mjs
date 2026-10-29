import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const { ensemblePlaybackScore } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url))
);
const note = (id, part, beats, blank = false) => ({
  id,
  part,
  beats,
  pitch: 36,
  rest: blank,
  blank,
  tones: blank ? [] : [{ pitch: 36 }],
  accent: false,
  chord: '',
  lyric: '',
});
const base = () => ({
  title: 'Padding',
  bpm: 120,
  parts: ['Hands', 'Feet'],
  instruments: { Hands: 'drums', Feet: 'drums' },
  drumVoices: { Hands: 'Feet' },
  sync: { next: 4.5 },
  measureLengths: { Feet: { 0: 4.5 } },
  beatChords: { Feet: { 4.5: 'C' } },
  notes: [
    note('hands', 'Hands', 4),
    note('hands-next', 'Hands', 4),
    note('rest', 'Feet', 0.5, true),
    note('kick', 'Feet', 0.5),
    note('gap', 'Feet', 3.5, true),
    note('next', 'Feet', 4),
  ],
});
test('old overlong drum bar loses only hidden tail, preserves following notes and retimes anchors', () => {
  const score = base(),
    before = structuredClone(score);
  let id = 0;
  const next = model.cleanScoreMeasurePadding(score, () => `new-${id++}`);
  assert.equal(model.scoreMeasureDuration(next, 'Feet', 0), 4);
  assert.equal(model.scoreMeasureStart(next, 'Feet', 1), 4);
  assert.deepEqual(
    next.notes.find((n) => n.id === 'next'),
    score.notes.find((n) => n.id === 'next'),
  );
  assert.equal(next.beatChords.Feet[4], 'C');
  assert.deepEqual(next.sync, {});
  assert.deepEqual(score, before);
  assert.equal(model.cleanScoreMeasurePadding(next), next);
  const shared = ensemblePlaybackScore(next, next.parts, 'Hands').score;
  assert.equal(model.scoreMeasureStart(shared, 'Hands', 1), 4);
});
test('growing a note consumes trailing blank time instead of delaying next bar', () => {
  const score = {
    ...base(),
    measureLengths: { Feet: { 0: 4 } },
    notes: base().notes.map((n) => (n.id === 'gap' ? { ...n, beats: 3 } : n)),
  };
  const next = model.setScoreDuration(score, 'kick', 1, () => 'split');
  assert.equal(model.scoreMeasureDuration(next, 'Feet', 0), 4);
  assert.equal(model.scoreMeasureStart(next, 'Feet', 1), 4);
  const rows = model.scoreMeasures(next, 'Feet');
  assert.equal(rows[1][0].note.id, 'next');
  assert.equal(next.notes.find((n) => n.id === 'kick').beats, 1);
});
test('explicit rests and sounding notes beyond nominal length are never removed', () => {
  for (const rest of [true, false]) {
    const score = base();
    score.notes = score.notes.map((n) => (n.id === 'gap' ? { ...n, blank: false, rest } : n));
    assert.equal(model.cleanScoreMeasurePadding(score), score);
  }
  const empty = base();
  empty.notes = empty.notes.map((n) =>
    n.part === 'Feet' ? { ...n, blank: true, rest: true, tones: [] } : n,
  );
  const cleaned = model.cleanScoreMeasurePadding(empty);
  assert.equal(model.scoreMeasureDuration(cleaned, 'Feet', 0), 4);
  assert.equal(model.scoreMeasureStart(cleaned, 'Feet', 1), 4);
});
