import assert from 'node:assert/strict';
import { URL } from 'node:url';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';

async function source(path) {
  return import(moduleUrl(new URL(path, import.meta.url)));
}
const {
  renameScorePart,
  removeScorePart,
  removeScoreNotes,
  insertScoreNote,
  moveScoreNote,
  scoreMeasures,
  staffPosition,
  scoreInstrument,
  noteTones,
  tabTones,
  setScoreFret,
  setScoreDuration,
  removeScoreString,
  scoreToMusicXml,
  appendScoreNoteAt,
  scorePlaybackBeats,
  scorePlaybackFrom,
  scoreMeasureCount,
  setScoreMeasureChord,
  setScoreBeatChord,
  scoreChordPositions,
  copyScoreNotes,
  scoreMeasurePosition,
  scoreSystemRows,
  moveScoreMeasureToRow,
  pasteScoreNotes,
  readScoreClipboard,
} = await source('../packages/app/src/lib/score.ts');
const { validateAudioFile, trackPartLabel } = await source('../packages/app/src/lib/trackParts.ts');
const { scoreBeatX, scoreBeatHitRegions } = await source('../packages/app/src/lib/scoreLayout.ts');
const { scoreBackingSegment } = await source('../packages/app/src/lib/scoreBacking.ts');

test('chord changes belong to beat positions, including inside a sustained note and in empty measures', () => {
  const notes = [
    {
      id: 'long',
      pitch: 60,
      part: 'Guitar',
      beats: 8,
      rest: false,
      accent: false,
      chord: 'C',
      lyric: '',
    },
  ];
  let score = {
    title: '',
    bpm: 120,
    notes,
    parts: ['Guitar', 'Bass'],
    sync: {},
    measureChords: { Guitar: { 1: 'Am' } },
  };
  assert.deepEqual(scoreChordPositions(score, 'Guitar'), { 0: 'C', 4: 'Am' });
  score = setScoreBeatChord(score, 'Guitar', 6, 'G');
  score = setScoreBeatChord(score, 'Guitar', 6.5, 'D/F♯');
  assert.deepEqual(scoreChordPositions(score, 'Guitar'), { 0: 'C', 4: 'Am', 6: 'G', 6.5: 'D/F♯' });
  assert.deepEqual(score.notes, notes);
  score = setScoreBeatChord(score, 'Guitar', 4, 'Dm');
  assert.equal(score.measureChords.Guitar[1], undefined);
  score = setScoreBeatChord(score, 'Guitar', 4, '');
  assert.equal(scoreChordPositions(score, 'Guitar')[4], undefined);
  assert.equal(scoreChordPositions(score, 'Guitar')[6], 'G');
  score = setScoreBeatChord(score, 'Guitar', 0, '');
  assert.equal(scoreChordPositions(score, 'Guitar')[0], undefined);
  score = setScoreBeatChord(score, 'Guitar', 10, '<C & G>');
  assert.equal(scoreMeasureCount(score, 'Guitar'), 3);
  const xml = scoreToMusicXml(score);
  assert.ok(xml.includes('<words>G</words></direction-type><offset>96</offset>'));
  assert.ok(xml.includes('<words>D/F♯</words></direction-type><offset>120</offset>'));
  assert.ok(xml.includes('&lt;C &amp; G&gt;'));
  const renamed = renameScorePart(score, 'Guitar', 'Lead');
  assert.equal(renamed.beatChords.Lead[6], 'G');
  assert.deepEqual(removeScorePart(renamed, 'Lead').beatChords, {});
  assert.throws(() => setScoreBeatChord(score, 'Guitar', 0.1, 'C'));
  assert.throws(() => setScoreBeatChord(score, 'Missing', 0, 'C'));
});

