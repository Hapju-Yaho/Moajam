import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const { insertScoreXml, xmlInsertionRange } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreXmlInsertion.ts', import.meta.url))
);
const note = (id, part, pitch, beats, rest = false) => ({
  id,
  part,
  pitch,
  beats,
  rest,
  tones: rest ? [] : [{ pitch }],
  accent: false,
  chord: '',
  lyric: '',
});
const base = () => ({
  title: 'Target',
  bpm: 90,
  parts: ['Keys', 'Bass'],
  instruments: { Keys: 'piano', Bass: 'bass' },
  sync: {},
  notes: [
    note('a', 'Keys', 60, 4),
    note('b', 'Keys', 62, 4),
    note('c', 'Keys', 64, 4),
    note('d', 'Bass', 40, 12),
  ],
});
const source = () => ({
  title: 'Source',
  bpm: 160,
  parts: ['Melody'],
  instruments: { Melody: 'piano' },
  sync: {},
  notes: [note('x', 'Melody', 72, 1), note('y', 'Melody', 74, 1), note('z', 'Melody', 60, 2, true)],
  beatChords: { Melody: { 0: 'C' } },
});
let id = 0;
const makeId = () => `xml-${++id}`;
test('XML overwrites only selected bars, preserves rests, metadata, other parts and source', () => {
  const score = base(),
    imported = source(),
    before = structuredClone(imported);
  assert.equal(xmlInsertionRange(score, imported, 'Melody', 'Keys', 2).conflicts, true);
  const next = insertScoreXml(score, imported, 'Melody', 'Keys', 2, makeId);
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Keys').map((n) => [n.pitch, n.beats, n.rest]),
    [
      [60, 4, false],
      [72, 1, false],
      [74, 1, false],
      [60, 2, true],
      [64, 4, false],
    ],
  );
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Bass'),
    score.notes.filter((n) => n.part === 'Bass'),
  );
  assert.equal(next.bpm, 90);
  assert.equal(next.title, 'Target');
  assert.equal(next.beatChords.Keys[4], 'C');
  assert.deepEqual(imported, before);
  assert.equal(new Set(next.notes.map((n) => n.id)).size, next.notes.length);
});
test('XML appends after last bar and remaps note connections', () => {
  const imported = source();
  imported.notes[0].slurTo = 'y';
  const next = insertScoreXml(base(), imported, 'Melody', 'Keys', 4, makeId);
  const rows = next.notes.filter((n) => n.part === 'Keys');
  assert.equal(rows[3].slurTo, rows[4].id);
  assert.equal(xmlInsertionRange(base(), imported, 'Melody', 'Keys', 4).conflicts, false);
});
test('single staff import leaves secondary staff intact and hidden source staff is selectable', () => {
  const score = base();
  score.parts.push('Left');
  score.keyboardStaves = { Keys: 'Left' };
  score.notes.push(note('left', 'Left', 48, 12));
  const imported = source();
  imported.parts.push('Low');
  imported.keyboardStaves = { Melody: 'Low' };
  imported.notes.push(note('low', 'Low', 45, 4));
  assert.deepEqual(xmlInsertionRange(score, imported, 'Low', 'Keys', 1).fromParts, ['Low']);
  const next = insertScoreXml(score, imported, 'Low', 'Keys', 1, makeId);
  assert.equal(next.notes.find((n) => n.part === 'Keys').pitch, 45);
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Left'),
    score.notes.filter((n) => n.part === 'Left'),
  );
});
test('paired staff conflicts detect secondary notes and replace both staves', () => {
  const score = base();
  score.parts.push('Left');
  score.keyboardStaves = { Keys: 'Left' };
  score.notes = score.notes.map((n) => (n.part === 'Keys' ? { ...n, rest: true, tones: [] } : n));
  score.notes.push(note('left', 'Left', 48, 12));
  const imported = source();
  imported.parts.push('Low');
  imported.keyboardStaves = { Melody: 'Low' };
  imported.notes.push(note('low', 'Low', 45, 4));
  assert.equal(xmlInsertionRange(score, imported, 'Melody', 'Keys', 1).conflicts, true);
  const next = insertScoreXml(score, imported, 'Melody', 'Keys', 1, makeId);
  assert.equal(next.notes.find((n) => n.part === 'Left').pitch, 45);
});

const drumSource = () => ({
  title: 'Drums',
  bpm: 120,
  parts: ['Kit', 'Feet'],
  instruments: { Kit: 'drums', Feet: 'drums' },
  drumVoices: { Kit: 'Feet' },
  sync: {},
  notes: [note('hh', 'Kit', 42, 4), note('kick', 'Feet', 36, 4)],
});
test('paired drum import creates a missing lower voice and preserves kicks without mutating preview target', () => {
  const score = {
    title: 'Target',
    bpm: 120,
    parts: ['Drums'],
    instruments: { Drums: 'drums' },
    sync: {},
    notes: [note('old', 'Drums', 38, 4)],
  };
  const before = structuredClone(score),
    imported = drumSource();
  const range = xmlInsertionRange(score, imported, 'Kit', 'Drums', 1);
  assert.equal(range.parts.length, 2);
  assert.deepEqual(range.fromParts, ['Kit', 'Feet']);
  assert.deepEqual(score, before);
  const next = insertScoreXml(score, imported, 'Kit', 'Drums', 1, makeId);
  const lower = next.drumVoices.Drums;
  assert.ok(lower && next.parts.includes(lower));
  assert.equal(
    next.notes.filter((n) => n.part === lower && !n.rest && n.tones.some((t) => t.pitch === 36))
      .length,
    1,
  );
  assert.equal(
    next.notes.filter((n) => n.part === 'Drums' && !n.rest && n.tones.some((t) => t.pitch === 42))
      .length,
    1,
  );
  assert.deepEqual(score, before);
});
test('paired drum import detects lower-only conflicts and reuses the existing voice', () => {
  const score = drumSource();
  score.notes[0] = { ...score.notes[0], rest: true, tones: [] };
  assert.equal(xmlInsertionRange(score, drumSource(), 'Kit', 'Kit', 1).conflicts, true);
  const next = insertScoreXml(score, drumSource(), 'Kit', 'Kit', 1, makeId);
  assert.deepEqual(next.parts, ['Kit', 'Feet']);
  assert.equal(next.drumVoices.Kit, 'Feet');
  assert.equal(next.notes.filter((n) => n.part === 'Feet' && !n.rest && n.pitch === 36).length, 1);
  assert.throws(() => insertScoreXml(base(), drumSource(), 'Kit', 'Keys', 1, makeId));
});
