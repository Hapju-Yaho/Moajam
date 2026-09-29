import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function source(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {
  renameScorePart,
  removeScorePart,
  removeScoreNotes,
  insertScoreNote,
  moveScoreNote,
  scoreMeasures,
  staffPosition,
} = await source('../packages/app/src/lib/score.ts');
const { validateAudioFile, trackPartLabel } = await source('../packages/app/src/lib/trackParts.ts');
const note = (id, part, beats = 1) => ({
  id,
  part,
  beats,
  pitch: 60,
  rest: false,
  chord: 'C',
  lyric: '',
  accent: false,
});
const fixture = () => ({
  title: 'Test',
  bpm: 120,
  parts: ['Guitar', 'Bass'],
  notes: [note('g1', 'Guitar', 3), note('b1', 'Bass'), note('g2', 'Guitar', 2)],
  sync: { g1: 1, b1: 2, g2: 3 },
});

test('renaming a part preserves notes and sync; empty and duplicate names cannot overwrite a part', () => {
  const score = fixture();
  const next = renameScorePart(score, 'Guitar', ' Lead ');
  assert.deepEqual(next.parts, ['Lead', 'Bass']);
  assert.deepEqual(
    next.notes.map((n) => n.part),
    ['Lead', 'Bass', 'Lead'],
  );
  assert.deepEqual(next.sync, score.sync);
  assert.equal(score.notes[0].part, 'Guitar');
  assert.throws(() => renameScorePart(score, 'Guitar', 'Bass'));
  assert.throws(() => renameScorePart(score, null, '  '));
});
test('part and note removal clean only related audio anchors and protect the last part', () => {
  const next = removeScorePart(fixture(), 'Guitar');
  assert.deepEqual(
    next.notes.map((n) => n.id),
    ['b1'],
  );
  assert.deepEqual(next.sync, { b1: 2 });
  assert.throws(() => removeScorePart(next, 'Bass'));
  assert.deepEqual(removeScoreNotes(fixture(), ['g1']).sync, { b1: 2, g2: 3 });
});
test('inserting and moving notes stays within the selected part and does not copy audio anchors', () => {
  const score = fixture();
  const next = insertScoreNote(score, note('copy', 'Guitar'), 'g1');
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Guitar').map((n) => n.id),
    ['g1', 'copy', 'g2'],
  );
  assert.equal(next.sync.copy, undefined);
  const moved = moveScoreNote(next, 'copy', 1);
  assert.deepEqual(
    moved.notes.filter((n) => n.part === 'Guitar').map((n) => n.id),
    ['g1', 'g2', 'copy'],
  );
  assert.deepEqual(
    moved.notes.filter((n) => n.part === 'Bass'),
    [score.notes[1]],
  );
  assert.equal(moveScoreNote(score, 'g1', -1), score);
});
test('staff splits long notes at bar boundaries without changing stored note identity', () => {
  const bars = scoreMeasures(fixture(), 'Guitar');
  assert.deepEqual(
    bars.map((bar) => bar.map((f) => [f.note.id, f.beats, f.continued, f.continues])),
    [
      [
        ['g1', 3, false, false],
        ['g2', 1, false, true],
      ],
      [['g2', 1, true, false]],
    ],
  );
  assert.throws(() => scoreMeasures({ ...fixture(), notes: [note('x', 'Guitar', 0)] }, 'Guitar'));
  assert.throws(() =>
    scoreMeasures({ ...fixture(), notes: [note('x', 'Guitar', 1 / 3)] }, 'Guitar'),
  );
  assert.deepEqual(scoreMeasures({ ...fixture(), notes: [] }, 'Guitar'), [[]]);
});
test('staff steps follow diatonic pitches, not semitone spacing', () => {
  assert.equal(staffPosition(64), 0); // E4
  assert.equal(staffPosition(65), 1); // F4
  assert.equal(staffPosition(66), 1); // F#4
  assert.equal(staffPosition(60), -2); // middle C ledger line
  assert.equal(staffPosition(77), 8); // F5 top line
});
test('audio upload rejects empty, oversized and unrelated files but accepts common audio formats', () => {
  assert.throws(() => validateAudioFile({ name: 'track.wav', size: 0 }));
  assert.throws(() => validateAudioFile({ name: 'track.wav', size: 104857601 }));
  assert.throws(() => validateAudioFile({ name: 'notes.pdf', type: 'application/pdf', size: 10 }));
  for (const name of ['track.WAV', 'track.mp3', 'track.m4a', 'track.flac'])
    validateAudioFile({ name, size: 10 });
  assert.equal(trackPartLabel(undefined), '미지정');
  assert.equal(trackPartLabel('BASS'), '베이스');
});
