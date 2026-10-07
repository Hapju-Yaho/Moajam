import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const expression = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreExpression.ts', import.meta.url))
);
const parts = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url))
);
const files = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const { scorePdfMarkup } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdf.web.tsx', import.meta.url))
);
const notation = await import(
  moduleUrl(new URL('../packages/app/src/lib/drumNotation.ts', import.meta.url))
);
const measureRests = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreMeasureRests.ts', import.meta.url))
);
const n = (id, beats = 4, patch = {}) => ({
  id,
  part: 'Drums',
  pitch: 42,
  tones: [{ pitch: 42 }],
  beats,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  ...patch,
});
const base = (count = 4) => ({
  title: '기호',
  parts: ['Drums', 'Feet'],
  drumVoices: { Drums: 'Feet' },
  instruments: { Drums: 'drums', Feet: 'drums' },
  bpm: 120,
  notes: Array.from({ length: count }, (_, i) => n(String(i))),
  sync: {},
});
const route = (score) =>
  model
    .scorePlaybackFrom(score, 'Drums')
    .events.filter((e) => !e.note.blank)
    .map((e) => e.note.id);

test('hi-hat defaults persist across bars and voices, explicit articulations win without rewriting saved pitches', () => {
  const score = base();
  score.directions = {
    Drums: { 0: { hiHat: 'closed' }, 1: { hiHat: 'open' }, 3: { hiHat: 'half-open' } },
  };
  score.notes[2].tones = [{ pitch: 42, drumTechnique: 'closed' }, { pitch: 46 }];
  const before = JSON.stringify(score),
    performed = model.scorePerformance(score, 'Drums').score.notes;
  assert.deepEqual(
    performed.map((n) => n.tones[0].pitch),
    [42, 46, 42, 46],
  );
  assert.equal(performed[3].tones[0].drumTechnique, 'half-open');
  assert.equal(expression.directionAt(score, 'Feet', 2).hiHat, 'open');
  assert.equal(JSON.stringify(score), before);
});
test('dynamics interpolate inside bars and explicit dynamics replace a running swell', () => {
  const score = base();
  score.directions = {
    Drums: {
      0: { dynamic: 'p', swell: { to: 'ff', endBar: 2 } },
      3: { dynamic: 'pp', implement: 'brushes' },
    },
  };
  assert.equal(expression.directionAt(score, 'Drums', 0).gain, 0.35);
  assert.ok(expression.directionAt(score, 'Drums', 1.5).gain > 0.7);
  assert.equal(expression.directionAt(score, 'Drums', 2).gain, 1);
  assert.equal(expression.directionAt(score, 'Feet', 3).gain, 0.22);
  const performed = model.scorePerformance(score, 'Drums').score;
  assert.equal(performed.notes[3].percussionImplement, 'brushes');
});
test('flam, drag, buzz and measured rolls have separate attacks inside the written duration', () => {
  for (const [technique, count] of [
    ['flam', 2],
    ['drag', 3],
    ['double', 2],
    ['buzz', 4],
    ['roll2', 8],
    ['roll3', 16],
  ]) {
    const strikes = expression.drumStrikes(technique, 2, 120);
    assert.equal(strikes.length, count);
    assert.equal(strikes[0].offset, 0);
    assert.equal(strikes.at(-1).offset + strikes.at(-1).beats, 2);
    assert.ok(strikes.every((s) => s.beats > 0));
    if (['flam', 'drag'].includes(technique)) assert.ok(strikes[0].gain < strikes.at(-1).gain);
  }
});
test('measure repeat copies the preceding pattern in both voices and preserves written data', () => {
  const score = base(2);
  score.notes = [
    n('a', 1),
    n('b', 3, { pitch: 38, tones: [{ pitch: 38 }] }),
    n('blank', 4, { rest: true, blank: true }),
    n('foot', 4, { part: 'Feet', pitch: 36, tones: [{ pitch: 36 }] }),
    n('footBlank', 4, { part: 'Feet', rest: true, blank: true }),
  ];
  score.directions = { Drums: { 1: { measureRepeat: true, hiHat: 'open' } } };
  const before = JSON.stringify(score);
  assert.deepEqual(
    model
      .scorePerformance(score, 'Drums')
      .score.notes.filter((n) => n.part === 'Drums')
      .map((n) => [n.pitch, n.beats]),
    [
      [42, 1],
      [38, 3],
      [46, 1],
      [38, 3],
    ],
  );
  assert.deepEqual(
    model
      .scorePerformance(score, 'Feet')
      .score.notes.filter((n) => n.part === 'Feet')
      .map((n) => n.pitch),
    [36, 36],
  );
  assert.equal(JSON.stringify(score), before);
});
test('slash rhythm uses configured hi-hat with alternating kick/snare and leaves notation unchanged', () => {
  const score = base(1);
  score.notes = [n('a', 1, { slash: true }), n('b', 1, { slash: true })];
  score.directions = { Drums: { 0: { hiHat: 'open' } } };
  assert.deepEqual(
    model.scorePerformance(score, 'Drums').score.notes.map((n) => n.tones.map((t) => t.pitch)),
    [
      [46, 36],
      [46, 38],
    ],
  );
  assert.equal(score.notes[0].tones.length, 1);
});
test('first and second endings route repeat passes correctly', () => {
  const score = base();
  score.repeats = { 0: { start: true }, 1: { end: true } };
  score.navigation = { 1: { ending: 1 }, 2: { ending: 2 } };
  assert.deepEqual(route(score), ['0', '1', '0', '2', '3']);
  assert.deepEqual(
    model.scorePlaybackFrom(score, 'Drums', 4, 12).events.map((e) => e.note.id),
    ['1', '2'],
  );
});
test('D.C. al Fine and D.S. al Coda jump only once, with bounded playback', () => {
  const score = base(6);
  score.navigation = { 1: { fine: true }, 3: { jump: 'dc-fine' } };
  assert.deepEqual(route(score), ['0', '1', '2', '3', '0', '1']);
  score.navigation = {
    1: { segno: true },
    2: { toCoda: true },
    4: { jump: 'ds-coda' },
    5: { coda: true },
  };
  assert.deepEqual(route(score), ['0', '1', '2', '3', '4', '1', '2', '5']);
  score.navigation = { 3: { jump: 'dc' } };
  assert.deepEqual(route(score), ['0', '1', '2', '3', '0', '1', '2', '3', '4', '5']);
  score.navigation = { 3: { jump: 'ds' } };
  assert.throws(() => route(score), /세뇨/);
});
test('voice changes use the same occupied beat or the last entry position in that bar', () => {
  const score = base(2);
  score.notes.push(
    n('f1', 1, { part: 'Feet' }),
    n('gap', 7, { part: 'Feet', rest: true, blank: true }),
  );
  assert.deepEqual(parts.drumVoiceCursor(score, 'Feet', 0, 0), { id: 'f1', beat: 0, bar: 0 });
  assert.deepEqual(parts.drumVoiceCursor(score, 'Feet', 0, 3), { id: 'gap', beat: 1, bar: 0 });
  assert.deepEqual(parts.drumVoiceCursor(score, 'Feet', 1, 3), { id: 'gap', beat: 4, bar: 1 });
  assert.deepEqual(parts.drumVoiceCursor(score, 'Feet', 2, 2), { id: undefined, beat: 8, bar: 2 });
});
test('expressions persist through files, clipboard, rename and structural edits; invalid maps are rejected', async () => {
  const score = base();
  score.notes[0] = { ...score.notes[0], marcato: true, sticking: 'R', slash: true };
  score.directions = {
    Drums: { 1: { hiHat: 'open', dynamic: 'f', text: 'Fill', swell: { to: 'pp', endBar: 3 } } },
  };
  score.navigation = { 0: { segno: true }, 3: { jump: 'ds-fine', fine: true } };
  const restored = await files.parseScoreFile(
    await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
  );
  assert.deepEqual(restored.score.directions, score.directions);
  assert.deepEqual(restored.score.navigation, score.navigation);
  assert.equal(restored.score.notes[0].sticking, 'R');
  const copied = model.copyScoreNotes(score, 'Drums', ['0']);
  const clipboard = model.readScoreClipboard(
    JSON.stringify({ type: 'moajam-score', version: 1, notes: copied }),
  );
  assert.equal(clipboard[0].marcato, true);
  assert.equal(clipboard[0].slash, true);
  assert.deepEqual(
    model.renameScorePart(score, 'Drums', 'Drums 2').directions['Drums 2'],
    score.directions.Drums,
  );
  let i = 0;
  const shifted = model.editScoreMeasure(score, 0, 'insert', () => `insert${i++}`);
  assert.equal(shifted.navigation[1].segno, true);
  assert.equal(shifted.directions.Drums[2].swell.endBar, 4);
  assert.throws(() => expression.readScoreNavigation({ 0: { segno: true }, 1: { segno: true } }));
  assert.throws(() =>
    expression.readScoreDirections(
      { Drums: { 0: { swell: { to: 'f', endBar: 0 } } } },
      score.parts,
    ),
  );
  assert.throws(() =>
    files.validateScoreDocument({ ...score, notes: [{ ...score.notes[0], sticking: 'Z' }] }),
  );
});
test('PDF includes measure instructions, hairpins, endings, sticking, marcato and grace-note symbols', () => {
  const score = base(2);
  score.notes[0] = {
    ...score.notes[0],
    marcato: true,
    sticking: 'R',
    tones: [{ pitch: 38, drumTechnique: 'drag' }],
  };
  score.navigation = { 0: { ending: 1, segno: true } };
  score.directions = {
    Drums: { 0: { hiHat: 'closed', dynamic: 'p', swell: { to: 'f', endBar: 1 }, text: 'Fill' } },
  };
  const pdf = scorePdfMarkup(score, 'Drums', false);
  for (const label of ['Closed H.H', 'Fill', '크레셴도', '1번 괄호', '스티킹', '드래그 장식음'])
    assert.ok(pdf.includes(label), label);
});