test('score clipboard accepts passages and rejects malformed or unrelated clipboard data', () => {
  const note = {
    pitch: 60,
    beats: 0.0625,
    rest: false,
    accent: false,
    dead: true,
    chord: '',
    lyric: '',
    tones: [{ pitch: 60, string: 2, fret: 1 }],
  };
  const encode = (n) => JSON.stringify({ type: 'moajam-score', version: 1, notes: [n] });
  assert.equal(readScoreClipboard(encode(note))[0].dead, true);
  assert.equal(readScoreClipboard('ordinary copied text'), null);
  for (const changes of [
    { beats: -1 },
    { beats: 0.01 },
    { pitch: 200 },
    { tones: [{ pitch: 60, string: 9 }] },
    { rest: 'false' },
    { dead: 'yes' },
    { chord: null },
  ]) {
    assert.equal(readScoreClipboard(encode({ ...note, ...changes })), null);
  }
  assert.equal(
    readScoreClipboard(JSON.stringify({ type: 'moajam-score', version: 2, notes: [note] })),
    null,
  );
});

test('copy and paste keep chord changes inside a long note and shift existing destination chords', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [
      {
        id: 'long',
        pitch: 60,
        part: 'Guitar',
        beats: 4,
        rest: false,
        accent: false,
        chord: '',
        lyric: '',
      },
    ],
    beatChords: { Guitar: { 0: 'Am', 2: 'G' } },
  };
  const copied = copyScoreNotes(score, 'Guitar', ['long']);
  assert.deepEqual(copied[0].copiedChords, [
    { offset: 0, chord: 'Am' },
    { offset: 2, chord: 'G' },
  ]);
  const parsed = readScoreClipboard(
    JSON.stringify({ type: 'moajam-score', version: 1, notes: copied }),
  );
  const result = pasteScoreNotes(score, 'Guitar', parsed, 0, () => 'pasted');
  assert.deepEqual(scoreChordPositions(result.score, 'Guitar'), {
    0: 'Am',
    2: 'G',
    4: 'Am',
    6: 'G',
  });
  assert.equal(result.score.notes[0].copiedChords, undefined);
});

test('passage paste inserts a deep copy, preserves silences and articulations, and clears only shifted anchors', () => {
  const n = (id, part, beats = 1) => ({
    id,
    part,
    beats,
    pitch: 64,
    rest: false,
    chord: 'Am',
    lyric: '가',
    accent: true,
    dead: true,
    tones: [{ pitch: 64, string: 1, fret: 0 }],
  });
  const score = {
    title: '',
    bpm: 120,
    parts: ['Guitar', 'Bass'],
    notes: [
      n('a', 'Guitar'),
      n('bass', 'Bass'),
      { ...n('blank', 'Guitar', 2), rest: true, blank: true, tones: [] },
      n('b', 'Guitar'),
    ],
    sync: { a: 0, bass: 0.5, blank: 1, b: 3 },
  };
  let id = 0;
  const copied = [score.notes[0], score.notes[2]];
  const pasted = pasteScoreNotes(score, 'Guitar', copied, 2, () => `copy-${++id}`);
  assert.deepEqual(
    pasted.score.notes.filter((n) => n.part === 'Guitar').map((n) => n.beats),
    [1, 1, 1, 2, 1, 1],
  );
  assert.deepEqual(pasted.score.sync, { a: 0, bass: 0.5 });
  const inserted = pasted.score.notes.find((n) => n.id === pasted.ids[0]);
  assert.equal(inserted.dead, true);
  assert.equal(inserted.lyric, '가');
  assert.equal(inserted.chord, 'Am');
  assert.notEqual(inserted.tones, copied[0].tones);
  assert.notEqual(inserted.tones[0], copied[0].tones[0]);
  assert.deepEqual(score.sync, { a: 0, bass: 0.5, blank: 1, b: 3 });
  assert.equal(
    pasted.score.notes.find((n) => n.id === 'bass'),
    score.notes[1],
  );
  const crossPart = pasteScoreNotes(score, 'Bass', copied, 0, () => `copy-${++id}`);
  assert.ok(
    crossPart.ids.every((id) => crossPart.score.notes.find((n) => n.id === id).part === 'Bass'),
  );
  assert.deepEqual(crossPart.score.sync, { a: 0, blank: 1, b: 3 });
  const appended = pasteScoreNotes(score, 'Guitar', copied, 6, () => `copy-${++id}`);
  assert.equal(
    appended.score.notes.filter((n) => n.part === 'Guitar').reduce((sum, n) => sum + n.beats, 0),
    9,
  );
  assert.throws(() => pasteScoreNotes(score, 'Guitar', copied, 0.5, () => 'x'));
  assert.throws(() => pasteScoreNotes(score, 'Guitar', copied, NaN, () => 'x'));
  assert.throws(() => pasteScoreNotes(score, 'Guitar', [], 0, () => 'x'));
});

