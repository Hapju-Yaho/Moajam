import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
Error.stackTraceLimit = 0;
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const guitar = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreGuitar.ts', import.meta.url))
);
const files = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const { scorePdfMarkup } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdf.web.tsx', import.meta.url))
);
const note = (id, patch = {}) => ({
  id,
  part: 'Guitar',
  pitch: 60,
  beats: 1,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  ...patch,
});
const base = () => ({
  title: '리듬 기타',
  bpm: 120,
  parts: ['Guitar'],
  sync: {},
  notes: [
    note('chord', {
      pitch: 50,
      tones: [
        { pitch: 50, string: 4, fret: 0 },
        { pitch: 57, string: 3, fret: 2 },
        { pitch: 62, string: 2, fret: 3 },
        { pitch: 66, string: 1, fret: 2 },
      ],
    }),
    note('a'),
    note('b'),
    note('c'),
  ],
});

test('H/P applies an entire contiguous phrase atomically and labels its direction once per staff', async () => {
  for (const [frets, label, types] of [
    [[0, 2, 4, 5], 'H', ['hammer', 'hammer', 'hammer']],
    [[7, 5, 3, 0], 'P', ['pull', 'pull', 'pull']],
    [[0, 4, 2, 5], 'H/P', ['hammer', 'pull', 'hammer']],
  ]) {
    const original = {
      ...base(),
      notes: frets.map((fret, i) =>
        note(`hp-${i}`, { pitch: 64 + fret, tones: [{ pitch: 64 + fret, string: 1, fret }] }),
      ),
    };
    const ids = original.notes.map((n) => n.id);
    const linked = model.setScoreHammerPull(original, ids);
    assert.deepEqual(
      linked.notes.slice(0, -1).map((n) => n.connection.type),
      types,
    );
    assert.equal(model.scoreHammerPullSelection(linked, ids).label, label);
    assert.equal(model.scoreHammerPullSelection(linked, ids).applied, true);
    assert.equal(model.scoreHammerPullGroups(linked.notes).length, 1);
    assert.deepEqual(
      model.setScoreHammerPull(linked, ids).notes.map((n) => n.connection),
      [undefined, undefined, undefined, undefined],
    );
    assert.deepEqual(
      model.setScoreConnection(linked, ids, null).notes.map((n) => n.connection),
      [undefined, undefined, undefined, undefined],
    );
    assert.ok(original.notes.every((n) => !n.connection));
    const markup = scorePdfMarkup(linked, 'Guitar', true);
    assert.equal(
      (markup.match(new RegExp(`data-hammer-pull-label="${label}"`, 'g')) ?? []).length,
      2,
    );
    const restored = (
      await files.parseScoreFile(
        await files.serializeScoreFile({
          score: linked,
          referenceAudio: null,
          instrumentSample: null,
        }),
      )
    ).score;
    assert.equal(model.scoreHammerPullSelection(restored, ids).applied, true);
    assert.match(model.scoreToMusicXml(linked), /hammer-on|pull-off/);
  }
});

