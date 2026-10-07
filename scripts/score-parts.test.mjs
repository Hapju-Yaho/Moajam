import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const cache = new Map();
function moduleUrl(path) {
  if (cache.has(path.href)) return cache.get(path.href);
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const linked = outputText.replace(/from ['"](.+?)['"]/g, (_, relative) => {
    if (!relative.startsWith('.')) return `from '${import.meta.resolve(relative)}'`;
    const candidate = new URL(relative + '.ts', path);
    return `from '${moduleUrl(existsSync(candidate) ? candidate : new URL(relative + '.tsx', path))}'`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  cache.set(path.href, url);
  return url;
}
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const parts = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url))
);
const files = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const { scorePdfMarkup } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdf.web.tsx', import.meta.url))
);
const base = () => ({
  title: '합주',
  bpm: 120,
  parts: ['기타 1'],
  notes: [],
  sync: {},
  instruments: { '기타 1': 'guitar' },
});
const note = (id, part, pitch, beats) => ({
  id,
  part,
  pitch,
  beats,
  rest: false,
  chord: '',
  lyric: '',
  accent: false,
});

test('system spacing is saved and printed; invalid spacing is rejected by file and server validation', async () => {
  const { isBandScore } = await import(
    moduleUrl(new URL('../apps/server/src/workspaces/score-policy.ts', import.meta.url))
  );
  for (const gap of [0, 14, 60, 160]) {
    const score = { ...base(), systemGap: gap };
    assert.equal(isBandScore(score), true);
    const saved = await files.serializeScoreFile({
      score,
      referenceAudio: null,
      instrumentSample: null,
    });
    assert.equal((await files.parseScoreFile(saved)).score.systemGap, gap);
    assert.match(scorePdfMarkup(score, '기타 1', true), new RegExp(`gap:${gap}(px)?`));
  }
  for (const gap of [-1, 161, 1.5, '60', null]) {
    const score = { ...base(), systemGap: gap };
    assert.equal(isBandScore(score), false);
    await assert.rejects(async () =>
      files.parseScoreFile(
        await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
      ),
    );
  }
});

test('part order moves whole instruments with their hands/voices and preserves notes, settings and saved order', async () => {
  let score = parts.addInstrumentPart(base(), '키보드', 'piano');
  score = parts.addInstrumentPart(score, '드럼', 'drums');
  const left = score.keyboardStaves['키보드'],
    feet = score.drumVoices['드럼'];
  score.notes = [
    note('guitar', '기타 1', 64, 1),
    note('left', left, 48, 1),
    note('feet', feet, 36, 1),
  ];
  score.multiMeasureRests = { 키보드: { 2: 1 } };
  score.partMix = { 드럼: { volume: 0.6, muted: false, solo: true } };
  assert.equal(parts.moveInstrumentPart(score, '기타 1', -1), score);
  assert.equal(parts.moveInstrumentPart(score, feet, 1), score);
  const moved = parts.moveInstrumentPart(score, feet, -1);
  assert.deepEqual(moved.parts, ['기타 1', '드럼', feet, '키보드', left]);
  assert.equal(moved.notes, score.notes);
  assert.equal(moved.partMix, score.partMix);
  assert.equal(moved.multiMeasureRests, score.multiMeasureRests);
  const renamed = model.renameScorePart(moved, '드럼', '리듬');
  assert.equal(renamed.drumVoices['리듬'], feet);
  assert.equal(parts.scorePartOwner(renamed, feet), '리듬');
  const restored = await files.parseScoreFile(
    await files.serializeScoreFile({
      score: renamed,
      referenceAudio: null,
      instrumentSample: null,
    }),
  );
  assert.deepEqual(restored.score.parts, renamed.parts);
  assert.deepEqual(parts.scoreVisibleParts(restored.score), ['기타 1', '리듬', '키보드']);
  assert.deepEqual(score.parts, ['기타 1', '키보드', left, '드럼', feet]);
});

