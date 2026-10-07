import assert from 'node:assert/strict';
import { URL } from 'node:url';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';

async function source(path) {
  return import(moduleUrl(new URL(path, import.meta.url)));
}
const {
  editScoreMeasure,
  scoreMeasureEntry,
  scorePerformance,
  scoreRhythmFeels,
  appendScoreMeasureNote,
  setScoreTriplet,
  scoreTupletGroups,
  scoreBeat,
  setScoreDuration,
  scoreMeasureAtBeat,
  scoreMeasureDuration,
  scoreMeasureStart,
  scoreMeasureCount,
  scorePlaybackFrom,
  scorePlaybackPosition,
  scoreBarBeats,
  setScoreTimeSignature,
  setScoreMeasureWidth,
  setScoreRepeat,
  setScoreSlur,
  setScoreSlideOut,
  spellScorePitch,
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
const {
  scoreConnectionArc,
  scoreConnectionSide,
  scoreStemDirection,
  scoreMeasureLayout,
  scoreSystemLayouts,
  scoreBeatHitRegions,
  scoreBeamGroups,
} = await source('../packages/app/src/lib/scoreLayout.ts');
const { createScorePlaybackClock } = await source('../packages/app/src/lib/scorePlaybackClock.ts');
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

test('connections use the opposite side of rendered stems, with source preference for mixed stems', () => {
  assert.equal(scoreConnectionSide([1, 1]), -1);
  assert.equal(scoreConnectionSide([-1, -1]), 1);
  assert.equal(scoreConnectionSide([-1, 1]), 1);
  assert.equal(scoreConnectionSide([1, -1]), -1);
  assert.equal(scoreConnectionSide([-1, 1, 1]), -1);
});

test('connection curves keep narrow note-center spans with pointed ends and a thicker middle', () => {
  for (const side of [-1, 1]) {
    const arc = scoreConnectionArc(
      [
        { x: 100, y: 100 },
        { x: 114, y: 100 },
      ],
      side,
    );
    const values = arc.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.equal(values[0], 100);
    assert.equal(values[6], 114);
    assert.deepEqual(values.slice(-2), values.slice(0, 2));
    assert.ok(values.every(Number.isFinite));
    assert.ok(values[2] > 100 && values[4] < 114);
    const outerMid = (values[1] + 3 * values[3] + 3 * values[5] + values[7]) / 8;
    const innerMid = (values[7] + 3 * values[9] + 3 * values[11] + values[13]) / 8;
    assert.ok(side * (outerMid - innerMid) > 1);
    assert.equal(arc.labelX, 107);
    assert.ok(side * (arc.labelY - outerMid) >= 6);
    assert.ok(arc.d.endsWith(' Z'));
  }
});

test('selection playback stays inside the selected interval, including swing and repeat marks', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    rhythmFeel: 'triplet-eighth',
    repeats: { 0: { start: true, end: true, times: 3 } },
    notes: Array.from({ length: 16 }, (_, i) => n(`loop-${i}`, 0.5)),
  };
  const plan = scorePlaybackFrom(score, 'Guitar', 0.5, 1.5);
  assert.equal(plan.segments.length, 1);
  assert.ok(Math.abs(plan.startBeat - 2 / 3) < 1e-9);
  assert.ok(Math.abs(plan.endBeat - 5 / 3) < 1e-9);
  assert.deepEqual(
    plan.events.map((event) => event.note.id),
    ['loop-1', 'loop-2'],
  );
  assert.ok(Math.abs(plan.toWritten(plan.segments[0].endBeat) - 1.5) < 1e-9);
  assert.equal(scorePlaybackFrom(score, 'Guitar', 2, 1).events.length, 0);
  assert.equal(scorePlaybackFrom(score, 'Guitar', 0, 0.5).events.length, 1);
  assert.ok(
    scorePlaybackFrom(score, 'Guitar', 0).segments.length > 1,
    'normal playback keeps repeats',
  );
});