test('explicit measure-rest entry replaces both voices without moving later bars; adjacent entries alone merge', async () => {
  let serial = 0;
  const id = () => `rest${serial++}`;
  const original = base(4);
  original.notes.push(n('foot', 16, { part: 'Feet', pitch: 36 }));
  let score = notation.inputDrumMeasureRest(original, 'Feet', 1, id);
  score = notation.inputDrumMeasureRest(score, 'Drums', 2, id);
  assert.equal(model.scoreMeasures(score, 'Drums')[3][0].note.id, '3');
  for (const p of score.parts) {
    const m = model.scoreMeasures(score, p);
    assert.equal(m[1][0].note.rest, true);
    assert.equal(m[2][0].note.rest, true);
    assert.equal(m[3][0].note.rest, false);
  }
  assert.deepEqual(
    notation
      .drumScoreSystems(score, score.parts, 4)
      .flatMap((r) => r.units)
      .map((u) => u.span),
    [1, 2, 1],
  );
  assert.deepEqual(
    notation
      .drumScoreSystems(score, score.parts, 4, 2)
      .flatMap((r) => r.units)
      .map((u) => u.span),
    [1, 1, 1, 1],
  );
  const restored = await files.parseScoreFile(
    await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
  );
  assert.deepEqual(restored.score.multiMeasureRests.Drums, { 1: 1, 2: 1 });
  score = notation.clearDrumMeasureRest(score, 'Feet', 1);
  assert.deepEqual(
    notation
      .drumScoreSystems(score, score.parts, 4)
      .flatMap((r) => r.units)
      .map((u) => u.span),
    [1, 1, 1, 1],
  );
  assert.equal(original.notes[1].rest, false);
});
test('measure-rest input supports non-4/4 meter and leaves missing earlier time blank', () => {
  let serial = 0;
  const score = { ...base(0), timeSignature: { beats: 3, beatType: 4 } };
  const next = notation.inputDrumMeasureRest(score, 'Drums', 2, () => `m${serial++}`);
  for (const p of next.parts) {
    const measures = model.scoreMeasures(next, p);
    assert.equal(measures[0][0].note.blank, true);
    assert.equal(measures[1][0].note.blank, true);
    assert.deepEqual(
      notation.drumRestGroups(measures[2], 3, true).map((r) => [r.whole, r.beats]),
      [[true, 3]],
    );
  }
});