test('capo preserves written frets while transposing only that part, and survives rename, files and PDF', async () => {
  let original = {
    ...base(),
    parts: ['기타 1', 'Vocal'],
    notes: [note('g', '기타 1', 64, 1), note('v', 'Vocal', 60, 1)],
  };
  original = model.setScoreFret(original, 'g', 1, 0);
  original = model.setScoreFret(original, 'g', 2, 2);
  const capo = model.setScoreCapo(original, '기타 1', 3);
  assert.deepEqual(model.scoreInstrument(capo, '기타 1').tuning, [67, 62, 58, 53, 48, 43]);
  assert.deepEqual(
    model
      .tabTones(capo.notes[0], model.scoreInstrument(capo, '기타 1').tuning)
      .map((t) => [t.string, t.fret, t.pitch]),
    [
      [1, 0, 67],
      [2, 2, 64],
    ],
  );
  assert.equal(capo.notes[1], original.notes[1]);
  assert.deepEqual(
    capo.notes[0].tones.map((t) => t.fret),
    original.notes[0].tones.map((t) => t.fret),
  );
  assert.deepEqual(model.setScoreCapo(capo, '기타 1', 0).notes, original.notes);
  assert.equal(model.setScoreCapo(capo, '기타 1', 3), capo);
  const entered = model.setScoreFret(capo, 'g', 1, 5);
  assert.equal(entered.notes[0].tones[0].pitch, 72);
  const renamed = model.renameScorePart(capo, '기타 1', '어쿠스틱');
  assert.equal(renamed.capos['어쿠스틱'], 3);
  assert.equal(renamed.capos['기타 1'], undefined);
  const restored = await files.parseScoreFile(
    await files.serializeScoreFile({
      score: renamed,
      referenceAudio: null,
      instrumentSample: null,
    }),
  );
  assert.deepEqual(restored.score.capos, renamed.capos);
  assert.deepEqual(restored.score.notes, renamed.notes);
  assert.match(scorePdfMarkup(capo, '기타 1', true), /Capo = 3 fret/);
  assert.match(scorePdfMarkup(capo, '기타 1', false), /Capo = 3 fret/);
  assert.equal(model.removeScorePart(renamed, '어쿠스틱').capos['어쿠스틱'], undefined);
  assert.throws(() => model.setScoreCapo(original, 'Vocal', 3));
  for (const invalid of [-1, 13, 1.5, NaN, '3'])
    assert.throws(() => model.setScoreCapo(original, '기타 1', invalid));
  assert.throws(() => model.readScoreCapos({ missing: 3 }, original.parts));
});

