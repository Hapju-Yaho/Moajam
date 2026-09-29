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
  removeScoreNotes,
  insertScoreNote,
  moveScoreNote,
  scoreChordPositions,
  setScoreArticulation,
  setScoreDurations,
  setScoreConnection,
  cleanScoreConnections,
  copyScoreNotes,
  pasteScoreNotes,
  readScoreClipboard,
} = await source('../packages/app/src/lib/score.ts');
const { scoreMeasureLayout, scoreSystemLayouts, scoreBeatHitRegions, scoreBeamGroups } =
  await source('../packages/app/src/lib/scoreLayout.ts');
const n = (id, beats = 1, part = 'Guitar') => ({
  id,
  part,
  beats,
  pitch: 60,
  chord: '',
  lyric: '',
  rest: false,
  accent: false,
});

test('structural edits retime chord changes and invalidate only moved audio anchors', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar', 'Bass'],
    notes: [n('a', 2), n('bass', 4, 'Bass'), n('b'), n('c')],
    sync: { a: 0, b: 1, c: 2, bass: 0 },
    measureChords: { Guitar: { 0: 'Am' } },
    beatChords: { Guitar: { 2: 'G', 2.5: 'D/F♯', 3: 'C', 6: 'Em' }, Bass: { 0: 'Bm' } },
  };
  const removed = removeScoreNotes(score, ['a']);
  assert.deepEqual(scoreChordPositions(removed, 'Guitar'), {
    0: 'G',
    0.5: 'D/F♯',
    1: 'C',
    4: 'Em',
  });
  assert.deepEqual(removed.sync, { bass: 0 });
  const inserted = insertScoreNote(score, { ...n('blank'), blank: true, rest: true }, 'a');
  assert.deepEqual(scoreChordPositions(inserted, 'Guitar'), {
    0: 'Am',
    3: 'G',
    3.5: 'D/F♯',
    4: 'C',
    7: 'Em',
  });
  assert.deepEqual(inserted.sync, { a: 0, bass: 0 });
  const moved = moveScoreNote(score, 'b', -1);
  assert.deepEqual(scoreChordPositions(moved, 'Guitar'), {
    0: 'G',
    0.5: 'D/F♯',
    1: 'Am',
    3: 'C',
    6: 'Em',
  });
  assert.deepEqual(moved.sync, { c: 2, bass: 0 });
  assert.deepEqual(moved.beatChords.Bass, score.beatChords.Bass);
  assert.deepEqual(score.sync, { a: 0, b: 1, c: 2, bass: 0 });
});

test('range articulation edits preserve rests and range duration changes are atomic', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [n('a'), n('b'), { ...n('r'), rest: true }],
  };
  const muted = setScoreArticulation(score, ['a', 'b', 'r'], 'dead');
  assert.ok(muted.notes.slice(0, 2).every((note) => note.dead));
  assert.equal(muted.notes[2].dead, undefined);
  const ghost = setScoreArticulation(muted, ['a', 'b'], 'ghost');
  assert.ok(ghost.notes.slice(0, 2).every((note) => note.ghost && !note.dead));
  const cleared = setScoreArticulation(ghost, ['a', 'b'], 'ghost');
  assert.ok(cleared.notes.slice(0, 2).every((note) => !note.ghost));
  let id = 0;
  const shorter = setScoreDurations(score, ['a', 'b'], 0.5, () => `empty-${++id}`);
  assert.deepEqual(
    shorter.notes.map((note) => [note.beats, !!note.blank]),
    [
      [0.5, false],
      [0.5, true],
      [0.5, false],
      [0.5, true],
      [1, false],
    ],
  );
  assert.throws(() => setScoreDurations(score, ['a', 'b'], 2, () => `empty-${++id}`));
  assert.deepEqual(
    score.notes.map((note) => note.beats),
    [1, 1, 1],
  );
});

test('notation spacing protects dense glyphs and chord names with continuous hit regions', () => {
  const points = Array.from({ length: 64 }, (_, i) => ({ offset: i / 16, space: 40 }));
  const layout = scoreMeasureLayout(points, 200);
  assert.equal(layout.width, 2600);
  for (let i = 1; i < 64; i++) assert.ok(layout.xAt(i / 16) - layout.xAt((i - 1) / 16) >= 40);
  const chords = scoreMeasureLayout(
    [
      { offset: 0, space: 154 },
      { offset: 0.5, space: 104 },
    ],
    200,
  );
  assert.ok(chords.xAt(0.5) - chords.xAt(0) >= 154);
  assert.equal(scoreMeasureLayout([{ offset: 0, space: 40 }], 800).width, 800);
  const balanced = scoreSystemLayouts([points.slice(0, 16), [{ offset: 0, space: 40 }]], 900);
  assert.equal(
    balanced.reduce((sum, bar) => sum + bar.width, 0),
    900,
  );
  assert.ok(balanced[0].width >= 680);
  const hits = [
    ...scoreBeatHitRegions(
      points.map((p) => p.offset),
      layout.width,
      layout.xAt,
    ).values(),
  ];
  assert.equal(hits[0].left, 0);
  assert.equal(hits.at(-1).right, layout.width);
  hits.slice(1).forEach((hit, i) => assert.equal(hit.left, hits[i].right));
});