test('measure rests work for guitar TAB, bass, standard notation and paired piano, including PDF and saved files', async () => {
  for (const instrument of ['guitar', 'bass', 'standard', 'piano']) {
    let serial = 0;
    const id = () => `${instrument}${serial++}`;
    let original = {
      ...base(0),
      parts: ['Solo', 'Other'],
      drumVoices: undefined,
      instruments: { Solo: instrument, Other: 'standard' },
      timeSignature: { beats: 3, beatType: 4 },
      notes: [
        n('solo', 15, { part: 'Solo', pitch: 60, tones: [{ pitch: 60 }] }),
        n('other', 15, { part: 'Other', pitch: 64, tones: [{ pitch: 64 }] }),
      ],
    };
    if (instrument === 'piano') original = parts.enableKeyboardPart(original, 'Solo');
    const staves = parts.scorePartStaves(original, 'Solo');
    let score = original;
    for (let bar = 1; bar <= 3; bar++)
      score = measureRests.inputScoreMeasureRest(score, staves.at(-1), bar, id);
    assert.deepEqual(
      score.notes.filter((n) => n.part === 'Other'),
      original.notes.filter((n) => n.part === 'Other'),
    );
    for (const part of staves)
      for (let bar = 1; bar <= 3; bar++) {
        const fragments = model.scoreMeasures(score, part)[bar];
        assert.equal(fragments.length, 1);
        assert.equal(fragments[0].beats, 3);
        assert.equal(fragments[0].note.rest, true);
        assert.equal(fragments[0].note.blank, false);
      }
    assert.deepEqual(
      measureRests
        .scoreRestSystems(score, staves, 5)
        .flatMap((s) => s.units)
        .map((u) => u.span),
      [1, 3, 1],
    );
    assert.deepEqual(
      measureRests
        .scoreRestSystems(score, score.parts, 5)
        .flatMap((s) => s.units)
        .map((u) => u.span),
      [1, 1, 1, 1, 1],
    );
    const pdf = scorePdfMarkup(score, 'Solo', true);
    assert.equal((pdf.match(/data-multirest="3"/g) ?? []).length, staves.length);
    if (instrument === 'guitar' || instrument === 'bass')
      assert.match(pdf, /data-measure-rest-staff="tab"/);
    const saved = await files.parseScoreFile(
      await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
    );
    assert.deepEqual(saved.score.multiMeasureRests, score.multiMeasureRests);
    const deleted = measureRests.deleteScoreMeasureRest(score, staves.at(-1), 2, id);
    for (const part of staves) {
      assert.equal(model.scoreMeasures(deleted, part)[2][0].note.blank, true);
      assert.deepEqual(model.scoreMeasures(deleted, part)[3], model.scoreMeasures(score, part)[3]);
    }
    assert.deepEqual(deleted.multiMeasureRests.Solo, { 1: 1, 3: 1 });
  }
});
test('explicit rest runs break at instructions and manual line boundaries', () => {
  const silent = [true, true, false, true, true, true],
    marks = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
  assert.deepEqual(
    notation
      .drumCompactSystems(silent, undefined, marks)
      .flatMap((r) => r.units)
      .map((u) => u.span),
    [2, 1, 3],
  );
  const layout = [
    { start: 0, count: 4, capacity: 4 },
    { start: 4, count: 2, capacity: 4 },
  ];
  assert.deepEqual(
    notation
      .drumCompactSystems(silent, undefined, marks, layout)
      .flatMap((r) => r.units)
      .map((u) => u.span),
    [2, 1, 1, 2],
  );
});

