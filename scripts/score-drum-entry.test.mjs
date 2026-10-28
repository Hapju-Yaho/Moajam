import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const { enterDrumVoice, drumMeasureComplete } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreDrumEntry.ts', import.meta.url))
);
const { noteTones, scoreMeasures, scoreMeasureCount, scorePlaybackFrom } = await import(
  moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
);
const { ensemblePlaybackScore } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url))
);
let sequence = 0;
const id = () => `entry-${++sequence}`;
const initial = () => ({
  title: 'Drums',
  bpm: 120,
  parts: ['Kit'],
  instruments: { Kit: 'drums' },
  notes: [],
  sync: {},
});
const template = (beats) => ({
  id: id(),
  part: 'Kit',
  pitch: 38,
  beats,
  rest: true,
  blank: true,
  chord: '',
  lyric: '',
  accent: false,
});
const enter = (score, pitch, offset, beats = 1, part = 'Kit') =>
  enterDrumVoice(score, part, template(beats), 0, offset, pitch, 'normal', id);

test('kit pieces route to independent hand/foot voices at the same beat, irrespective of active voice', () => {
  let result = enter(initial(), 42, 0, 0.5);
  assert.equal(result.voice, 'Kit');
  result = enter(result.score, 36, 0);
  const lower = result.voice;
  assert.notEqual(lower, 'Kit');
  assert.equal(result.beat, 0);
  result = enter(result.score, 38, 0, 0.5, lower);
  assert.equal(result.voice, 'Kit');
  assert.deepEqual(
    noteTones(result.score.notes.find((n) => n.id === result.id))
      .map((t) => t.pitch)
      .sort(),
    [38, 42],
  );
  assert.equal(result.score.notes.find((n) => n.part === lower && !n.blank && !n.rest).beats, 1);
  result = enter(result.score, 44, 2);
  assert.equal(result.voice, lower);
  assert.equal(result.beat, 2);
  assert.equal(scoreMeasureCount(result.score, lower), scoreMeasureCount(result.score, 'Kit'));
});

test('filling a later blank keeps earlier hits, later measures and independent rhythms in place', () => {
  let result = enter(initial(), 42, 0, 0.5);
  const handId = result.id;
  result = enter(result.score, 42, 0.5, 0.5);
  result = enter(result.score, 36, 0, 2);
  const kickId = result.id;
  result = enter(result.score, 36, 2, 1);
  assert.equal(result.beat, 2);
  assert.equal(result.score.notes.find((n) => n.id === kickId).beats, 2);
  assert.equal(result.score.notes.find((n) => n.id === handId).beats, 0.5);
  const lower = result.voice;
  const fragments = scoreMeasures(result.score, lower)[0].filter((f) => !f.note.blank);
  assert.deepEqual(
    fragments.map((f) => f.offset),
    [0, 2],
  );
  assert.throws(() => enter(result.score, 36, 1), /시작 위치/);
});

test('automatic drum entry fits the remaining bar and does not push a later bar', () => {
  let result = enter(initial(), 42, 0, 0.5);
  result = enterDrumVoice(result.score, 'Kit', template(1), 1, 0, 36, 'normal', id);
  const later = result.score.notes.find((n) => n.id === result.id);
  result = enter(result.score, 38, 3.5, 1);
  assert.equal(result.score.notes.find((n) => n.id === result.id).beats, 0.5);
  assert.deepEqual(
    result.score.notes.find((n) => n.id === later.id),
    later,
  );
  assert.equal(
    scoreMeasures(result.score, 'Kit')[0].reduce((sum, f) => sum + f.beats, 0),
    4,
  );
});

test('four quarter hits across hand and foot voices complete one bar on either selected voice', () => {
  let score = initial();
  for (const [offset, pitch] of [36, 38, 36, 38].entries())
    score = enter(score, pitch, offset).score;
  const fragments = score.parts.flatMap((part) => scoreMeasures(score, part)[0]);
  assert.equal(drumMeasureComplete(fragments, 4), true);
  assert.equal(scoreMeasureCount(score, 'Kit'), 1);
  const shared = ensemblePlaybackScore(score, score.parts, 'Kit').score;
  const hits = score.parts
    .flatMap((part) =>
      scorePlaybackFrom(shared, part)
        .events.filter((e) => !e.note.blank && !e.note.rest)
        .map((e) => (e.offset * 60) / shared.bpm),
    )
    .sort((a, b) => a - b);
  assert.deepEqual(hits, [0, 0.5, 1, 1.5]);
});

test('simultaneous voices do not count overlapping beats twice or hide a remaining gap', () => {
  let score = enter(initial(), 42, 0, 2).score;
  score = enter(score, 36, 0, 2).score;
  const fragments = () => score.parts.flatMap((part) => scoreMeasures(score, part)[0]);
  assert.equal(drumMeasureComplete(fragments(), 4), false);
  score = enter(score, 42, 2, 2).score;
  assert.equal(drumMeasureComplete(fragments(), 4), true);
});

test('a three-beat hand voice and last-beat eighth-note feet complete the displayed bar', () => {
  let score = initial();
  for (const [offset, beats] of [
    [0, 0.5],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
  ])
    score = enter(score, 38, offset, beats).score;
  score = enter(score, 36, 3, 0.5).score;
  score = enter(score, 36, 3.5, 0.5).score;
  // Older duration edits can leave a shorter capacity on the hand staff.
  score = { ...score, measureLengths: { ...score.measureLengths, Kit: { 0: 3 } } };
  const fragments = score.parts.flatMap((part) => scoreMeasures(score, part)[0]);
  assert.equal(drumMeasureComplete(fragments, 4), true);
  assert.equal(
    drumMeasureComplete(
      fragments.filter((f) => f.note.part === 'Kit'),
      4,
    ),
    false,
  );
});

test('four quarter notes in each successive bar retain a steady shared playback clock', () => {
  let score = initial();
  for (let bar = 0; bar < 2; bar++)
    for (let offset = 0; offset < 4; offset++)
      score = enterDrumVoice(score, 'Kit', template(1), bar, offset, 42, 'normal', id).score;
  const playback = ensemblePlaybackScore(score, score.parts, 'Kit');
  const passage = scorePlaybackFrom(playback.score, 'Kit');
  assert.deepEqual(
    passage.events.filter((e) => !e.note.blank).map((e) => e.offset),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  for (const selected of score.parts) {
    const clock = ensemblePlaybackScore(score, score.parts, selected);
    assert.equal(clock.toSelected(4), 4);
    for (let bar = 0; bar < 2; bar++)
      assert.equal(
        drumMeasureComplete(
          score.parts.flatMap((p) => scoreMeasures(score, p)[bar]),
          4,
        ),
        true,
      );
  }
});
