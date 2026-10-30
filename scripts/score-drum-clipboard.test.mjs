import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const { copyScoreSelection, pasteScoreSelection, scoreClipboardDuration, scorePasteConflicts } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreDrumClipboard.ts', import.meta.url))
);
const { readScoreClipboard } = await import(
  moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
);
const note = (id, part, pitch, beats, rest = false) => ({
  id,
  part,
  pitch,
  beats,
  rest,
  accent: false,
  chord: '',
  lyric: '',
  tones: rest ? [] : [{ pitch }],
});
const source = () => ({
  title: 'Drums',
  bpm: 120,
  parts: ['Hands', 'Feet', 'Guitar'],
  instruments: { Hands: 'drums', Feet: 'drums', Guitar: 'guitar' },
  drumVoices: { Hands: 'Feet' },
  sync: {},
  notes: [
    note('h0', 'Hands', 42, 1),
    note('h1', 'Hands', 38, 1),
    note('h2', 'Hands', 42, 2),
    note('h3', 'Hands', 49, 4),
    note('f0', 'Feet', 36, 2),
    note('f1', 'Feet', 44, 2),
    note('f2', 'Feet', 36, 1),
    note('f3', 'Feet', 60, 3, true),
    note('g', 'Guitar', 64, 8),
  ],
});
const timeline = (score, part) => {
  let at = 0;
  return score.notes
    .filter((n) => n.part === part)
    .map((n) => {
      const row = { at, beats: n.beats, pitch: n.pitch, rest: n.rest };
      at += n.beats;
      return row;
    });
};
let sequence = 0;
const makeId = () => `paste-${++sequence}`;
const roundTrip = (notes) =>
  readScoreClipboard(JSON.stringify({ type: 'moajam-score', version: 1, notes }));

test('paired drum overwrite aligns by measure when old lower-voice bars have extra time', async () => {
  const { alignScoreMeasures, scoreMeasureStart } = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
  const score = source();
  score.measureLengths = { Feet: { 1: 4.5 } };
  score.notes = [
    note('u1', 'Hands', 42, 4), note('u2', 'Hands', 38, 4),
    { ...note('u3', 'Hands', 60, 4, true), blank: true }, note('u4', 'Hands', 49, 4),
    note('l1', 'Feet', 36, 4), note('l2', 'Feet', 44, 4.5),
    { ...note('l3', 'Feet', 60, 4, true), blank: true }, note('l4', 'Feet', 36, 4),
  ];
  const copied = copyScoreSelection(score, 'Hands', ['u1', 'l1']);
  for (const active of ['Hands', 'Feet']) {
    const beat = scoreMeasureStart(score, active, 2);
    assert.equal(scorePasteConflicts(score, active, copied, beat), false);
    const result = alignScoreMeasures(pasteScoreSelection(score, active, copied, beat, makeId, true).score, makeId);
    assert.ok(timeline(result, 'Hands').some(n => n.at === 8 && n.pitch === 42 && !n.rest));
    assert.ok(timeline(result, 'Feet').some(n => n.at === 8.5 && n.pitch === 36 && !n.rest));
    assert.ok(result.notes.some(n => n.id === 'l2' && n.beats === 4.5));
    assert.ok(result.notes.some(n => n.id === 'l4'));
  }
});