test('drum voices split hand/foot hits without retiming and render independent rests on one staff', async () => {
  const initial = {
    title: '드럼',
    bpm: 120,
    parts: ['Drums'],
    sync: {},
    notes: [
      { ...note('a', 'Drums', 42, 0.5), tones: [{ pitch: 42 }, { pitch: 36 }] },
      note('b', 'Drums', 36, 0.5),
      note('c', 'Drums', 38, 1),
    ],
  };
  let counter = 0;
  const score = parts.enableDrumVoices(initial, 'Drums', () => `feet-${counter++}`);
  const lower = score.drumVoices.Drums;
  assert.deepEqual(parts.scoreVisibleParts(score), ['Drums']);
  assert.deepEqual(parts.audibleScoreParts(score, lower, false), ['Drums', lower]);
  assert.deepEqual(
    score.notes.filter((n) => n.part === 'Drums').map((n) => [n.beats, n.rest]),
    [
      [0.5, false],
      [0.5, true],
      [1, false],
    ],
  );
  assert.deepEqual(
    score.notes.filter((n) => n.part === lower).map((n) => [n.beats, n.rest]),
    [
      [0.5, false],
      [0.5, false],
      [1, true],
    ],
  );
  assert.equal(initial.parts.length, 1);
  const edited = model.setScoreDuration(score, 'feet-0', 1, () => `gap-${counter++}`);
  assert.deepEqual(
    edited.notes.filter((n) => n.part === 'Drums'),
    score.notes.filter((n) => n.part === 'Drums'),
  );
  const markup = scorePdfMarkup(score, 'Drums', false);
  assert.equal((markup.match(/class="score-system"/g) ?? []).length, 1);
  assert.match(markup, /aria-label="위 성부 쉼표"[^>]*y="81"/);
  assert.match(markup, /aria-label="아래 성부 쉼표"[^>]*y="147"/);
  assert.match(markup, /data-stem-direction="up"/);
  assert.match(markup, /data-stem-direction="down"/);
  const saved = await files.serializeScoreFile({
    score,
    referenceAudio: null,
    instrumentSample: null,
  });
  assert.deepEqual(files.parseScoreFile(saved).score.drumVoices, score.drumVoices);
  const renamed = model.renameScorePart(score, 'Drums', '리듬');
  assert.equal(renamed.drumVoices['리듬'], lower);
  assert.equal(parts.scorePartOwner(renamed, lower), '리듬');
  assert.throws(() => files.validateScoreDocument({ ...score, drumVoices: { Drums: 'Drums' } }));
  assert.throws(() =>
    files.validateScoreDocument({
      ...score,
      drumVoices: { Drums: lower },
      keyboardStaves: { Drums: lower },
    }),
  );
});

test('same instrument parts are independent; keyboard hands form a single logical part', () => {
  const initial = base();
  const two = parts.addInstrumentPart(initial, '기타 2', 'guitar');
  const score = parts.addInstrumentPart(two, '키보드', 'piano');
  assert.deepEqual(parts.scoreVisibleParts(score), ['기타 1', '기타 2', '키보드']);
  const [right, left] = parts.scorePartStaves(score, '키보드');
  assert.equal(parts.scorePartOwner(score, left), right);
  assert.equal(model.scoreInstrument(score, left).clef, 'bass');
  assert.equal(model.scoreInstrument(score, right).clef, 'treble');
  assert.deepEqual(initial, base());
  assert.throws(() => parts.addInstrumentPart(score, '기타 1', 'guitar'));
});
test('keyboard grouping, chords and independent hand rhythms survive file roundtrip, rename and delete', async () => {
  let score = parts.addInstrumentPart(base(), '키보드', 'piano');
  const [right, left] = parts.scorePartStaves(score, '키보드');
  score.notes = [
    { ...note('r', right, 60, 1), tones: [{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }] },
    note('l', left, 36, 4),
  ];
  score.partMix = { [right]: { volume: 0.6, muted: false, solo: true } };
  const result = files.parseScoreFile(
    await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
  );
  assert.deepEqual(result.score, JSON.parse(JSON.stringify(score)));
  const renamed = model.renameScorePart(score, right, '신스');
  assert.deepEqual(parts.scorePartStaves(renamed, left), ['신스', left]);
  assert.equal(parts.scorePartMix(renamed, left).volume, 0.6);
  const deleted = parts.removeInstrumentPart(renamed, '신스');
  assert.deepEqual(deleted.parts, ['기타 1']);
  assert.equal(deleted.notes.length, 0);
  assert.throws(() => parts.removeInstrumentPart(deleted, '기타 1'));
  const xml = model.scoreToMusicXml(score);
  assert.match(xml, /moajam-keyboard-staves/);
  assert.match(xml, /<sign>F<\/sign><line>4<\/line><\/clef>/);
});
test('mix applies to both hands, solo excludes other parts and mute still wins', () => {
  let score = parts.addInstrumentPart(base(), '건반', 'piano');
  const hands = parts.scorePartStaves(score, '건반');
  assert.deepEqual(parts.audibleScoreParts(score, hands[1], false), hands);
  score.partMix = { 건반: { volume: 0.5, solo: true, muted: false } };
  assert.deepEqual(parts.audibleScoreParts(score, '기타 1', true), hands);
  score.partMix['건반'].muted = true;
  assert.deepEqual(parts.audibleScoreParts(score, '기타 1', true), []);
});
test('reject invalid grouping and mixer data instead of losing or cross-linking staves', () => {
  const score = parts.addInstrumentPart(base(), '건반', 'piano');
  assert.throws(() =>
    files.validateScoreDocument({ ...score, keyboardStaves: { 건반: 'missing' } }),
  );
  assert.throws(() => files.validateScoreDocument({ ...score, keyboardStaves: { 건반: '건반' } }));
  assert.throws(() =>
    files.validateScoreDocument({
      ...score,
      partMix: { 건반: { volume: 2, muted: false, solo: false } },
    }),
  );
});
test('ensemble PDF aligns measures across dense guitar and keyboard hands and prints both clefs', () => {
  const score = parts.addInstrumentPart(base(), '건반', 'piano');
  const [right, left] = parts.scorePartStaves(score, '건반');
  score.notes = [
    ...Array.from({ length: 16 }, (_, i) => note('g' + i, '기타 1', 60 + (i % 4), 0.5)),
    note('r', right, 72, 4),
    note('r2', right, 76, 4),
    note('l', left, 36, 4),
    note('l2', left, 43, 4),
  ];
  const html = scorePdfMarkup(score, '건반', false, 800, score.parts);
  assert.match(html, /건반 · 오른손/);
  assert.match(html, /건반 · 왼손/);
  assert.match(html, /𝄢/);
  const staves = html.split('class="score-ensemble-staff"').slice(1);
  assert.equal(staves.length, 3);
  const barXs = staves.map((s) =>
    [...s.matchAll(/class="score-measure[^"]*"[^>]*transform="translate\(([^,]+)/g)].map(
      (m) => m[1],
    ),
  );
  assert.ok(barXs[0].length >= 2);
  assert.deepEqual(barXs[0], barXs[1]);
  assert.deepEqual(barXs[1], barXs[2]);
});