test('playback clock queues exact loop boundaries, wraps its cursor and stops normal playback', () => {
  const starts = [];
  const update = createScorePlaybackClock(0.04, 0.5, true, (when) => starts.push(when));
  update(0);
  update(0.2);
  const frame = update(1.3);
  assert.equal(frame.ended, false);
  assert.ok(Math.abs(frame.elapsed - 0.26) < 1e-9);
  assert.deepEqual(starts, [0.04, 0.54, 1.04, 1.54, 2.04]);
  update(20); // A throttled/background tab must not replay a backlog at once.
  assert.ok(starts.slice(5).every((time) => time >= 20));
  assert.equal(new Set(starts).size, starts.length);
  const once = [];
  const single = createScorePlaybackClock(0.04, 0.5, false, (when) => once.push(when));
  single(0);
  assert.equal(single(0.3).ended, false);
  assert.equal(single(0.54).ended, true);
  single(2);
  assert.deepEqual(once, [0.04]);
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

test('Delete changes note to blank to rest, then closes only that measure time', () => {
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
    for (const blank of [true, false]) {
      score = deleteScorePosition(score, 'a', part === 'Bass' ? 4 : undefined);
      assert.equal(score.notes[0].blank, blank);
      assert.equal(score.notes[0].rest, true);
      assert.equal(score.notes[0].beats, 0.75);
      assert.deepEqual(score.notes[0].tones, []);
      assert.equal(score.notes[1], original.notes[1]);
      assert.deepEqual(score.sync, original.sync);
    }
    score = deleteScorePosition(score, 'a', part === 'Bass' ? 4 : undefined);
    assert.deepEqual(
      score.notes.map((note) => note.id),
      ['next'],
    );
    assert.equal(scoreMeasureDuration(score, part, 0), 3.25);
    assert.deepEqual(score.sync, {});
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

test('spacing preserves duration ratios through the final note, including compact and equal-width rows', () => {
  const points = [0, 0.5, 1, 1.5, 2].map((offset) => ({ offset, space: 40, minSpace: 24 }));
  const assertRatio = (layout, halfBeat = 0.5, end = 4) => {
    const short = layout.xAt(halfBeat) - layout.xAt(0);
    const held = layout.xAt(end) - layout.xAt(end / 2);
    assert.ok(Math.abs(held / short - end / 2 / halfBeat) < 1e-8);
    assert.ok(layout.width > layout.xAt(end));
  };
  assertRatio(scoreMeasureLayout(points, 0));
  assertRatio(scoreMeasureLayout(points, 600));
  for (const width of [160, 300, 900]) {
    for (const equal of [false, true])
      assertRatio(scoreSystemLayouts([points, [{ offset: 0, space: 40 }]], width, equal)[0]);
  }
  const triplets = [0, 1 / 3, 2 / 3, 1, 2].map((offset) => ({ offset, space: 30 }));
  assertRatio(scoreSystemLayouts([triplets], 320)[0], 1 / 3);
  const three = [0, 0.5, 1, 1.5].map((offset) => ({ offset, space: 30 }));
  assertRatio(scoreSystemLayouts([three], 320, false, [], [3])[0], 0.5, 3);
  const grace = scoreMeasureLayout(
    points.map((p) => ({ ...p, leading: p.offset === 1 ? 16 : 0 })),
    420,
  );
  assert.ok(Math.abs(grace.xAt(1) - grace.xAt(0.5) - (grace.xAt(0.5) - grace.xAt(0)) - 16) < 1e-8);
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
      [0.5, false],
      [1, false],
    ],
  );
  assert.deepEqual(
    setScoreDurations(score, ['a', 'b'], 2, () => `empty-${++id}`).notes.map((note) => note.beats),
    [2, 2, 1],
  );
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
  assert.equal(
    setScoreConnection({ ...score, notes: [tone('a', 64), tone('b', 67, 2)] }, ['a'], 'slide')
      .notes[0].connection.type,
    'slide',
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

test('duration edits keep full bars and later notes intact, including underfull and overfull playback', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: Array.from({ length: 8 }, (_, index) => n(String(index))),
  };
  const extended = setScoreDuration(original, '0', 2, () => 'unused');
  assert.equal(scoreMeasureDuration(extended, 'Guitar', 0), 5);
  assert.deepEqual(
    scoreMeasures(extended, 'Guitar').map((bar) => bar.map((f) => f.note.id)),
    [
      ['0', '1', '2', '3'],
      ['4', '5', '6', '7'],
    ],
  );
  assert.equal(scoreMeasureStart(extended, 'Guitar', 1), 5);
  assert.equal(scoreMeasureCount(extended, 'Guitar'), 2);
  assert.equal(scorePlaybackFrom(extended, 'Guitar').endBeat, 9);
  assert.deepEqual(
    scorePlaybackFrom(extended, 'Guitar').events.map((e) => e.offset),
    [0, 2, 3, 4, 5, 6, 7, 8],
  );
  const reduced = setScoreDuration(extended, '0', 0.5, () => 'unused');
  assert.equal(scoreMeasureDuration(reduced, 'Guitar', 0), 3.5);
  assert.equal(scoreMeasureAtBeat(reduced, 'Guitar', 3.5).bar, 1);
  const restored = setScoreDuration(reduced, '0', 1, () => 'unused');
  assert.equal(scoreMeasureDuration(restored, 'Guitar', 0), 4);
  assert.deepEqual(restored.notes, original.notes);
});

test('meter changes preserve bars, key signatures spell accidentals, and width weights share one line', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: Array.from({ length: 8 }, (_, index) => n(String(index))),
  };
  const score = setScoreTimeSignature(original, 6, 8);
  assert.equal(scoreBarBeats(score), 3);
  assert.equal(scoreMeasureStart(score, 'Guitar', 1), 4);
  assert.equal(scoreMeasures({ ...score, notes: [], measureLengths: {} }, 'Guitar').length, 1);
  assert.equal(spellScorePitch(70, -2).step, 'B');
  assert.equal(spellScorePitch(70, -2).alter, -1);
  assert.deepEqual(
    scoreAccidentalMarks(
      scoreMeasures(
        {
          ...original,
          notes: [
            { ...n('bb'), pitch: 70 },
            { ...n('b'), pitch: 71 },
          ],
        },
        'Guitar',
      )[0],
      -2,
    ),
    [[''], ['♮']],
  );
  assert.equal(setScoreMeasureWidth(score, 'Guitar', 1, 200).measureWidths.Guitar[1], 200);
  assert.throws(() => setScoreMeasureWidth(score, 'Guitar', 1, 0));
  assert.throws(() => setScoreMeasureWidth(score, 'Guitar', 1, 1.5));
  const points = [[{ offset: 0, space: 40 }], [{ offset: 0, space: 40 }]];
  const layouts = scoreSystemLayouts(points, 600, false, [200, 100], [3, 5]);
  assert.equal(layouts[0].width + layouts[1].width, 600);
  assert.equal(layouts[0].width, layouts[1].width * 2);
  assert.ok(layouts[1].xAt(4) < layouts[1].width);
});

test('repeat playback follows marks and maps the cursor back, including a selection inside a repeat', () => {
  let score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: Array.from({ length: 12 }, (_, index) => n(String(index))),
  };
  score = setScoreRepeat(setScoreRepeat(score, 1, { start: true }), 2, { end: true, times: 3 });
  const result = scorePlaybackFrom(score, 'Guitar');
  assert.equal(result.endBeat, 28);
  assert.equal(result.events.length, 28);
  assert.equal(scorePlaybackPosition(result.segments, 12), 4);
  assert.equal(scorePlaybackPosition(result.segments, 20.5), 4.5);
  const selected = scorePlaybackFrom(score, 'Guitar', 10);
  assert.equal(selected.endBeat - selected.startBeat, 18);
  assert.equal(selected.events[2].note.id, '4');
  const fromStart = scorePlaybackFrom(
    setScoreRepeat({ ...score, repeats: {} }, 0, { end: true }),
    'Guitar',
  );
  assert.deepEqual(
    fromStart.events.slice(0, 9).map((e) => e.note.id),
    ['0', '1', '2', '3', '0', '1', '2', '3', '4'],
  );
});