test('pasting at bar three uses clicked beat even when lower rest starts in bar two', async () => {
  const { scoreVoiceCursor } = await import(moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url)));
  const score = source();
  score.notes = [
    ...Array.from({ length: 8 }, (_, i) => note(`upper-${i}`, 'Hands', 42, 1)),
    { ...note('upper-empty', 'Hands', 60, 4, true), blank: true },
    note('upper-four', 'Hands', 42, 4),
    note('lower-one', 'Feet', 36, 4),
    note('lower-two', 'Feet', 36, 3.5),
    note('lower-rest', 'Feet', 60, 4.5, true),
    note('lower-four', 'Feet', 36, 4),
  ];
  const copied = copyScoreSelection(score, 'Hands', ['upper-0', 'upper-1', 'upper-2', 'upper-3', 'lower-one']);
  const cursor = scoreVoiceCursor(score, 'Feet', 2, 0);
  assert.equal(cursor.beat, 8);
  assert.equal(scorePasteConflicts(score, 'Feet', copied, cursor.beat), false);
  assert.equal(scorePasteConflicts(score, 'Feet', copied, 7.5), true);
  const result = pasteScoreSelection(score, 'Feet', copied, cursor.beat, makeId, true).score;
  assert.equal(timeline(result, 'Hands').find(row => row.at === 12).pitch, 42);
  assert.equal(timeline(result, 'Feet').find(row => row.at === 12).pitch, 36);
  assert.equal(result.notes.find(n => n.id === 'lower-two').beats, 3.5);
});

test('overwrite paste replaces paired voices without shifting later bars or deleting the source', () => {
  const original = source();
  const copied = copyScoreSelection(original, 'Hands', ['h3', 'f2', 'f3']);
  assert.equal(scorePasteConflicts(original, 'Hands', copied, 0), true);
  const result = pasteScoreSelection(original, 'Hands', copied, 0, makeId, true).score;
  assert.deepEqual(timeline(result, 'Hands'), [
    { at: 0, beats: 4, pitch: 49, rest: false },
    { at: 4, beats: 4, pitch: 49, rest: false },
  ]);
  assert.deepEqual(timeline(result, 'Feet'), [
    { at: 0, beats: 1, pitch: 36, rest: false },
    { at: 1, beats: 3, pitch: 60, rest: true },
    { at: 4, beats: 1, pitch: 36, rest: false },
    { at: 5, beats: 3, pitch: 60, rest: true },
  ]);
  assert.deepEqual(result.notes.filter(n => n.part === 'Guitar'), original.notes.filter(n => n.part === 'Guitar'));
  assert.ok(result.notes.some(n => n.id === 'h3'));
});

test('overwrite paste keeps partial boundary notes and silence needs no confirmation', () => {
  const original = source();
  const copied = copyScoreSelection(original, 'Hands', ['h0']);
  const result = pasteScoreSelection(original, 'Hands', copied, 5, makeId, true).score;
  assert.deepEqual(timeline(result, 'Hands').filter(n => n.at >= 4), [
    { at: 4, beats: 1, pitch: 49, rest: false },
    { at: 5, beats: 1, pitch: 42, rest: false },
    { at: 6, beats: 2, pitch: 49, rest: false },
  ]);
  assert.equal(scorePasteConflicts(original, 'Feet', copied, 5), false);
  assert.equal(scorePasteConflicts(original, 'Hands', copied, 8), false);
});

test('two drum voices copy a shared interval and survive system clipboard round-trip', () => {
  const score = source(),
    before = structuredClone(score);
  const copied = roundTrip(
    copyScoreSelection(score, 'Hands', ['h0', 'h1', 'h2', 'h3', 'f0', 'f1', 'f2', 'f3']),
  );
  assert.ok(copied);
  assert.equal(scoreClipboardDuration(copied), 8);
  assert.equal(
    copied.filter((n) => n.copiedDrumVoice === 'upper').reduce((s, n) => s + n.beats, 0),
    8,
  );
  assert.equal(
    copied.filter((n) => n.copiedDrumVoice === 'lower').reduce((s, n) => s + n.beats, 0),
    8,
  );
  const { score: next } = pasteScoreSelection(score, 'Hands', copied, 8, makeId);
  assert.deepEqual(
    timeline(next, 'Hands').slice(4),
    timeline(score, 'Hands').map((n) => ({ ...n, at: n.at + 8 })),
  );
  assert.deepEqual(
    timeline(next, 'Feet').slice(4),
    timeline(score, 'Feet').map((n) => ({ ...n, at: n.at + 8 })),
  );
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Guitar'),
    score.notes.filter((n) => n.part === 'Guitar'),
  );
  assert.equal(new Set(next.notes.map((n) => n.id)).size, next.notes.length);
  assert.deepEqual(score, before);
});