test('shared playback pads incomplete measures without moving or changing saved hand notes', () => {
  const score = parts.addInstrumentPart(base(), '건반', 'piano');
  const [right, left] = parts.scorePartStaves(score, '건반');
  score.notes = [
    note('r1', right, 72, 1),
    note('r2', right, 74, 4),
    note('l1', left, 36, 4),
    note('l2', left, 38, 4),
  ];
  score.measureLengths = { [right]: { 0: 1 } };
  score.repeats = { 0: { start: true }, 1: { end: true, times: 2 } };
  const original = JSON.stringify(score);
  const result = parts.ensemblePlaybackScore(score, [right, left], right);
  const rightPlan = model.scorePlaybackFrom(result.score, right),
    leftPlan = model.scorePlaybackFrom(result.score, left);
  assert.deepEqual(
    rightPlan.events.filter((e) => e.note.id === 'r2').map((e) => e.offset),
    [4, 12],
  );
  assert.deepEqual(
    leftPlan.events.filter((e) => e.note.id === 'l2').map((e) => e.offset),
    [4, 12],
  );
  assert.equal(result.toShared(1), 4);
  assert.equal(result.toSelected(4), 1);
  assert.equal(rightPlan.endBeat, leftPlan.endBeat);
  assert.equal(JSON.stringify(score), original);
});