test('H/P rejects equal pitches, string changes, chords, rests and gaps without partial edits', () => {
  const original = {
    ...base(),
    notes: [0, 2, 4].map((fret, i) =>
      note(`hp-${i}`, { pitch: 64 + fret, tones: [{ pitch: 64 + fret, string: 1, fret }] }),
    ),
  };
  for (const patch of [
    { pitch: 66, tones: [{ pitch: 66, string: 1, fret: 2 }] },
    { tones: [{ pitch: 68, string: 2, fret: 9 }] },
    { rest: true },
    {
      tones: [
        { pitch: 68, string: 1, fret: 4 },
        { pitch: 59, string: 2, fret: 0 },
      ],
    },
  ]) {
    const score = {
      ...original,
      notes: original.notes.map((n, i) => (i === 2 ? { ...n, ...patch } : n)),
    };
    assert.throws(() =>
      model.setScoreHammerPull(
        score,
        score.notes.map((n) => n.id),
      ),
    );
    assert.ok(score.notes.every((n) => !n.connection));
  }
  assert.throws(() => model.setScoreHammerPull(original, ['hp-0', 'hp-2']));
  assert.equal(model.setScoreHammerPull(original, ['hp-0']).notes[0].connection.type, 'hammer');
});
test('rhythm slashes replay prior chord across rests and honor new chord symbols and capo', () => {
  let score = model.setScoreRhythmSlash(base(), 'a', true);
  score = model.setScoreRhythmSlash(score, 'b', true);
  const performance = model.scoreExpressionPerformance(score, 'Guitar');
  assert.deepEqual(
    performance.notes[1].tones.map((t) => t.pitch),
    [50, 57, 62, 66],
  );
  assert.deepEqual(
    performance.notes[2].tones.map((t) => t.pitch),
    [50, 57, 62, 66],
  );
  assert.deepEqual(
    score.notes.map((n) => n.beats),
    [1, 1, 1, 1],
  );
  const changed = { ...score, beatChords: { Guitar: { 2: 'Am' } } };
  assert.deepEqual(
    model.scoreExpressionPerformance(changed, 'Guitar').notes[2].tones.map((t) => t.pitch),
    [57, 60, 64],
  );
  const capo = model.setScoreCapo(score, 'Guitar', 3);
  assert.deepEqual(
    model.scoreExpressionPerformance(capo, 'Guitar').notes[2].tones.map((t) => t.pitch),
    [53, 60, 65, 69],
  );
  const markup = scorePdfMarkup(score, 'Guitar', true);
  assert.equal((markup.match(/data-rhythm-slash="true"/g) || []).length, 4);
  assert.match(model.scoreToMusicXml(score), /<notehead>slash<\/notehead>/);
  assert.throws(() => model.setScoreRhythmSlash({ ...base(), notes: [note('a')] }, 'a', true));
});

test('bass rhythm slashes repeat single notes and use the root or named slash bass for chord symbols', () => {
  const score = {
    ...base(),
    instruments: { Guitar: 'bass' },
    notes: [
      note('root', { pitch: 33, tones: [{ pitch: 33, string: 3, fret: 0 }] }),
      note('repeat', { blank: true, rest: true }),
    ],
  };
  const repeated = model.setScoreRhythmSlash(score, 'repeat', true);
  assert.equal(repeated.notes[1].pitch, 33);
  assert.deepEqual(
    model.scorePerformance(repeated, 'Guitar').score.notes[1].tones.map((t) => t.pitch),
    [33],
  );
  assert.deepEqual(
    repeated.notes.map((n) => n.beats),
    [1, 1],
  );
  const standalone = model.setScoreRhythmSlash({ ...score, notes: [score.notes[0]] }, 'root', true);
  assert.equal(standalone.notes[0].pitch, 33);
  for (const [chord, pitch] of [
    ['C', 36],
    ['C/E', 40],
  ]) {
    const changed = { ...repeated, beatChords: { Guitar: { 1: chord } } };
    assert.deepEqual(
      model.scorePerformance(changed, 'Guitar').score.notes[1].tones.map((t) => t.pitch),
      [pitch],
    );
    assert.match(model.scoreToMusicXml(changed), /<notehead>slash<\/notehead>/);
  }
  assert.throws(() =>
    model.setScoreRhythmSlash({ ...score, notes: [score.notes[1]] }, 'repeat', true),
  );
});

