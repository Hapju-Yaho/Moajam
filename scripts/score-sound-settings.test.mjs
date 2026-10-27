import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const tuning = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreTuning.ts', import.meta.url))
);
const parts = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url))
);
const files = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const catalog = await import(
  moduleUrl(new URL('../packages/app/src/lib/soundfontCatalog.ts', import.meta.url))
);
const policy = await import(
  moduleUrl(new URL('../apps/server/src/workspaces/score-policy.ts', import.meta.url))
);
const n = (id, part, beats, pitch = 64, patch = {}) => ({
  id,
  part,
  beats,
  pitch,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  ...patch,
});
const base = {
  title: 'Sound',
  bpm: 120,
  parts: ['Guitar', 'Bass'],
  notes: [
    n('g', 'Guitar', 1, 64, { string: 1, fret: 0 }),
    n('b', 'Bass', 1, 28, { string: 4, fret: 0 }),
  ],
  sync: {},
};
test('whole notes and two halves fill padded 4/4 measures without false overflow', () => {
  const padded = model.alignScoreMeasures(base);
  const whole = model.setScoreDuration(padded, 'g', 4, () => crypto.randomUUID());
  assert.equal(model.scoreMeasureDuration(whole, 'Guitar', 0), 4);
  assert.equal(
    model
      .scoreMeasures(whole, 'Guitar')[0]
      .filter((f) => !f.note.blank)
      .reduce((s, f) => s + f.beats, 0),
    4,
  );
  const first = model.setScoreDuration(padded, 'g', 2, () => crypto.randomUUID());
  const blank = first.notes.find((n) => n.part === 'Guitar' && n.blank);
  const two = model.setScoreFret(
    model.setScoreDuration(first, blank.id, 2, () => crypto.randomUUID()),
    blank.id,
    1,
    0,
  );
  assert.equal(model.scoreMeasureDuration(two, 'Guitar', 0), 4);
  assert.equal(
    model
      .scoreMeasures(two, 'Guitar')[0]
      .filter((f) => !f.note.blank)
      .reduce((s, f) => s + f.beats, 0),
    4,
  );
});
test('instrument-specific tunings preserve fingering and sounding pitch through file validation', () => {
  const guitar = tuning.setScoreTuning(base, 'Guitar', 'guitarHalfDown');
  assert.equal(guitar.notes[0].pitch, 63);
  assert.equal(guitar.notes[0].tones[0].fret, 0);
  const bass = tuning.setScoreTuning(base, 'Bass', 'bassDropD');
  assert.equal(bass.notes[1].pitch, 26);
  assert.equal(tuning.setScoreTuning(base, 'Bass', 'bassHalfDown').notes[1].pitch, 27);
  assert.throws(() => tuning.setScoreTuning(base, 'Bass', 'dropD'));
  assert.equal(files.validateScoreDocument(bass).instruments.Bass, 'bassDropD');
});
test('keyboard key changes transpose both hands once and retain validated settings', () => {
  const keyboard = parts.addInstrumentPart(base, 'Keys', 'piano');
  keyboard.notes.push(n('right', 'Keys', 1, 64), n('left', keyboard.keyboardStaves.Keys, 1, 48));
  const shifted = tuning.setScoreKeyboardKey(keyboard, 'Keys', -2, true);
  assert.equal(shifted.notes.find((n) => n.id === 'right').pitch, 62);
  assert.equal(shifted.notes.find((n) => n.id === 'left').pitch, 46);
  assert.equal(tuning.setScoreKeyboardKey(shifted, 'Keys', -2, true), shifted);
  const restored = tuning.setScoreKeyboardKey(shifted, 'Keys', 0, true);
  assert.equal(restored.notes.find((n) => n.id === 'right').pitch, 64);
  assert.equal(files.validateScoreDocument(shifted).keyboardTranspositions.Keys, -2);
  assert.equal(policy.isBandScore(shifted), true);
  assert.equal(policy.isBandScore({ ...shifted, keyboardTranspositions: { Keys: 13 } }), false);
});
test('virtual instrument choices stay within the notation family', () => {
  assert.ok(
    catalog
      .soundfontsForNotation('guitarHalfDown')
      .every((i) => i.group === catalog.soundfontsForNotation('guitar')[0].group),
  );
  assert.equal(catalog.soundfontsForNotation('bassDropD').length, 4);
  assert.equal(catalog.soundfontsForNotation('piano').length, 3);
  assert.equal(catalog.soundfontsForNotation('standard')[0].id, 'choir_aahs');
  assert.equal(catalog.soundfontsForNotation('drums').length, 2);
});

test('sound-only key changes retain written notes and toggle notation without doubling the shift', () => {
  const keyboard = parts.addInstrumentPart(base, 'Keys', 'piano');
  keyboard.notes.push(n('right2', 'Keys', 1, 64), n('left2', keyboard.keyboardStaves.Keys, 1, 48));
  const soundOnly = tuning.setScoreKeyboardKey(keyboard, 'Keys', 3, false);
  assert.deepEqual(soundOnly.notes, keyboard.notes);
  const sounding = tuning.keyboardPlaybackScore(soundOnly);
  assert.equal(sounding.notes.find((n) => n.id === 'right2').pitch, 67);
  assert.equal(sounding.notes.find((n) => n.id === 'left2').pitch, 51);
  assert.equal(tuning.keyboardPlaybackScore(sounding), sounding);
  const written = tuning.setScoreKeyboardKey(soundOnly, 'Keys', 3, true);
  assert.equal(written.notes.find((n) => n.id === 'right2').pitch, 67);
  assert.equal(tuning.keyboardPlaybackScore(written), written);
  const back = tuning.setScoreKeyboardKey(written, 'Keys', 3, false);
  assert.deepEqual(back.notes, keyboard.notes);
  assert.equal(files.validateScoreDocument(back).keyboardTransposeNotation.Keys, false);
  assert.equal(policy.isBandScore(back), true);
  assert.equal(policy.isBandScore({ ...back, keyboardTransposeNotation: { Keys: 'yes' } }), false);
});