test('slurs span notes, survive complete clipboard copies, and clear when endpoints are removed', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [n('a'), n('b'), n('c')],
  };
  const score = setScoreSlur(original, ['a', 'b', 'c']);
  assert.equal(score.notes[0].slurTo, 'c');
  assert.equal(setScoreSlur(score, ['a', 'b', 'c']).notes[0].slurTo, undefined);
  assert.equal(removeScoreNotes(score, ['c']).notes[0].slurTo, undefined);
  const copied = readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: copyScoreNotes(score, 'Guitar', ['a', 'b', 'c']),
    }),
  );
  let id = 0;
  const pasted = pasteScoreNotes(
    { ...original, notes: [] },
    'Guitar',
    copied,
    0,
    () => `new-${++id}`,
  );
  assert.equal(pasted.score.notes[0].slurTo, pasted.score.notes[2].id);
  assert.match(scoreToMusicXml(score), /<slur type="start"/);
  assert.match(scoreToMusicXml(score), /<slur type="stop"/);
});

test('slurs preserve repeated notes and explicit articulations instead of creating implicit ties', () => {
  const tone = (pitch, string, fret) => ({ pitch, string, fret });
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [
      { ...n('a'), pitch: 64, tones: [tone(64, 1, 0), tone(62, 2, 3)] },
      { ...n('b'), pitch: 64, tones: [tone(64, 1, 0), tone(63, 2, 4)] },
      { ...n('c'), pitch: 64, tones: [tone(64, 2, 5)] },
      { ...n('d'), pitch: 64, tones: [tone(64, 2, 5)] },
    ],
  };
  const linked = setScoreSlur(original, ['a', 'b', 'c', 'd']);
  assert.equal(linked.notes[0].slurTo, 'd');
  assert.deepEqual(
    linked.notes.map((note) => noteTones(note).map((tone) => !!tone.ghost)),
    [[false, false], [false, false], [false], [false]],
  );
  assert.ok(original.notes.every((note) => noteTones(note).every((tone) => !tone.ghost)));
});