test('cross-string glissando and four slide edges validate, render and survive saved files/clipboard', async () => {
  const score = {
    ...base(),
    notes: [
      note('a', { pitch: 64, tones: [{ pitch: 64, string: 1, fret: 0 }] }),
      note('b', { pitch: 66, tones: [{ pitch: 66, string: 2, fret: 7 }] }),
    ],
  };
  const cross = model.setScoreConnection(score, ['a', 'b'], 'glissando');
  assert.equal(model.cleanScoreConnections(cross).notes[0].connection.type, 'glissando');
  assert.equal(
    model.setScoreConnection(score, ['a', 'b'], 'slide').notes[0].connection.type,
    'slide',
  );
  assert.throws(() => model.setScoreConnection(score, ['a', 'b'], 'hammer'));
  assert.match(scorePdfMarkup(cross, 'Guitar', true), /시프트 슬라이드 사선/);
  for (const direction of ['up', 'down']) {
    const edged = model.setScoreSlideOut(
      model.setScoreSlideIn(score, ['a'], direction),
      ['a'],
      direction,
    );
    const restored = (
      await files.parseScoreFile(
        await files.serializeScoreFile({
          score: edged,
          referenceAudio: null,
          instrumentSample: null,
        }),
      )
    ).score;
    assert.equal(restored.notes[0].slideIn, direction);
    assert.equal(restored.notes[0].slideOut, direction);
    const clip = model.readScoreClipboard(
      JSON.stringify({
        type: 'moajam-score',
        version: 1,
        notes: model.copyScoreNotes(edged, 'Guitar', ['a']),
      }),
    );
    assert.equal(clip[0].slideIn, direction);
    assert.equal(clip[0].slideOut, direction);
    const xml = model.scoreToMusicXml(edged);
    assert.match(xml, direction === 'up' ? /<scoop / : /<plop /);
    assert.match(xml, direction === 'up' ? /<doit / : /<falloff /);
    const markup = scorePdfMarkup(edged, 'Guitar', true);
    assert.match(markup, /data-slide-edge="slideIn"/);
    assert.match(markup, /data-slide-edge="slideOut"/);
    assert.equal(model.setScoreSlideIn(edged, ['a'], direction).notes[0].slideIn, undefined);
  }
  const incoming = model.setScoreSlideIn(cross, ['b'], 'up');
  assert.equal(incoming.notes[0].connection, undefined);
});
test('tone changes preserve exact cursor beat, persist until clean, survive edits, file and PDF', async () => {
  let score = guitar.setGuitarToneChange(base(), 'Guitar', 0.5, 'overdrive');
  score = guitar.setGuitarToneChange(score, 'Guitar', 2, 'distortion');
  score = guitar.setGuitarToneChange(score, 'Guitar', 3, 'clean');
  assert.deepEqual(
    [0, 0.5, 1.5, 2.5, 3, 99].map((b) => guitar.guitarToneAt(score, 'Guitar', b)),
    ['clean', 'overdrive', 'overdrive', 'distortion', 'clean', 'clean'],
  );
  assert.equal(
    guitar.guitarToneAt(guitar.setGuitarToneChange(score, 'Guitar', 3, null), 'Guitar', 4),
    'distortion',
  );
  const restored = (
    await files.parseScoreFile(
      await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
    )
  ).score;
  assert.deepEqual(restored.guitarToneChanges, score.guitarToneChanges);
  const renamed = model.renameScorePart(score, 'Guitar', '기타');
  assert.deepEqual(renamed.guitarToneChanges['기타'], score.guitarToneChanges.Guitar);
  let id = 0;
  const inserted = model.editScoreMeasure(score, 0, 'insert', () => `new${id++}`);
  assert.deepEqual(inserted.guitarToneChanges.Guitar, {
    4.5: 'overdrive',
    6: 'distortion',
    7: 'clean',
  });
  assert.match(scorePdfMarkup(score, 'Guitar', true), /Over Drive/);
  assert.match(model.scoreToMusicXml(score), /<offset>24<\/offset>/);
  const copied = model.copyScoreNotes(score, 'Guitar', ['chord', 'a', 'b', 'c']);
  const clipboard = model.readScoreClipboard(
    JSON.stringify({ type: 'moajam-score', version: 1, notes: copied }),
  );
  const pasted = model.pasteScoreNotes(base(), 'Guitar', clipboard, 4, () => `paste${id++}`).score;
  assert.deepEqual(pasted.guitarToneChanges.Guitar, {
    4.5: 'overdrive',
    6: 'distortion',
    7: 'clean',
  });
  assert.throws(() => guitar.readGuitarToneChanges({ Guitar: { 0: 'unknown' } }, score.parts));
});