test('cursor opens only one measure of a rest run, regrouping both sides without changing lines', () => {
  const silent = [true, true, true, true, true, true, true, false];
  for (const marks of [{ 0: 7 }, Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, 1]))]) {
    const original = notation.drumCompactSystems(silent, undefined, marks);
    for (const [selected, spans] of [
      [0, [1, 6, 1]],
      [2, [2, 1, 4, 1]],
      [3, [3, 1, 3, 1]],
      [6, [6, 1, 1]],
    ]) {
      const rows = notation.drumCompactSystems(silent, selected, marks);
      assert.deepEqual(
        rows.map(({ start, count, capacity }) => ({ start, count, capacity })),
        original.map(({ start, count, capacity }) => ({ start, count, capacity })),
      );
      assert.deepEqual(
        rows.flatMap((r) => r.units).map((u) => u.span),
        spans,
      );
      assert.equal(rows.flatMap((r) => r.units).find((u) => u.bar === selected).span, 1);
    }
  }
  const rows = notation.drumCompactSystems(silent, 2, { 0: 7 }, [
    { start: 0, count: 4, capacity: 4 },
    { start: 4, count: 4, capacity: 4 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.units.map((u) => u.span)),
    [
      [2, 1, 1],
      [3, 1],
    ],
  );
});
test('expression resolution is per part and repeat passes reset for the next section', () => {
  const score = base(6);
  score.notes.push(n('foot', 24, { part: 'Feet', pitch: 42 }));
  score.directions = { Drums: { 0: { hiHat: 'open' } } };
  const hands = model.scoreExpressionPerformance(score, 'Drums');
  assert.equal(
    model.scoreExpressionPerformance(hands, 'Feet').notes.find((n) => n.part === 'Feet').pitch,
    46,
  );
  score.notes = score.notes.filter((n) => n.part === 'Drums');
  score.repeats = { 0: { start: true }, 1: { end: true }, 3: { start: true }, 4: { end: true } };
  score.navigation = { 1: { ending: 1 }, 2: { ending: 2 }, 4: { ending: 1 }, 5: { ending: 2 } };
  assert.deepEqual(route(score), ['0', '1', '0', '2', '3', '4', '3', '5']);
});