test('glissando and slide-out validate, toggle and survive copying', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [64, 71, 71].map((pitch, i) => ({
      ...n(String(i)),
      pitch,
      tones: [{ pitch, string: 1, fret: pitch - 64 }],
    })),
  };
  const linked = setScoreConnection(original, ['0'], 'glissando');
  assert.equal(linked.notes[0].connection.type, 'glissando');
  assert.equal(setScoreConnection(linked, ['0'], 'glissando').notes[0].connection, undefined);
  assert.throws(() => setScoreConnection(original, ['1'], 'glissando'));
  const slide = setScoreSlideOut(linked, ['0'], 'up');
  assert.equal(slide.notes[0].connection, undefined);
  assert.equal(slide.notes[0].slideOut, 'up');
  assert.throws(() => setScoreConnection(slide, ['0'], 'glissando'));
  assert.equal(setScoreSlideOut(slide, ['0'], 'up').notes[0].slideOut, undefined);
  assert.equal(setScoreSlideOut(slide, ['0'], 'down').notes[0].slideOut, 'down');
  assert.throws(() =>
    setScoreSlideOut({ ...original, notes: [{ ...n('0'), rest: true }] }, ['0'], 'up'),
  );
  const copied = readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: copyScoreNotes(slide, 'Guitar', ['0']),
    }),
  );
  const pasted = pasteScoreNotes({ ...original, notes: [] }, 'Guitar', copied, 0, () => 'new');
  assert.equal(pasted.score.notes[0].slideOut, 'up');
  assert.match(scoreToMusicXml(linked), /<glissando type="start"/);
  assert.match(scoreToMusicXml(slide), /<doit line-type="wavy"/);
  assert.match(
    scoreToMusicXml(setScoreSlideOut(slide, ['0'], 'down')),
    /<falloff line-type="wavy"/,
  );
});

test('inserting a measure through a sustained slide-out keeps the ending only on its last fragment', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [{ ...n('long', 8), slideOut: 'down' }],
  };
  let id = 0;
  const split = editScoreMeasure(score, 1, 'insert', () => `new-${++id}`);
  const sounding = split.notes.filter((note) => !note.rest);
  assert.deepEqual(
    sounding.map((note) => note.slideOut),
    [undefined, 'down'],
  );
});