test('sparse selection keeps silent gaps and lower-only selections in the correct voice', () => {
  const score = source();
  const copied = roundTrip(copyScoreSelection(score, 'Hands', ['h1', 'h3', 'f1']));
  assert.equal(scoreClipboardDuration(copied), 7);
  const target = {
    title: 'New',
    bpm: 120,
    parts: ['Kit'],
    instruments: { Kit: 'drums' },
    notes: [],
    sync: {},
  };
  const { score: next } = pasteScoreSelection(target, 'Kit', copied, 0, makeId);
  const lower = next.drumVoices.Kit;
  assert.deepEqual(
    timeline(next, 'Kit')
      .filter((n) => !n.rest)
      .map((n) => [n.at, n.pitch]),
    [
      [0, 38],
      [3, 49],
    ],
  );
  assert.deepEqual(
    timeline(next, lower)
      .filter((n) => !n.rest)
      .map((n) => [n.at, n.pitch]),
    [[1, 44]],
  );
  const feet = copyScoreSelection(score, 'Hands', ['f0', 'f1']);
  const result = pasteScoreSelection(target, 'Kit', roundTrip(feet), 0, makeId).score;
  assert.equal(result.notes.filter((n) => n.part === 'Kit' && !n.rest).length, 0);
  assert.deepEqual(
    result.notes.filter((n) => n.part === result.drumVoices.Kit && !n.rest).map((n) => n.pitch),
    [36, 44],
  );
});

test('pasting from active lower voice inserts both timelines at one beat, including inside a rest', () => {
  const score = source(),
    copied = roundTrip(copyScoreSelection(score, 'Feet', ['h0', 'h1', 'f0']));
  score.notes.find((n) => n.id === 'f0').rest = true;
  score.notes.find((n) => n.id === 'f0').tones = [];
  const { score: next } = pasteScoreSelection(score, 'Feet', copied, 1, makeId);
  assert.equal(timeline(next, 'Hands').at(-1).at + timeline(next, 'Hands').at(-1).beats, 10);
  assert.equal(timeline(next, 'Feet').at(-1).at + timeline(next, 'Feet').at(-1).beats, 10);
  assert.deepEqual(
    timeline(next, 'Feet')
      .filter((n) => !n.rest)
      .map((n) => [n.at, n.pitch]),
    [
      [1, 36],
      [4, 44],
      [6, 36],
    ],
  );
  assert.deepEqual(
    timeline(next, 'Hands')
      .slice(1, 3)
      .map((n) => [n.at, n.pitch]),
    [
      [1, 42],
      [2, 38],
    ],
  );
});

test('legacy single-voice copy remains compatible; invalid paired metadata is rejected atomically', () => {
  const score = source(),
    before = structuredClone(score),
    single = roundTrip(copyScoreSelection(score, 'Hands', ['h1']));
  assert.ok(single.every((n) => !n.copiedDrumVoice));
  assert.equal(scoreClipboardDuration(single), 1);
  assert.ok(pasteScoreSelection(score, 'Hands', single, 1, makeId).ids.length);
  const paired = copyScoreSelection(score, 'Hands', ['h0', 'f0']);
  assert.throws(() => pasteScoreSelection(score, 'Guitar', paired, 0, makeId));
  assert.throws(() =>
    pasteScoreSelection(
      score,
      'Hands',
      paired.filter((n) => n.copiedDrumVoice === 'upper'),
      0,
      makeId,
    ),
  );
  assert.equal(roundTrip([{ ...single[0], copiedDrumVoice: 'wrong' }]), null);
  assert.deepEqual(score, before);
});

