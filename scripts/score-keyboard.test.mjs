/* global structuredClone */
import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const layout = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreLayout.ts', import.meta.url))
);
const files = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const { isBandScore } = await import(
  moduleUrl(new URL('../apps/server/src/workspaces/score-policy.ts', import.meta.url))
);
const note = (id, tones) => ({
  id,
  part: 'Piano',
  pitch: tones[0].pitch,
  tones,
  beats: 1,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
});
const chord = note('chord', [
  { pitch: 60, naturalPitch: 60 },
  { pitch: 61, naturalPitch: 60 },
  { pitch: 62, naturalPitch: 62 },
]);
const score = {
  title: 'Piano',
  bpm: 120,
  parts: ['Piano'],
  instruments: { Piano: 'piano' },
  notes: [chord],
  sync: {},
};

test('keyboard 1 follows the key signature and 2 sharpens naturals or cancels key alterations', () => {
  assert.deepEqual(model.scoreKeyboardInputAlters(60, 0), [0, 1]);
  assert.deepEqual(model.scoreKeyboardInputAlters(65, 1), [1, 0]);
  assert.deepEqual(model.scoreKeyboardInputAlters(71, -1), [-1, 0]);
  assert.deepEqual(model.scoreKeyboardInputAlters(60, -1), [0, 1]);
  assert.deepEqual(model.scoreKeyboardInputAlters(53, 1), [1, 0]);
  assert.deepEqual(model.scoreKeyboardInputAlters(59, -1), [-1, 0]);
  for (const fifths of [-7, 7]) {
    for (const pitch of [60, 62, 64, 65, 67, 69, 71])
      assert.deepEqual(model.scoreKeyboardInputAlters(pitch, fifths), [Math.sign(fifths), 0]);
  }
});

test('explicit spelling distinguishes C-sharp/D-flat and respects natural input under a key signature', () => {
  assert.equal(model.spellScoreTone({ pitch: 61, naturalPitch: 60 }, -3).step, 'C');
  assert.equal(model.spellScoreTone({ pitch: 61, naturalPitch: 62 }, 3).step, 'D');
  assert.equal(model.spellScoreTone({ pitch: 64, naturalPitch: 64 }, -4).alter, 0);
  assert.equal(model.nextScoreNaturalPitch(64, 1), 65);
  assert.equal(model.nextScoreNaturalPitch(65, -1), 64);
  assert.equal(model.nextScoreNaturalPitch(71, 1), 72);
  assert.equal(model.nextScoreNaturalPitch(24, -1), 24);
});

test('simultaneous natural/sharp get both signs and restore accidental state explicitly afterward', () => {
  const fragments = [
    chord,
    note('after', [{ pitch: 60, naturalPitch: 60 }]),
    note('repeat', [{ pitch: 60, naturalPitch: 60 }]),
  ].map((note, i) => ({ note, offset: i, beats: 1, continued: false, continues: false }));
  assert.deepEqual(model.scoreAccidentalMarks(fragments), [['♮', '♯', ''], ['♮'], ['']]);
  fragments[0].note = note('reversed', [...chord.tones].reverse());
  assert.deepEqual(model.scoreAccidentalMarks(fragments)[0], ['', '♯', '♮']);
});

test('heads alternate across both stem directions and accidental columns do not collide', () => {
  for (const direction of [-1, 1]) {
    const ys = [102, 102, 97, 92, 87];
    const offsets = layout.scoreChordHeadOffsets(ys, direction);
    for (let i = 0; i < ys.length; i++)
      for (let j = i + 1; j < ys.length; j++) {
        if (Math.abs(ys[i] - ys[j]) <= 5) assert.ok(Math.abs(offsets[i] - offsets[j]) >= 9);
      }
    assert.equal(offsets.includes(0), true);
    assert.ok(offsets.every((value) => value * direction <= 0));
  }
  assert.deepEqual(
    layout.scoreAccidentalColumns([100, 100, 105, 130], ['♮', '♯', '♭', '♯']),
    [0, 12, 24, 0],
  );
});

test('Delete removes chosen alteration, falls back to the staff position, then clears an empty-position chord without shifting time', () => {
  const original = structuredClone(score);
  let result = model.deleteScorePitch(score, 'chord', 60, 1);
  assert.deepEqual(
    result.notes[0].tones.map((t) => t.pitch),
    [60, 62],
  );
  result = model.deleteScorePitch(result, 'chord', 60, -1);
  assert.deepEqual(
    result.notes[0].tones.map((t) => t.pitch),
    [62],
  );
  result = model.deleteScorePitch(score, 'chord', 64);
  assert.equal(result.notes[0].blank, true);
  assert.equal(result.notes[0].beats, 1);
  assert.deepEqual(result.notes[0].tones, []);
  assert.deepEqual(score, original);
});

test('written pitch survives saved files/clipboard/XML and invalid spelling is rejected', () => {
  const restored = files.validateScoreDocument(score);
  assert.deepEqual(restored.notes[0].tones, chord.tones);
  assert.equal(isBandScore(restored), true);
  const copied = model.copyScoreNotes(score, 'Piano', ['chord']);
  // Clipboard uses the public tagged payload; parsing is covered in the UI as well.
  assert.deepEqual(
    copied[0].tones.map((t) => t.naturalPitch),
    [60, 60, 62],
  );
  const xml = model.scoreToMusicXml(score);
  assert.match(xml, /<step>C<\/step><alter>1<\/alter><octave>4<\/octave>/);
  for (const naturalPitch of [61, 59, 60.5, -12, 144]) {
    const invalid = structuredClone(score);
    invalid.notes[0].tones[1].naturalPitch = naturalPitch;
    assert.throws(() => files.validateScoreDocument(invalid));
    assert.equal(isBandScore(invalid), false);
  }
});
