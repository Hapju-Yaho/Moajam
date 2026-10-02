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
  setScoreToneArticulation,
  selectedScoreTone,
  noteTones,
  tabTones,
  setScoreFret,
  scoreToMusicXml,
  setScoreDurations,
  setScoreConnection,
  cleanScoreConnections,
  copyScoreNotes,
  pasteScoreNotes,
  readScoreClipboard,
  setScoreDotted,
  scoreAccidentalMarks,
  scoreMeasures,
  deleteScorePosition,
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

test('accidentals appear once per measure, reset at bar lines, and cancel only when needed', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [61, 61, 60, 60, 61, 61, 73, 61].map((pitch, i) => ({ ...n(String(i)), pitch })),
  };
  const bars = scoreMeasures(score, 'Guitar');
  assert.deepEqual(scoreAccidentalMarks(bars[0]), [['♯'], [''], ['♮'], ['']]);
  assert.deepEqual(scoreAccidentalMarks(bars[1]), [['♯'], [''], ['♯'], ['']]);
  const tied = scoreMeasures(
    {
      ...score,
      notes: [
        { ...n('long', 6), pitch: 61 },
        { ...n('next', 1), pitch: 61 },
      ],
    },
    'Guitar',
  );
  assert.deepEqual(scoreAccidentalMarks(tied[1]), [[''], ['']]);
});

test('Delete keeps beat positions while cycling a note to blank, rest, and blank again', () => {
  for (const part of ['Bass', 'Vocal']) {
    let score = {
      title: '',
      bpm: 120,
      parts: [part],
      sync: { next: 3 },
      notes: [
        { ...n('a', 0.75, part), pitch: 28, tones: [{ pitch: 28, string: 4, fret: 0 }] },
        n('next', 1, part),
      ],
    };
    const original = score;
    for (const blank of [true, false, true]) {
      score = deleteScorePosition(score, 'a', part === 'Bass' ? 4 : undefined);
      assert.equal(score.notes[0].blank, blank);
      assert.equal(score.notes[0].rest, true);
      assert.equal(score.notes[0].beats, 0.75);
      assert.deepEqual(score.notes[0].tones, []);
      assert.equal(score.notes[1], original.notes[1]);
      assert.deepEqual(score.sync, original.sync);
    }
    assert.equal(original.notes[0].rest, false);
  }
});

test('Delete on an empty chord string preserves other strings instead of replacing them with a rest', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Bass'],
    sync: {},
    notes: [
      {
        ...n('a', 1, 'Bass'),
        tones: [
          { pitch: 28, string: 4, fret: 0 },
          { pitch: 33, string: 3, fret: 0 },
        ],
      },
    ],
  };
  const next = deleteScorePosition(score, 'a', 4);
  assert.deepEqual(next.notes[0].tones, [{ pitch: 33, string: 3, fret: 0 }]);
  assert.equal(next.notes[0].rest, false);
  assert.deepEqual(deleteScorePosition(next, 'a', 4).notes, next.notes);
});

test('dot toggles shift following notes and chord anchors without losing notes or affecting other parts', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar', 'Bass'],
    notes: [n('a'), n('b', 0.5), n('c', 2), n('bass', 4, 'Bass')],
    sync: { a: 0, b: 1, c: 2, bass: 0 },
    beatChords: { Guitar: { 1: 'C', 1.5: 'G' } },
  };
  const dotted = setScoreDotted(score, ['a', 'b'], true);
  assert.deepEqual(
    dotted.notes.map((note) => note.beats),
    [1.5, 0.75, 2, 4],
  );
  assert.deepEqual(dotted.beatChords.Guitar, { 1.5: 'C', 2.25: 'G' });
  assert.deepEqual(dotted.sync, { a: 0, bass: 0 });
  assert.deepEqual(setScoreDotted(dotted, ['a', 'b'], false).notes, score.notes);
  assert.deepEqual(
    score.notes.map((note) => note.beats),
    [1, 0.5, 2, 4],
  );
  assert.equal(
    setScoreDotted({ ...score, notes: [n('whole', 4)] }, ['whole'], true).notes[0].beats,
    6,
  );
  assert.throws(
    () => setScoreDotted({ ...score, notes: [n('a'), n('tiny', 0.0625)] }, ['a', 'tiny'], true),
    /점음표/,
  );
});

test('equal measure widths fit dense and sparse measures within the same line', () => {
  const points = [2, 16, 8, 1].map((count) =>
    Array.from({ length: count }, (_, i) => ({ offset: (i * 4) / count, space: 40 })),
  );
  const layouts = scoreSystemLayouts(points, 800, true);
  assert.deepEqual(
    layouts.map((layout) => layout.width),
    [200, 200, 200, 200],
  );
  layouts.forEach((layout, index) =>
    points[index].forEach((point) =>
      assert.ok(layout.xAt(point.offset) > 0 && layout.xAt(point.offset) < 200),
    ),
  );
});

test('tight measure spacing reserves room before an accidental instead of overlapping the previous note', () => {
  const points = Array.from({ length: 8 }, (_, i) => ({
    offset: i / 2,
    space: 40,
    minSpace: i === 1 ? 30 : 18,
  }));
  const [layout] = scoreSystemLayouts([points], 198, true);
  assert.equal(layout.width, 198);
  assert.ok(layout.xAt(1) - layout.xAt(0.5) >= 30);
  for (let i = 1; i < 8; i++) assert.ok(layout.xAt(i / 2) - layout.xAt((i - 1) / 2) >= 18);
});