test('drum rests retain individual durations and only explicit multi-measure settings collapse bars', async () => {
  const { drumRestGroups, drumSilentMeasures, drumCompactSystems, setDrumMultiMeasureRest } =
    await import(moduleUrl(new URL('../packages/app/src/lib/drumNotation.ts', import.meta.url)));
  const fragments = [0, 0.25, 0.5, 0.75].map((offset, i) => ({
    note: { ...note(`r${i}`, 'Drums', 36, 0.25), rest: true },
    offset: 3 + offset,
    beats: 0.25,
    continued: false,
    continues: false,
  }));
  assert.deepEqual(
    drumRestGroups(fragments, 4),
    fragments.map((f) => ({ offset: f.offset, beats: 0.25, whole: false })),
  );
  assert.equal(fragments.length, 4);
  const offbeat = fragments.map((f) => ({ ...f, offset: f.offset - 1.25 }));
  assert.deepEqual(
    drumRestGroups(offbeat, 4).map((r) => r.beats),
    [0.25, 0.25, 0.25, 0.25],
  );
  const score = {
    title: 'intro',
    bpm: 124,
    parts: ['Drums', 'Feet'],
    sync: {},
    drumVoices: { Drums: 'Feet' },
    instruments: { Drums: 'drums', Feet: 'drums' },
    notes: Array.from({ length: 7 }, (_, i) => ({ ...note(`r${i}`, 'Drums', 36, 4), rest: true })),
  };
  const silent = drumSilentMeasures(score, score.parts, 7);
  assert.deepEqual(silent, Array(7).fill(true));
  assert.equal(drumCompactSystems([...silent, false])[0].units[0].span, 1);
  assert.doesNotMatch(scorePdfMarkup(score, 'Drums', false), /data-multirest=/);
  const grouped = setDrumMultiMeasureRest(score, 'Drums', 0, 7);
  assert.equal(
    drumCompactSystems([...silent, false], undefined, grouped.multiMeasureRests.Drums)[0].units[0]
      .span,
    7,
  );
  assert.equal(
    drumCompactSystems(silent, 3, grouped.multiMeasureRests.Drums)
      .flatMap((s) => s.units)
      .some((u) => u.bar <= 3 && u.bar + u.span > 3 && u.span > 1),
    false,
  );
  assert.match(scorePdfMarkup(grouped, 'Drums', false), /data-multirest="7"/);
  assert.equal(
    (scorePdfMarkup(grouped, 'Drums', false).match(/data-barline="staff"/g) || []).length,
    1,
  );
  assert.deepEqual(grouped.notes, score.notes);
  const restored = await files.parseScoreFile(
    await files.serializeScoreFile({
      score: grouped,
      referenceAudio: null,
      instrumentSample: null,
    }),
  );
  assert.deepEqual(restored.score.multiMeasureRests, grouped.multiMeasureRests);
  assert.deepEqual(setDrumMultiMeasureRest(grouped, 'Feet', 0, 0).multiMeasureRests.Drums, {});
  assert.throws(() => setDrumMultiMeasureRest(grouped, 'Drums', 3, 2), /겹쳐/);
  assert.throws(() => setDrumMultiMeasureRest(score, 'Drums', 0, 8), /쉬는/);
  assert.throws(() => setDrumMultiMeasureRest(score, 'Drums', 0, 1), /2~128/);
  assert.throws(() => model.readScoreMultiMeasureRests({ Drums: { 0: 7, 3: 2 } }, score.parts));
  assert.throws(() => model.readScoreMultiMeasureRests({ Drums: { 0: '7' } }, score.parts));
  assert.deepEqual(model.renameScorePart(grouped, 'Drums', '리듬').multiMeasureRests, {
    리듬: { 0: 7 },
  });
  assert.deepEqual(
    parts.removeInstrumentPart({ ...grouped, parts: [...grouped.parts, 'Guitar'] }, 'Drums')
      .multiMeasureRests,
    {},
  );
  let serial = 0;
  assert.deepEqual(
    model.editScoreMeasure(grouped, 0, 'insert', () => `insert-${serial++}`).multiMeasureRests
      .Drums,
    { 1: 7 },
  );
  assert.deepEqual(
    model.editScoreMeasure(grouped, 3, 'insert', () => `insert-${serial++}`).multiMeasureRests
      .Drums,
    {},
  );
  assert.deepEqual(model.editScoreMeasure(grouped, 3, 'delete').multiMeasureRests.Drums, {});
  score.repeats = { 3: { start: true } };
  assert.equal(drumSilentMeasures(score, score.parts, 7)[3], false);
});