test('backing audio follows score selection, tempo and intro offset without exceeding either end', () => {
  assert.deepEqual(scoreBackingSegment(4, 12, 120, 5, 60), { delay: 0, offset: 7, duration: 4 });
  assert.deepEqual(scoreBackingSegment(4, 12, 60, 5, 60), { delay: 0, offset: 9, duration: 8 });
  assert.deepEqual(scoreBackingSegment(0, 4, 120, -0.5, 10), {
    delay: 0.5,
    offset: 0,
    duration: 1.5,
  });
  assert.deepEqual(scoreBackingSegment(4, 12, 120, 0, 2.5), { delay: 0, offset: 2, duration: 0.5 });
  assert.equal(scoreBackingSegment(4, 12, 120, 9, 10), null);
  assert.equal(scoreBackingSegment(0, 4, 120, -3, 10), null);
  assert.equal(scoreBackingSegment(0, 4, 0, 0, 10), null);
  assert.equal(scoreBackingSegment(0, 4, 120, NaN, 10), null);
});

test('wide and dense measures cover every click position once and select the nearest beat', () => {
  for (const width of [160, 400, 800, 1280]) {
    for (const offsets of [
      [0],
      [0, 1, 2, 3],
      [0, 0.0625, 0.125, 1.125, 2, 3.75],
      Array.from({ length: 64 }, (_, index) => index / 16),
    ]) {
      const regions = [...scoreBeatHitRegions(offsets, width)];
      assert.equal(regions[0][1].left, 0);
      assert.equal(regions.at(-1)[1].right, width);
      regions.forEach(([offset, region], index) => {
        assert.ok(region.right > region.left);
        assert.ok(
          scoreBeatX(offset, width) >= region.left && scoreBeatX(offset, width) < region.right,
        );
        if (index) assert.equal(region.left, regions[index - 1][1].right);
      });
      for (let x = 0.1; x < width; x += 3.7) {
        const matches = regions.filter(([, range]) => x >= range.left && x < range.right);
        assert.equal(matches.length, 1);
        const selectedDistance = Math.abs(x - scoreBeatX(matches[0][0], width));
        assert.ok(
          offsets.every(
            (offset) => selectedDistance <= Math.abs(x - scoreBeatX(offset, width)) + 1e-9,
          ),
        );
      }
    }
  }
});
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

test('selection playback clips a sustained note and retains silence through the last bar', () => {
  const score = fixture();
  const playback = scorePlaybackFrom(score, 'Guitar', 2);
  assert.equal(playback.startBeat, 2);
  assert.equal(playback.endBeat, 8);
  assert.deepEqual(
    playback.events.map(({ note, offset, beats }) => [note.id, offset, beats]),
    [
      ['g1', 0, 1],
      ['g2', 1, 2],
    ],
  );
  assert.deepEqual(
    scorePlaybackFrom(score, 'Guitar', 3).events.map((e) => e.note.id),
    ['g2'],
  );
  assert.deepEqual(scorePlaybackFrom(score, 'Guitar', 6).events, []);
  assert.equal(scorePlaybackFrom(score, 'Guitar', 6).endBeat, 8);
  assert.equal(scorePlaybackFrom(score, 'Guitar', 99).startBeat, 8);
  assert.equal(scorePlaybackFrom(score, 'Guitar', -1).startBeat, 0);
  const withBlank = {
    ...score,
    notes: [
      { ...note('blank', 'Guitar', 1), blank: true, rest: true },
      note('last', 'Guitar', 0.5),
    ],
  };
  assert.deepEqual(
    scorePlaybackFrom(withBlank, 'Guitar', 0.5).events.map((e) => [
      e.offset,
      e.beats,
      noteTones(e.note).length,
    ]),
    [
      [0, 0.5, 0],
      [0.5, 0.5, 1],
    ],
  );
});