test('shortening a sustained note removes its tail without moving the following notes across bars', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [n('long', 6), n('next', 2), n('third', 4)],
  };
  const shortened = setScoreDuration(original, 'long', 1, () => 'unused');
  assert.deepEqual(
    scoreMeasures(shortened, 'Guitar').map((bar) => [...new Set(bar.map((f) => f.note.id))]),
    [['long'], ['next'], ['third']],
  );
  assert.deepEqual(
    [0, 1, 2].map((bar) => scoreMeasureDuration(shortened, 'Guitar', bar)),
    [1, 2, 4],
  );
});
test('removing a blank beat can bring an irregular bar back into meter', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    timeSignature: { beats: 3, beatType: 4 },
    measureLengths: { Guitar: { 0: 4 } },
    notes: [n('a'), n('b'), n('c'), { ...n('blank'), blank: true, rest: true }, n('next', 3)],
  };
  const result = removeScoreNotes(original, ['blank']);
  assert.equal(scoreMeasureDuration(result, 'Guitar', 0), 3);
  assert.equal(scoreMeasures(result, 'Guitar')[1][0].note.id, 'next');
});

test('triplets change three note durations, preserve subsequent bars, and toggle back exactly', () => {
  const original = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: Array.from({ length: 8 }, (_, i) => n(String(i))),
  };
  const triplets = setScoreTriplet(original, ['0'], true);
  assert.deepEqual(
    triplets.notes.slice(0, 3).map((note) => note.beats),
    [2 / 3, 2 / 3, 2 / 3],
  );
  assert.equal(scoreMeasureDuration(triplets, 'Guitar', 0), 3);
  assert.deepEqual(
    scoreMeasures(triplets, 'Guitar').map((bar) => [...new Set(bar.map((f) => f.note.id))]),
    [
      ['0', '1', '2', '3'],
      ['4', '5', '6', '7'],
    ],
  );
  const back = setScoreTriplet(triplets, ['0', '1', '2'], false);
  assert.equal(scoreMeasureDuration(back, 'Guitar', 0), 4);
  assert.ok(back.notes.every((note) => note.beats === 1 && !note.tuplet));
  assert.throws(() => setScoreTriplet(original, ['0', '2', '3'], true));
});
test('triplet timing remains exact over many bars and shortest triplets render without phantom fragments', () => {
  const score = {
    title: 'Triplets',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: Array.from({ length: 120 }, (_, i) => ({ ...n(String(i), 1 / 3), tuplet: 3 })),
    barlines: { 0: 'double' },
  };
  const bars = scoreMeasures(score, 'Guitar');
  assert.equal(bars.length, 10);
  assert.ok(
    bars.every(
      (bar) => bar.length === 12 && scoreBeat(bar.reduce((sum, f) => sum + f.beats, 0)) === 4,
    ),
  );
  assert.equal(scorePlaybackFrom(score, 'Guitar').endBeat, 40);
  assert.equal(scoreTupletGroups(score.notes).length, 40);
  assert.deepEqual(scoreBeamGroups(bars[0]), [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [9, 10, 11],
  ]);
  const tiny = {
    ...score,
    notes: Array.from({ length: 96 }, (_, i) => ({ ...n(String(i), 1 / 24), tuplet: 3 })),
  };
  assert.equal(scoreMeasures(tiny, 'Guitar').length, 1);
  assert.equal(scoreMeasures(tiny, 'Guitar')[0].length, 96);
  const xml = scoreToMusicXml(score);
  assert.ok(xml.includes('<actual-notes>3</actual-notes><normal-notes>2</normal-notes>'));
  assert.ok(xml.includes('<type>eighth</type>'));
  assert.ok(xml.includes('<bar-style>light-light</bar-style>'));
  assert.equal((xml.match(/<tuplet type="start"/g) || []).length, 40);
});

test('stems follow the middle line and a chord or beam shares the extreme-note direction', () => {
  assert.equal(scoreStemDirection([112]), -1);
  assert.equal(scoreStemDirection([102]), 1);
  assert.equal(scoreStemDirection([82]), 1);
  assert.equal(scoreStemDirection([82, 122]), 1);
  assert.equal(scoreStemDirection([97, 132]), -1);
  assert.equal(scoreStemDirection([72, 107]), 1);
});