test('numbered single measure rests delete both voices without shifting later measures or removing other instruments', () => {
  let serial = 0;
  const id = () => `deleteRest${serial++}`;
  const original = base(4);
  original.parts.push('Guitar');
  original.notes.push(n('guitar', 16, { part: 'Guitar', pitch: 60 }));
  let score = notation.inputDrumMeasureRest(original, 'Drums', 1, id);
  score = notation.inputDrumMeasureRest(score, 'Drums', 2, id);
  const single = notation.inputDrumMeasureRest(base(1), 'Drums', 0, id);
  assert.match(scorePdfMarkup(single, 'Drums', false), /data-multirest="1"/);
  const deleted = notation.deleteDrumMeasureRest(score, 'Feet', 1, id);
  for (const part of ['Drums', 'Feet']) {
    const bars = model.scoreMeasures(deleted, part);
    assert.equal(bars[1][0].note.blank, true);
    assert.equal(bars[2][0].note.blank, false);
    assert.equal(model.scoreMeasureStart(deleted, part, 3), 12);
  }
  assert.equal(
    deleted.notes.find((n) => n.id === 'guitar'),
    original.notes.find((n) => n.id === 'guitar'),
  );
  assert.equal(deleted.multiMeasureRests.Drums[1], undefined);
  assert.equal(deleted.multiMeasureRests.Drums[2], 1);
  assert.equal(notation.deleteDrumMeasureRest(deleted, 'Drums', 1, id), deleted);
  const sounding = {
    ...score,
    notes: score.notes.map((n) => (n.part === 'Drums' && n.rest ? { ...n, rest: false } : n)),
  };
  assert.equal(notation.deleteDrumMeasureRest(sounding, 'Drums', 1, id), sounding);
});

test('selection hairpins use a full bar for one note and exact note boundaries for a range', () => {
  const score = { ...base(), notes: Array.from({ length: 12 }, (_, i) => n(String(i), 1)) };
  assert.deepEqual(model.scoreSwellSelection(score, 'Drums', ['2']), { start: 0, end: 1 });
  assert.deepEqual(model.scoreSwellSelection(score, 'Drums', ['1', '2']), {
    start: 0.25,
    end: 0.75,
  });
  assert.deepEqual(model.scoreSwellSelection(score, 'Drums', ['3', '4', '5']), {
    start: 0.75,
    end: 1.5,
  });
  assert.throws(() => model.setScoreSwell(score, 'Drums', [], 'crescendo'));
  assert.throws(() => model.setScoreSwell(score, 'Drums', ['0', '2'], 'crescendo'));
  const next = model.setScoreSwell(score, 'Drums', ['1', '2'], 'crescendo');
  const gain = (at) => expression.directionAt(next, 'Drums', at).gain;
  assert.equal(gain(0), 0.7);
  assert.equal(gain(0.25), 0.7);
  assert.ok(gain(0.5) > gain(0.25));
  assert.equal(gain(0.75), 0.85);
  assert.equal(gain(1), 0.85);
  assert.equal(expression.directionAt(next, 'Feet', 0.5).gain, gain(0.5));
  const events = model.scorePerformance(next, 'Drums').score.notes;
  assert.ok(events[2].playbackGain > events[1].playbackGain);
  assert.equal(score.directions, undefined);
});