test('duration edits move following onsets without deleting notes or changing other parts', () => {
  let id = 0;
  const makeId = () => `blank-${++id}`;
  const original = fixture();
  let edited = setScoreDuration(original, 'g1', 0.25, makeId);
  for (const beats of [0.5, 1, 2, 0.25, 1.5, 3]) {
    edited = setScoreDuration(edited, 'g1', beats, makeId);
    const guitar = edited.notes.filter((n) => n.part === 'Guitar');
    assert.equal(
      guitar
        .slice(
          0,
          guitar.findIndex((n) => n.id === 'g2'),
        )
        .reduce((sum, n) => sum + n.beats, 0),
      beats,
    );
    assert.equal(
      guitar.reduce((sum, n) => sum + n.beats, 0),
      beats + 2,
    );
    assert.deepEqual(
      edited.notes.find((n) => n.id === 'b1'),
      original.notes[1],
    );
    assert.equal(edited.sync.b1, original.sync.b1);
    assert.equal(edited.sync.g2, undefined);
  }
  assert.deepEqual(
    setScoreDuration(edited, 'g1', 4, makeId)
      .notes.filter((n) => n.part === 'Guitar')
      .map((n) => n.beats),
    [4, 2],
  );
  assert.equal(original.notes[0].beats, 3);
});