test('all global feels map ordinary subdivisions and cursor timing both ways', () => {
  for (const [rhythmFeel, feel] of Object.entries(scoreRhythmFeels)) {
    const input = {
      title: '',
      bpm: 120,
      parts: ['Guitar'],
      sync: {},
      rhythmFeel,
      notes: [n('a', feel.unit), n('b', feel.unit), n('c', 1), { ...n('d', 1 / 3), tuplet: 3 }],
    };
    const performance = scorePerformance(input, 'Guitar');
    const first = scoreBeat((2 * feel.unit * feel.first) / (feel.first + feel.second));
    assert.equal(performance.score.notes[0].beats, first);
    assert.equal(performance.score.notes[1].beats, scoreBeat(2 * feel.unit - first));
    assert.equal(performance.score.notes[2].beats, 1);
    assert.equal(performance.score.notes[3].beats, 1 / 3);
    assert.equal(input.notes[0].beats, feel.unit);
    assert.equal(performance.toPerformed(feel.unit), first);
    for (const at of [0, feel.unit / 2, feel.unit, feel.unit * 1.5, 4])
      assert.ok(Math.abs(performance.toWritten(performance.toPerformed(at)) - at) < 1e-7);
    const playback = scorePlaybackFrom(input, 'Guitar', feel.unit);
    assert.equal(playback.startBeat, first);
    assert.equal(playback.events[0].note.id, 'b');
    assert.equal(playback.toWritten(playback.startBeat), feel.unit);
  }
});

test('swing keeps repeat boundaries, other parts, explicit tuplets and non-grid rhythms unchanged', () => {
  const input = {
    title: '',
    bpm: 120,
    parts: ['Guitar', 'Bass'],
    sync: {},
    rhythmFeel: 'triplet-eighth',
    repeats: { 0: { start: true, end: true } },
    notes: [...Array.from({ length: 8 }, (_, i) => n(String(i), 0.5)), n('bass', 0.5, 'Bass')],
  };
  const plan = scorePlaybackFrom(input, 'Guitar');
  assert.equal(plan.endBeat, 8);
  assert.equal(plan.events[8].offset, 4);
  assert.equal(scorePerformance(input, 'Guitar').score.notes.at(-1).beats, 0.5);
  const mixed = {
    ...input,
    notes: [
      n('a', 0.25),
      n('b', 0.5),
      n('c', 0.5),
      n('d', 0.75),
      ...[1, 2, 3].map((i) => ({ ...n('t' + i, 1 / 3), tuplet: 3 })),
    ],
  };
  assert.deepEqual(scorePerformance(mixed, 'Guitar').score.notes, mixed.notes);
});

test('filling a short interior measure preserves the next measure and moves its chord anchors', () => {
  const input = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: { a: 0, b: 1 },
    measureLengths: { Guitar: { 0: 1 } },
    beatChords: { Guitar: { 1: 'Am' } },
    notes: [n('a'), n('b', 4)],
  };
  let serial = 0;
  const next = appendScoreMeasureNote(input, n('new'), 0, 3, () => 'gap' + serial++);
  assert.deepEqual(
    next.notes.map((item) => item.id),
    ['a', 'gap0', 'gap1', 'new', 'b'],
  );
  assert.equal(scoreMeasureDuration(next, 'Guitar', 0), 4);
  assert.deepEqual(
    scoreMeasures(next, 'Guitar')[1].map((fragment) => fragment.note.id),
    ['b'],
  );
  assert.equal(scoreChordPositions(next, 'Guitar')[4], 'Am');
  assert.deepEqual(next.sync, { a: 0 });
  assert.equal(
    next.notes.filter((item) => item.blank).reduce((sum, item) => sum + item.beats, 0),
    2,
  );
  assert.equal(input.notes.length, 2);
  const partial = appendScoreMeasureNote(input, n('half', 0.5), 0, 1, () => 'unused');
  assert.equal(scoreMeasureDuration(partial, 'Guitar', 0), 1.5);
  assert.equal(scoreMeasureStart(partial, 'Guitar', 1), 1.5);
});