test('pasting inside a sounding voice fails without erasing its tail or changing either timeline', () => {
  const score = source(),
    before = structuredClone(score);
  const copied = roundTrip(copyScoreSelection(score, 'Hands', ['h0', 'f0']));
  assert.throws(() => pasteScoreSelection(score, 'Hands', copied, 1, makeId));
  assert.deepEqual(score, before);
});
test('repeated paired pastes keep originals, independent cursor duration and clipboard reusable', () => {
  let score = source();
  const original = structuredClone(score.notes),
    copied = roundTrip(
      copyScoreSelection(
        score,
        'Hands',
        score.notes.filter((n) => n.part !== 'Guitar').map((n) => n.id),
      ),
    ),
    saved = structuredClone(copied);
  let at = 8;
  for (let i = 0; i < 5; i++) {
    score = pasteScoreSelection(score, 'Hands', copied, at, makeId).score;
    at += scoreClipboardDuration(copied);
    for (const note of original)
      assert.deepEqual(
        score.notes.find((n) => n.id === note.id),
        note,
      );
  }
  assert.equal(at, 48);
  assert.equal(timeline(score, 'Hands').at(-1).at + timeline(score, 'Hands').at(-1).beats, 48);
  assert.equal(timeline(score, 'Feet').at(-1).at + timeline(score, 'Feet').at(-1).beats, 48);
  assert.deepEqual(copied, saved);
});

test('copy-delete-paste near capacity compacts deleted blanks instead of counting every cleared attack', async () => {
  const { clearScoreNotes } = await import(
    moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
  );
  const score = source();
  score.parts = ['Hands', 'Feet'];
  score.notes = ['Hands', 'Feet'].flatMap((part) =>
    Array.from({ length: 900 }, (_, i) =>
      note(`${part}-${i}`, part, part === 'Hands' ? 42 : 36, 0.25),
    ),
  );
  const chosen = score.notes.filter((n) => Number(n.id.split('-').at(-1)) < 500).map((n) => n.id);
  const copied = roundTrip(copyScoreSelection(score, 'Hands', chosen));
  const cleared = clearScoreNotes(score, chosen),
    before = structuredClone(cleared);
  assert.equal(cleared.notes.length, 1800);
  const result = pasteScoreSelection(cleared, 'Hands', copied, 0, makeId).score;
  assert.ok(result.notes.length < 2000);
  for (const part of score.parts) {
    assert.equal(result.notes.filter((n) => n.part === part && !n.rest).length, 900);
    assert.equal(
      result.notes.filter((n) => n.part === part).reduce((s, n) => s + n.beats, 0),
      350,
    );
  }
  for (const n of score.notes.filter((n) => !chosen.includes(n.id)))
    assert.deepEqual(
      result.notes.find((r) => r.id === n.id),
      n,
    );
  assert.deepEqual(cleared, before);
});
test('blank compaction preserves written rests, anchored blanks and beat annotations', async () => {
  const { compactScoreBlanks } = await import(
    moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
  );
  const score = source();
  score.notes = [
    note('a', 'Hands', 60, 1, true),
    note('b', 'Hands', 60, 1, true),
    note('c', 'Hands', 60, 1, true),
    note('written', 'Hands', 60, 1, true),
    note('d', 'Hands', 60, 1, true),
  ];
  for (const n of score.notes) if (n.id !== 'written') n.blank = true;
  score.sync = { c: 2 };
  score.beatChords = { Hands: { 1: 'C' } };
  const result = compactScoreBlanks(score);
  assert.deepEqual(
    result.notes.map((n) => [n.id, n.beats]),
    [
      ['a', 2],
      ['c', 1],
      ['written', 1],
      ['d', 1],
    ],
  );
  assert.deepEqual(result.sync, score.sync);
  assert.deepEqual(result.beatChords, score.beatChords);
});