test('multiple same-bar hairpins stay separate, clear independently, and survive files and PDF', async () => {
  const score = { ...base(), notes: Array.from({ length: 8 }, (_, i) => n(String(i), 0.5)) };
  let next = model.setScoreSwell(score, 'Drums', ['1', '2'], 'crescendo');
  next = model.setScoreSwell(next, 'Drums', ['5', '6'], 'decrescendo');
  assert.equal(next.directions.Drums[0].swells.length, 2);
  assert.ok(
    expression.directionAt(next, 'Drums', 0.8).gain <
      expression.directionAt(next, 'Drums', 0.625).gain,
  );
  const restored = await files.parseScoreFile(
    await files.serializeScoreFile({ score: next, referenceAudio: null, instrumentSample: null }),
  );
  assert.deepEqual(restored.score.directions, JSON.parse(JSON.stringify(next.directions)));
  const pdf = scorePdfMarkup(next, 'Drums', false);
  assert.match(pdf, /data-swell-start="0.125" data-swell-end="0.375"/);
  assert.match(pdf, /data-swell-start="0.625" data-swell-end="0.875"/);
  assert.match(pdf, /aria-label="크레셴도"/);
  assert.match(pdf, /aria-label="디크레셴도"/);
  next = model.setScoreSwell(next, 'Drums', ['1', '2'], null);
  assert.equal(next.directions.Drums[0].swells.length, 1);
  assert.equal(next.directions.Drums[0].swells[0].startOffset, 0.625);
  next = model.setScoreSwell(next, 'Drums', ['0'], 'crescendo');
  assert.equal(next.directions.Drums[0].swells.length, 1);
  assert.equal(next.directions.Drums[0].swells[0].startOffset, 0);
  assert.equal(next.directions.Drums[0].swells[0].endBar, 1);
});

test('hairpin ranges follow measure insertion/deletion and reject malformed endpoints', () => {
  const score = { ...base(), notes: Array.from({ length: 12 }, (_, i) => n(String(i), 1)) };
  const next = model.setScoreSwell(score, 'Drums', ['3', '4', '5'], 'crescendo');
  let serial = 0;
  const inserted = model.editScoreMeasure(next, 1, 'insert', () => 'i' + serial++);
  assert.equal(inserted.directions.Drums[0].swells[0].endBar, 2);
  const restored = model.editScoreMeasure(inserted, 1, 'delete', () => 'i' + serial++);
  assert.deepEqual(restored.directions.Drums[0].swells, next.directions.Drums[0].swells);
  const cut = model.editScoreMeasure(next, 1, 'delete', () => 'i' + serial++);
  assert.equal(cut.directions.Drums[0].swells[0].endBar, 1);
  assert.equal(cut.directions.Drums[0].swells[0].endOffset, 0);
  const one = model.setScoreSwell(score, 'Drums', ['0'], 'crescendo');
  const after = model.editScoreMeasure(one, 1, 'insert', () => 'i' + serial++);
  assert.equal(after.directions.Drums[0].swells[0].endBar, 1);
  for (const patch of [
    { startOffset: -1 },
    { endBar: 0, endOffset: 0.5 },
    { from: NaN },
    { to: 'fff' },
    { endOffset: 1 },
  ]) {
    assert.throws(() =>
      expression.readScoreDirections(
        { Drums: { 0: { swells: [{ ...next.directions.Drums[0].swells[0], ...patch }] } } },
        score.parts,
      ),
    );
  }
});