test('swing shifts syncopated onsets even when an eighth note is followed by a sustained quarter', () => {
  const input = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    rhythmFeel: 'triplet-eighth',
    notes: [n('a', 0.5), n('b', 1), n('c', 0.5), n('d', 2)],
    repeats: { 0: { start: true, end: true } },
  };
  const performance = scorePerformance(input, 'Guitar');
  assert.deepEqual(
    performance.score.notes.map((note) => note.beats),
    [2 / 3, 1, 1 / 3, 2],
  );
  assert.deepEqual(
    input.notes.map((note) => note.beats),
    [0.5, 1, 0.5, 2],
  );
  const plan = scorePlaybackFrom(input, 'Guitar');
  assert.deepEqual(
    plan.events.map((event) => event.offset),
    [0, 2 / 3, 5 / 3, 2, 4, 4 + 2 / 3, 4 + 5 / 3, 6],
  );
  assert.equal(plan.endBeat, 8);
  assert.equal(scorePlaybackFrom(input, 'Guitar', 0.5).events[0].note.id, 'b');
  assert.equal(performance.toWritten(performance.toPerformed(1.5)), 1.5);
  const sixteenths = {
    ...input,
    rhythmFeel: 'triplet-sixteenth',
    notes: [n('a', 0.25), n('b', 0.5), n('c', 0.25)],
  };
  assert.deepEqual(
    scorePerformance(sixteenths, 'Guitar').score.notes.map((note) => note.beats),
    [1 / 3, 0.5, 1 / 6],
  );
});

test('straight quarter notes and already notated dotted or triplet rhythms are not swung again', () => {
  for (const notes of [
    [n('a'), n('b')],
    [n('a', 0.75), n('b', 0.25)],
    [0, 1, 2].map((i) => ({ ...n(String(i), 1 / 3), tuplet: 3 })),
  ]) {
    const score = {
      title: '',
      bpm: 120,
      parts: ['Guitar'],
      sync: {},
      rhythmFeel: 'triplet-eighth',
      notes,
    };
    assert.deepEqual(scorePerformance(score, 'Guitar').score.notes, notes);
  }
});

test('measure insertion/deletion shifts all parts and bar metadata together', () => {
  const input = {
    title: '',
    bpm: 120,
    parts: ['Bass', 'Guitar'],
    sync: { a: 0, b: 4, c: 7 },
    notes: [
      n('a', 4, 'Bass'),
      n('b', 3, 'Bass'),
      n('c', 4, 'Bass'),
      n('g1', 4),
      n('g2', 4),
      n('g3', 4),
    ],
    measureLengths: { Bass: { 1: 3 } },
    measureWidths: { Bass: { 1: 150 }, Guitar: { 2: 80 } },
    repeats: { 1: { start: true }, 2: { end: true } },
    barlines: { 1: 'double' },
    beatChords: { Bass: { 4: 'Dm', 7: 'G' }, Guitar: { 8: 'C' } },
  };
  let serial = 0;
  const added = editScoreMeasure(input, 1, 'insert', () => 'new-' + serial++);
  assert.equal(scoreMeasureCount(added, 'Bass'), 4);
  assert.equal(scoreMeasureCount(added, 'Guitar'), 4);
  assert.equal(scoreMeasures(added, 'Bass')[1][0].note.blank, true);
  assert.equal(scoreMeasures(added, 'Bass')[2][0].note.id, 'b');
  assert.equal(scoreMeasures(added, 'Guitar')[2][0].note.id, 'g2');
  assert.equal(added.measureWidths.Bass[2], 150);
  assert.equal(added.measureWidths.Guitar[3], 80);
  assert.equal(added.measureLengths.Bass[2], 3);
  assert.deepEqual(added.repeats, { 2: { start: true }, 3: { end: true } });
  assert.deepEqual(added.barlines, { 2: 'double' });
  assert.equal(scoreChordPositions(added, 'Bass')[8], 'Dm');
  assert.equal(scoreChordPositions(added, 'Bass')[11], 'G');
  assert.deepEqual(added.sync, { a: 0 });
  const restored = editScoreMeasure(added, 1, 'delete');
  for (const part of input.parts)
    assert.deepEqual(
      restored.notes.filter((n) => n.part === part),
      input.notes.filter((n) => n.part === part),
    );
  assert.deepEqual(restored.repeats, input.repeats);
  assert.deepEqual(restored.barlines, input.barlines);
  assert.equal(scoreChordPositions(restored, 'Bass')[4], 'Dm');
  const removed = editScoreMeasure(input, 1, 'delete');
  assert.deepEqual(
    removed.notes.filter((n) => n.part === 'Bass').map((n) => n.id),
    ['a', 'c'],
  );
  assert.equal(scoreMeasures(removed, 'Bass')[1][0].note.id, 'c');
  assert.equal(scoreChordPositions(removed, 'Bass')[4], 'G');
  assert.deepEqual(removed.repeats, { 1: { end: true } });
  assert.deepEqual(removed.barlines, {});
  assert.equal(input.notes.length, 6);
});