test('beams stop at beat boundaries and rests', () => {
  const fragments = Array.from({ length: 8 }, (_, i) => ({
    offset: i / 2,
    beats: 0.5,
    note: { rest: i === 4 },
  }));
  assert.deepEqual(scoreBeamGroups(fragments), [
    [0, 1],
    [2, 3],
    [6, 7],
  ]);
});

test('connections validate direction, strings, ties and explicit adjacent targets', () => {
  const tone = (id, pitch, string = 1) => ({
    ...n(id),
    pitch,
    tones: [{ pitch, string, fret: pitch - (string === 1 ? 64 : 59) }],
  });
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [tone('a', 64), tone('b', 67), tone('c', 64), tone('d', 64)],
  };
  let linked = setScoreConnection(score, ['a', 'b'], 'hammer');
  linked = setScoreConnection(linked, ['b'], 'pull');
  linked = setScoreConnection(linked, ['c', 'd'], 'tie');
  assert.deepEqual(
    linked.notes.map((n) => n.connection?.type),
    ['hammer', 'pull', 'tie', undefined],
  );
  assert.equal(setScoreConnection(linked, ['a'], 'hammer').notes[0].connection, undefined);
  assert.throws(() => setScoreConnection(score, ['a', 'b'], 'pull'));
  assert.throws(() => setScoreConnection(score, ['a', 'c'], 'hammer'));
  assert.throws(() => setScoreConnection(score, ['a', 'b'], 'tie'));
  assert.throws(() =>
    setScoreConnection({ ...score, notes: [tone('a', 64), tone('b', 67, 2)] }, ['a'], 'slide'),
  );
  assert.throws(() =>
    setScoreConnection(
      { ...score, notes: [tone('a', 64), { ...tone('b', 67), rest: true }] },
      ['a'],
      'hammer',
    ),
  );
  assert.equal(removeScoreNotes(linked, ['b']).notes[0].connection, undefined);
  assert.equal(
    insertScoreNote(linked, { ...n('blank'), rest: true, blank: true }, 'a').notes[0].connection,
    undefined,
  );
  assert.equal(
    cleanScoreConnections(setScoreArticulation(linked, ['b'], 'staccato')).notes[0].connection,
    undefined,
  );
  assert.equal(moveScoreNote(linked, 'b', 1).notes.find((n) => n.id === 'a').connection, undefined);
  const legacy = {
    ...score,
    notes: [
      { ...n('a'), pitch: 64 },
      { ...n('b'), pitch: 67 },
    ],
  };
  assert.equal(setScoreConnection(legacy, ['a'], 'hammer').notes[0].connection.type, 'hammer');
  const chords = {
    ...score,
    notes: [
      { ...n('a'), tones: [{ pitch: 64 }, { pitch: 67 }] },
      { ...n('b'), tones: [{ pitch: 67 }, { pitch: 64 }] },
    ],
  };
  assert.equal(setScoreConnection(chords, ['a'], 'tie').notes[0].connection.type, 'tie');
});

test('clipboard remaps connections and drops links outside the copied passage', () => {
  const score = { title: '', bpm: 120, parts: ['Guitar'], sync: {}, notes: [n('a'), n('b')] };
  const linked = setScoreConnection(score, ['a', 'b'], 'tie');
  assert.equal(copyScoreNotes(linked, 'Guitar', ['a'])[0].copiedConnection, undefined);
  const copied = readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: copyScoreNotes(linked, 'Guitar', ['a', 'b']),
    }),
  );
  let id = 0;
  const result = pasteScoreNotes(linked, 'Guitar', copied, 0, () => `new${++id}`);
  assert.equal(result.score.notes[0].connection.targetId, result.score.notes[1].id);
  assert.equal(result.score.notes[2].connection.targetId, 'b');
  assert.equal(
    readScoreClipboard(
      JSON.stringify({
        type: 'moajam-score',
        version: 1,
        notes: [{ ...n('bad'), copiedConnection: 'unknown' }],
      }),
    ),
    null,
  );
});