test('fully silent drum bars preserve every rest in both voices in PDF', async () => {
  const { drumRestGroups } = await import(
    moduleUrl(new URL('../packages/app/src/lib/drumNotation.ts', import.meta.url))
  );
  const score = {
    title: 'rests',
    bpm: 120,
    parts: ['Drums', 'Feet'],
    sync: {},
    instruments: { Drums: 'drums', Feet: 'drums' },
    drumVoices: { Drums: 'Feet' },
    notes: ['Drums', 'Feet'].flatMap((part) =>
      [1, 1, 2].map((beats, i) => ({ ...note(`${part}${i}`, part, 36, beats), rest: true })),
    ),
  };
  assert.deepEqual(
    drumRestGroups(model.scoreMeasures(score, 'Drums')[0], 4).map((rest) => rest.beats),
    [1, 1, 2],
  );
  const markup = scorePdfMarkup(score, 'Drums', false);
  assert.equal((markup.match(/aria-label="위 성부 쉼표"/g) || []).length, 3);
  assert.equal((markup.match(/aria-label="아래 성부 쉼표"/g) || []).length, 3);
  assert.doesNotMatch(markup, /두 성부 온마디 쉼표/);
  for (const beats of [1, 2, 3]) {
    const rest = { ...model.scoreMeasures(score, 'Drums')[0][0], beats, offset: 0 };
    assert.deepEqual(drumRestGroups([rest], beats), [{ offset: 0, beats, whole: false }]);
  }
});

test('deleting an earlier rest does not fragment a later rest or move the other voice and next bar', async () => {
  const { drumRestGroups } = await import(
    moduleUrl(new URL('../packages/app/src/lib/drumNotation.ts', import.meta.url))
  );
  const input = {
    title: 'rest deletion',
    bpm: 120,
    parts: ['Drums', 'Feet'],
    sync: {},
    instruments: { Drums: 'drums', Feet: 'drums' },
    drumVoices: { Drums: 'Feet' },
    notes: [
      note('hit', 'Drums', 42, 0.5),
      { ...note('remove', 'Drums', 38, 0.25), rest: true },
      note('snare', 'Drums', 38, 0.25),
      { ...note('keep', 'Drums', 38, 1), rest: true },
      note('end', 'Drums', 42, 2),
      { ...note('next', 'Drums', 38, 4), rest: true },
      note('foot', 'Feet', 36, 4),
    ],
  };
  const after = model.deleteScorePosition(input, 'remove');
  assert.deepEqual(
    after.notes.find((n) => n.id === 'keep'),
    input.notes.find((n) => n.id === 'keep'),
  );
  assert.deepEqual(
    after.notes.find((n) => n.id === 'foot'),
    input.notes.find((n) => n.id === 'foot'),
  );
  assert.equal(model.scoreMeasures(after, 'Drums')[1][0].note.id, 'next');
  assert.deepEqual(drumRestGroups(model.scoreMeasures(after, 'Drums')[0], 3.75), [
    { offset: 0.75, beats: 1, whole: false },
  ]);
  const dotted = {
    ...input,
    notes: input.notes.map((n) =>
      n.id === 'keep' ? { ...n, beats: 1.5 } : n.id === 'end' ? { ...n, beats: 1.5 } : n,
    ),
  };
  const dottedAfter = model.deleteScorePosition(dotted, 'remove');
  assert.deepEqual(drumRestGroups(model.scoreMeasures(dottedAfter, 'Drums')[0], 3.75), [
    { offset: 0.75, beats: 1.5, whole: false },
  ]);
  const markup = scorePdfMarkup(dottedAfter, 'Drums', false);
  assert.match(markup, /data-rest-beats="1.5"/);
  assert.match(markup, /aria-label="점쉼표 점"/);
});