test('blank input splits at the cursor, consumes adjacent blanks and preserves silence and anchors', () => {
  let id = 0;
  const makeId = () => `new-${++id}`;
  const blank = (id, beats) => ({
    ...note(id, 'Guitar', beats),
    blank: true,
    rest: true,
    tones: [],
  });
  const score = {
    ...fixture(),
    notes: [blank('a', 2), note('b', 'Bass'), blank('c', 1), note('d', 'Guitar')],
    sync: { a: 0, c: 2, d: 3 },
  };
  const next = setScoreDuration(score, 'a', 0.5, makeId, 1);
  assert.deepEqual(
    next.notes.filter((n) => n.part === 'Guitar').map((n) => n.beats),
    [1, 0.5, 0.5, 1, 1],
  );
  const filled = setScoreFret(next, 'a', 1, 3);
  assert.equal(filled.notes.find((n) => n.id === 'a').blank, false);
  assert.equal(filled.notes.find((n) => n.id === 'a').beats, 0.5);
  const extended = setScoreDuration(score, 'a', 3, makeId);
  assert.deepEqual(
    extended.notes.filter((n) => n.part === 'Guitar').map((n) => n.beats),
    [3, 1],
  );
  assert.deepEqual(extended.sync, { a: 0, d: 3 });
  assert.deepEqual(
    setScoreDuration(score, 'a', 4, makeId)
      .notes.filter((n) => n.part === 'Guitar')
      .map((n) => n.beats),
    [4, 1],
  );
  assert.throws(() => setScoreDuration(score, 'a', 0, makeId));
  assert.throws(() => setScoreDuration(score, 'a', 0.3, makeId));
  assert.equal(setScoreDuration(score, 'd', 4, makeId).notes.at(-1).beats, 4);
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
  assert.deepEqual(removeScoreNotes(fixture(), ['g1']).sync, { b1: 2 });
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
    scoreMeasures({ ...fixture(), notes: [note('x', 'Guitar', 1 / 5)] }, 'Guitar'),
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

test('nonstandard durations are shown as tied notatable fragments', () => {
  const bars = scoreMeasures({ ...fixture(), notes: [note('x', 'Guitar', 2.5)] }, 'Guitar');
  assert.deepEqual(
    bars[0].map((item) => [item.beats, item.continued, item.continues]),
    [
      [2, false, true],
      [0.5, true, false],
    ],
  );
});

test('playback includes the last measure silence without adding an extra full measure', () => {
  const score = fixture();
  for (const [beats, expected] of [
    [0.25, 4],
    [1, 4],
    [4, 4],
    [4.5, 8],
    [8, 8],
  ]) {
    assert.equal(
      scorePlaybackBeats(
        { ...score, notes: [note('x', 'Guitar', beats), note('b', 'Bass', 12)] },
        'Guitar',
      ),
      expected,
    );
  }
  assert.equal(scorePlaybackBeats({ ...score, notes: [] }, 'Guitar'), 0);
  assert.equal(
    scorePlaybackBeats(
      { ...score, notes: [{ ...note('x', 'Guitar', 5), blank: true, rest: true }] },
      'Guitar',
    ),
    8,
  );
});

test('previous and next measure navigation handles ties, exact boundaries and unwritten measures', () => {
  const score = {
    ...fixture(),
    notes: [note('held', 'Guitar', 6), note('next', 'Guitar', 2), note('b', 'Bass', 12)],
  };
  assert.deepEqual(scoreMeasurePosition(score, 'Guitar', 0, -1), { id: 'held', beat: 0 });
  assert.deepEqual(scoreMeasurePosition(score, 'Guitar', 1, 1), { id: 'held', beat: 4 });
  assert.deepEqual(scoreMeasurePosition(score, 'Guitar', 4, 1), { id: null, beat: 8 });
  assert.deepEqual(scoreMeasurePosition(score, 'Guitar', 8, -1), { id: 'held', beat: 4 });
  assert.deepEqual(scoreMeasurePosition(score, 'Guitar', 6, -1), { id: 'held', beat: 0 });
});

test('systems begin with one measure, default to four per row, and move boundaries without changing notes', () => {
  const score = fixture();
  const counts = (value, count) => scoreSystemRows(value, 'Guitar', count).map((row) => row.count);
  assert.deepEqual(counts(score, 1), [1]);
  assert.deepEqual(counts(score, 5), [4, 1]);
  const pushed = moveScoreMeasureToRow(score, 'Guitar', 2, 1, 8);
  assert.deepEqual(counts(pushed, 8), [2, 4, 2]);
  assert.equal(pushed.notes, score.notes);
  assert.equal(pushed.sync, score.sync);
  const pulled = moveScoreMeasureToRow(pushed, 'Guitar', 2, -1, 8);
  assert.deepEqual(counts(pulled, 8), [3, 4, 1]);
  assert.equal(moveScoreMeasureToRow(score, 'Guitar', 0, 1, 1), score);
  assert.equal(moveScoreMeasureToRow(score, 'Guitar', 0, -1, 1), score);
  const five = moveScoreMeasureToRow(score, 'Guitar', 4, -1, 5);
  assert.deepEqual(counts(five, 5), [5]);
  const futureLayout = { ...score, systemLayout: { Guitar: [3, 1] } };
  assert.deepEqual(counts(moveScoreMeasureToRow(futureLayout, 'Guitar', 2, 1, 3), 4), [2, 2]);
  const renamed = renameScorePart(pushed, 'Guitar', 'Lead');
  assert.deepEqual(renamed.systemLayout.Lead, [2]);
  assert.equal(renamed.systemLayout.Guitar, undefined);
  assert.deepEqual(removeScorePart(pushed, 'Guitar').systemLayout, {});
  assert.deepEqual(counts({ ...score, systemLayout: { Guitar: [0, NaN, -1] } }, 5), [4, 1]);
});

test('moving a row boundary preserves earlier rows and other parts, and reflows all later rows', () => {
  const score = { ...fixture(), systemLayout: { Guitar: [3, 5, 1, 2, 6], Bass: [2, 3] } };
  const counts = (value, total) => scoreSystemRows(value, 'Guitar', total).map((row) => row.count);
  const next = moveScoreMeasureToRow(score, 'Guitar', 5, 1, 19);
  assert.deepEqual(counts(next, 19), [3, 2, 4, 4, 4, 2]);
  assert.deepEqual(counts(next, 23), [3, 2, 4, 4, 4, 4, 2], 'new measures also use automatic rows');
  const previous = moveScoreMeasureToRow(score, 'Guitar', 9, -1, 19);
  assert.deepEqual(counts(previous, 19), [3, 5, 2, 4, 4, 1]);
  for (const result of [next, previous]) {
    assert.equal(result.notes, score.notes);
    assert.equal(result.sync, score.sync);
    assert.equal(result.systemLayout.Bass, score.systemLayout.Bass);
  }
  const full = { ...score, systemLayout: { Guitar: [16, 4] } };
  assert.equal(moveScoreMeasureToRow(full, 'Guitar', 16, -1, 20), full);
  assert.equal(moveScoreMeasureToRow(score, 'Guitar', 3, 1, 19), score);
  assert.equal(moveScoreMeasureToRow(score, 'Guitar', 25, 1, 19), score);
});

test('TAB entry adds chord strings, replaces only the chosen string and clears to a rest', () => {
  const original = { ...fixture(), notes: [{ ...note('g1', 'Guitar'), rest: true }] };
  const first = setScoreFret(original, 'g1', 1, 3);
  const chord = setScoreFret(first, 'g1', 2, 2);
  assert.deepEqual(noteTones(chord.notes[0]), [
    { string: 1, fret: 3, pitch: 67, ghost: false, dead: false },
    { string: 2, fret: 2, pitch: 61, ghost: false, dead: false },
  ]);
  const replaced = setScoreFret(chord, 'g1', 1, 12);
  assert.deepEqual(
    noteTones(replaced.notes[0]).map((t) => t.pitch),
    [76, 61],
  );
  const cleared = removeScoreString(removeScoreString(replaced, 'g1', 1), 'g1', 2);
  assert.equal(cleared.notes[0].rest, true);
  assert.equal(cleared.notes[0].blank, true);
  assert.equal(cleared.notes[0].beats, 1);
  assert.equal(original.notes[0].tones, undefined);
  for (const [string, fret] of [
    [0, 0],
    [7, 0],
    [1, 25],
    [1, -1],
    [1, 1.5],
  ])
    assert.throws(() => setScoreFret(original, 'g1', string, fret));
});

test('entry after empty beats preserves silent time and can fill the middle without shifting later notes', () => {
  const score = { ...fixture(), notes: [] };
  let id = 0;
  const next = appendScoreNoteAt(score, note('melody', 'Guitar'), 3, () => `blank-${++id}`);
  assert.deepEqual(
    next.notes.map((item) => [!!item.blank, item.beats]),
    [
      [true, 1],
      [true, 1],
      [true, 1],
      [false, 1],
    ],
  );
  assert.deepEqual(next.notes.slice(0, 3).map(noteTones), [[], [], []]);
  const filled = setScoreFret(next, 'blank-2', 1, 7);
  assert.equal(filled.notes[1].blank, false);
  assert.equal(filled.notes[1].pitch, 71);
  assert.equal(
    filled.notes.slice(0, 3).reduce((sum, item) => sum + item.beats, 0),
    3,
  );
  assert.equal(next.notes[1].blank, true);
  assert.ok(scoreToMusicXml(next).includes('<note print-object="no"><rest/>'));
  assert.throws(() => appendScoreNoteAt(next, note('x', 'Guitar'), 2, () => 'bad'));
  assert.throws(() => appendScoreNoteAt(score, note('x', 'Guitar'), Infinity, () => 'bad'));
  const eighths = appendScoreNoteAt(
    score,
    note('eighth', 'Guitar', 0.5),
    1.5,
    () => `blank-${++id}`,
  );
  assert.deepEqual(
    eighths.notes.map((item) => item.beats),
    [0.5, 0.5, 0.5, 0.5],
  );
});

test('legacy pitches get playable TAB; tuning changes preserve pitch and part rename preserves instrument', () => {
  const score = fixture();
  assert.deepEqual(tabTones(score.notes[0], scoreInstrument(score, 'Guitar').tuning), [
    { pitch: 60, string: 2, fret: 1 },
  ]);
  const renamed = renameScorePart(score, 'Bass', 'Low');
  assert.equal(scoreInstrument(renamed, 'Low').id, 'bass');
  const low = { ...note('x', 'Guitar'), pitch: 40, tones: [{ pitch: 40, string: 6, fret: 0 }] };
  assert.deepEqual(tabTones(low, [64, 59, 55, 50, 45, 38]), [{ pitch: 40, string: 6, fret: 2 }]);
  assert.equal(
    tabTones({ ...low, pitch: 10, tones: undefined }, [64, 59, 55, 50, 45, 40])[0].string,
    undefined,
  );
});

test('MusicXML exports every chord pitch, fret and tie without advancing time for chord tones', () => {
  let score = {
    ...fixture(),
    parts: ['Guitar'],
    notes: [{ ...note('g1', 'Guitar', 5), rest: true }],
  };
  score = setScoreFret(setScoreFret(score, 'g1', 1, 3), 'g1', 2, 2);
  const xml = scoreToMusicXml(score);
  assert.equal((xml.match(/<chord\/>/g) ?? []).length, 2);
  assert.equal((xml.match(/<tie type="start"\/>/g) ?? []).length, 2);
  assert.equal((xml.match(/<tie type="stop"\/>/g) ?? []).length, 2);
  assert.ok(xml.includes('<string>2</string><fret>2</fret>'));
  assert.ok(xml.includes('<instrument-name>guitar</instrument-name>'));
  for (const measure of xml.matchAll(/<measure[^>]*>(.*?)<\/measure>/g)) {
    const duration = [...measure[1].matchAll(/<note(?: [^>]*)?>(.*?)<\/note>/g)]
      .filter((m) => !m[1].includes('<chord/>'))
      .reduce((sum, m) => sum + Number(m[1].match(/<duration>(\d+)<\/duration>/)[1]), 0);
    assert.equal(duration, 4 * 48);
  }
});
test('32nd and 64th notes preserve timing, articulations and exact MusicXML durations', () => {
  let id = 0;
  const makeId = () => `tiny-${++id}`;
  let score = {
    ...fixture(),
    parts: ['Guitar'],
    notes: [{ ...note('tiny', 'Guitar', 1), staccato: true, ghost: true }, note('next', 'Guitar')],
  };
  for (const beats of [0.125, 0.0625, 0.1875, 1]) {
    score = setScoreDuration(score, 'tiny', beats, makeId);
    const nextIndex = score.notes.findIndex((n) => n.id === 'next');
    assert.equal(
      score.notes.slice(0, nextIndex).reduce((sum, n) => sum + n.beats, 0),
      beats,
    );
    assert.equal(score.notes[0].staccato, true);
    assert.equal(score.notes[0].ghost, true);
    assert.ok(score.notes.filter((n) => n.blank).every((n) => !n.staccato && !n.ghost));
    assert.equal(scoreMeasures(score, 'Guitar')[0][0].beats, beats);
  }
  score = appendScoreNoteAt(
    { ...score, notes: [] },
    { ...score.notes[0], beats: 0.0625 },
    3.9375,
    makeId,
  );
  assert.equal(scorePlaybackBeats(score, 'Guitar'), 4);
  assert.equal(
    score.notes.reduce((sum, n) => sum + n.beats, 0),
    4,
  );
  assert.ok(score.notes.slice(0, -1).every((n) => !n.ghost && !n.staccato));
  const xml = scoreToMusicXml(score);
  assert.ok(xml.includes('<divisions>48</divisions>'));
  assert.ok(xml.includes('<duration>3</duration>'));
  assert.ok(xml.includes('<staccato/>'));
  assert.ok(xml.includes('<notehead parentheses="yes">normal</notehead>'));
  assert.throws(() => setScoreDuration(score, 'tiny', 0.03125, makeId));
});

test('measure chords work without notes, stay with parts and do not change timing or row layout', () => {
  const empty = { ...fixture(), notes: [] };
  let score = setScoreMeasureChord(empty, 'Guitar', 2, 'D/F♯');
  score = setScoreMeasureChord(score, 'Bass', 0, 'Am7');
  assert.equal(scoreMeasureCount(score, 'Guitar'), 3);
  assert.equal(scoreMeasureCount(score, 'Bass'), 1);
  assert.deepEqual(score.notes, []);
  assert.equal(scorePlaybackBeats(score, 'Guitar'), 0);
  assert.deepEqual(
    moveScoreMeasureToRow(score, 'Guitar', 1, 1, 3).measureChords,
    score.measureChords,
  );
  const renamed = renameScorePart(score, 'Guitar', 'Lead');
  assert.equal(renamed.measureChords.Lead[2], 'D/F♯');
  assert.equal(renamed.measureChords.Guitar, undefined);
  assert.deepEqual(removeScorePart(renamed, 'Lead').measureChords, { Bass: { 0: 'Am7' } });
  assert.equal(scoreMeasureCount(setScoreMeasureChord(score, 'Guitar', 2, ''), 'Guitar'), 1);
  assert.equal((scoreToMusicXml(score).match(/moajam-measure-chord-/g) ?? []).length, 2);
  const escaped = scoreToMusicXml(setScoreMeasureChord(score, 'Guitar', 0, '<C & G>'));
  assert.ok(escaped.includes('&lt;C &amp; G&gt;'));
  assert.throws(() => setScoreMeasureChord(score, 'Guitar', -1, 'C'));
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