test('measure edits split sustained notes, handle the only bar, and reject over-capacity edits atomically', () => {
  const input = { title: '', bpm: 120, parts: ['Guitar'], sync: {}, notes: [n('long', 12)] };
  let serial = 0;
  const inserted = editScoreMeasure(input, 1, 'insert', () => 'new-' + serial++);
  assert.deepEqual(
    inserted.notes.map((n) => n.beats),
    [4, 4, 8],
  );
  assert.equal(inserted.notes[1].blank, true);
  assert.equal(inserted.notes[0].id, 'long');
  const deleted = editScoreMeasure(input, 1, 'delete');
  assert.deepEqual(
    deleted.notes.map((n) => [n.id, n.beats]),
    [['long', 8]],
  );
  const empty = editScoreMeasure({ ...input, notes: [n('only', 4)] }, 0, 'delete');
  assert.equal(empty.notes.length, 0);
  assert.equal(scoreMeasureCount(empty, 'Guitar'), 1);
  const full = { ...input, notes: Array.from({ length: 2000 }, (_, i) => n(String(i))) };
  assert.throws(() => editScoreMeasure(full, 0, 'insert'));
  assert.equal(full.notes.length, 2000);
});

test('deleting a rest pulls only its own bar, including irregular and otherwise empty bars', () => {
  const input = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [n('a'), { ...n('rest'), rest: true }, n('b', 2), n('next', 4)],
  };
  const deleted = deleteScorePosition(input, 'rest');
  assert.equal(scoreMeasureDuration(deleted, 'Guitar', 0), 3);
  assert.deepEqual(
    scoreMeasures(deleted, 'Guitar')[0].map((item) => item.note.id),
    ['a', 'b'],
  );
  assert.equal(scoreMeasures(deleted, 'Guitar')[1][0].note.id, 'next');
  const onlyRest = { ...input, notes: [{ ...n('rest', 4), rest: true }, n('next', 4)] };
  const cleared = deleteScorePosition(onlyRest, 'rest');
  assert.equal(scoreMeasureCount(cleared, 'Guitar'), 2);
  assert.equal(scoreMeasures(cleared, 'Guitar')[0][0].note.blank, true);
  assert.equal(scoreMeasures(cleared, 'Guitar')[1][0].note.id, 'next');
  const spanning = deleteScorePosition(
    { ...input, notes: [{ ...n('rest', 8), rest: true }, n('next', 4)] },
    'rest',
    undefined,
    4,
  );
  assert.equal(scoreMeasures(spanning, 'Guitar')[0][0].note.rest, true);
  assert.equal(scoreMeasures(spanning, 'Guitar')[1][0].note.blank, true);
  assert.equal(scoreMeasures(spanning, 'Guitar')[2][0].note.id, 'next');
});

test('the input position is the first gap, or the first unfilled beat at the tail', () => {
  const base = { title: '', bpm: 120, parts: ['Guitar'], sync: {}, notes: [n('a')] };
  assert.deepEqual(scoreMeasureEntry(base, 'Guitar', 0), { id: null, offset: 1, beat: 1 });
  const gaps = {
    ...base,
    notes: [
      n('a'),
      { ...n('gap', 0.5), rest: true, blank: true },
      n('b'),
      { ...n('tail', 1.5), rest: true, blank: true },
    ],
  };
  assert.deepEqual(scoreMeasureEntry(gaps, 'Guitar', 0), { id: 'gap', offset: 1, beat: 1 });
  assert.deepEqual(scoreMeasureEntry({ ...base, notes: [] }, 'Guitar', 0), {
    id: null,
    offset: 0,
    beat: 0,
  });
});