test('ghost and dead apply only to the selected string; staccato remains beat-wide', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [
      {
        ...n('a'),
        tones: [
          { pitch: 64, string: 1, fret: 0 },
          { pitch: 59, string: 2, fret: 0 },
        ],
      },
    ],
  };
  const ghost = setScoreToneArticulation(score, ['a'], 1, 'ghost');
  assert.equal(selectedScoreTone(ghost, ghost.notes[0], 1).ghost, true);
  assert.ok(!selectedScoreTone(ghost, ghost.notes[0], 2).ghost);
  const dead = setScoreToneArticulation(ghost, ['a'], 2, 'dead');
  assert.equal(selectedScoreTone(dead, dead.notes[0], 1).ghost, true);
  assert.equal(selectedScoreTone(dead, dead.notes[0], 2).dead, true);
  const staccato = setScoreArticulation(dead, ['a'], 'staccato');
  assert.equal(staccato.notes[0].staccato, true);
  assert.deepEqual(staccato.notes[0].tones, dead.notes[0].tones);
  const entered = setScoreFret(dead, 'a', 2, 4);
  assert.ok(!selectedScoreTone(entered, entered.notes[0], 2).dead);
  assert.equal(selectedScoreTone(entered, entered.notes[0], 1).ghost, true);
  const added = setScoreFret(dead, 'a', 3, 0);
  assert.equal(selectedScoreTone(added, added.notes[0], 2).dead, true);
  assert.ok(!selectedScoreTone(added, added.notes[0], 3).ghost);
  assert.equal(setScoreToneArticulation(score, ['a'], 6, 'ghost'), score);
  assert.equal(score.notes[0].tones[0].ghost, undefined);
});

test('legacy beat flags migrate without changing siblings; range edits only touch matching strings', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [
      {
        ...n('a'),
        ghost: true,
        tones: [
          { pitch: 64, string: 1, fret: 0 },
          { pitch: 59, string: 2, fret: 0 },
        ],
      },
      {
        ...n('b'),
        tones: [
          { pitch: 64, string: 1, fret: 0 },
          { pitch: 55, string: 3, fret: 0 },
        ],
      },
    ],
  };
  const changed = setScoreToneArticulation(score, ['a', 'b'], 2, 'dead');
  assert.equal(selectedScoreTone(changed, changed.notes[0], 1).ghost, true);
  assert.equal(selectedScoreTone(changed, changed.notes[0], 2).dead, true);
  assert.equal(selectedScoreTone(changed, changed.notes[0], 2).ghost, false);
  assert.equal(changed.notes[1], score.notes[1]);
  assert.ok(tabTones(changed.notes[0], [65, 60, 56, 51, 46, 41]).some((tone) => tone.dead));
  const legacyCopy = readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: copyScoreNotes(score, 'Guitar', ['a']),
    }),
  );
  assert.ok(noteTones(legacyCopy[0]).every((tone) => tone.ghost));
});

test('per-tone effects survive clipboard and MusicXML export, including ordinary staff parts', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Vocal'],
    sync: {},
    notes: [{ ...n('a', 1, 'Vocal'), tones: [{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }] }],
  };
  const ghost = setScoreToneArticulation(score, ['a'], 2, 'ghost');
  const mixed = setScoreToneArticulation(ghost, ['a'], 3, 'dead');
  const copied = readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: copyScoreNotes(mixed, 'Vocal', ['a']),
    }),
  );
  assert.deepEqual(
    noteTones(copied[0]).map((tone) => [!!tone.ghost, !!tone.dead]),
    [
      [false, false],
      [true, false],
      [false, true],
    ],
  );
  const xml = scoreToMusicXml(mixed);
  assert.equal((xml.match(/<notehead>x<\/notehead>/g) ?? []).length, 1);
  assert.equal((xml.match(/parentheses="yes"/g) ?? []).length, 1);
  copied[0].tones[1].ghost = 'bad';
  assert.equal(
    readScoreClipboard(JSON.stringify({ type: 'moajam-score', version: 1, notes: copied })),
    null,
  );
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

test('dense score lines fit the available width with proportional spacing and unchanged measure order', () => {
  const measures = [2, 8, 16, 4].map((count) =>
    Array.from({ length: count }, (_, i) => ({ offset: (i * 4) / count, space: 40 })),
  );
  const natural = measures.map((points) => scoreMeasureLayout(points, 0));
  const total = natural.reduce((sum, bar) => sum + bar.width, 0);
  for (const available of [180, 540, 880]) {
    const layouts = scoreSystemLayouts(measures, available);
    assert.equal(layouts.length, 4, 'keep all four measures on the original line');
    assert.ok(Math.abs(layouts.reduce((sum, bar) => sum + bar.width, 0) - available) < 1e-8);
    layouts.forEach((layout, index) => {
      assert.ok(Math.abs(layout.width / natural[index].width - available / total) < 1e-8);
      const offsets = measures[index].map((point) => point.offset);
      offsets.forEach((offset) => {
        assert.ok(
          Math.abs(layout.xAt(offset) - (natural[index].xAt(offset) * available) / total) < 1e-8,
        );
      });
      const hits = [...scoreBeatHitRegions(offsets, layout.width, layout.xAt).values()];
      assert.equal(hits[0].left, 0);
      assert.equal(hits.at(-1).right, layout.width);
      hits.forEach((hit, i) => {
        assert.ok(hit.right > hit.left);
        if (i) assert.equal(hit.left, hits[i - 1].right);
      });
    });
    assert.ok(layouts[2].width > layouts[1].width && layouts[1].width > layouts[0].width);
  }
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
