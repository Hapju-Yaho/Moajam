import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const source = (path) => import(moduleUrl(new URL(path, import.meta.url)));
const model = await source('../packages/app/src/lib/score.ts');
const techniques = await source('../packages/app/src/lib/scoreGuitarTechniques.ts');
const files = await source('../packages/app/src/lib/scoreFile.ts');
const policy = await source('../apps/server/src/workspaces/score-policy.ts');
const audio = await source('../packages/app/src/lib/scoreAudio.web.ts');
const base = () => ({
  title: 'Guitar techniques',
  bpm: 120,
  parts: ['Guitar'],
  instruments: { Guitar: 'guitar' },
  sync: {},
  notes: [
    {
      id: 'a',
      part: 'Guitar',
      beats: 1,
      pitch: 69,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
      tones: [
        { pitch: 69, string: 1, fret: 5 },
        { pitch: 64, string: 2, fret: 5 },
      ],
    },
  ],
});
const apply = (score, patch) => model.setScoreGuitarTechnique(score, ['a'], 1, patch);

test('vibrato toggles chosen strings, survives project/clipboard and validates server data', async () => {
  for (const instrument of ['guitar', 'bass']) {
    const input = base();
    input.instruments.Guitar = instrument;
    if (instrument === 'bass')
      input.notes[0] = {
        ...input.notes[0],
        pitch: 48,
        tones: [
          { pitch: 48, string: 1, fret: 5 },
          { pitch: 43, string: 2, fret: 5 },
        ],
      };
    const score = model.setScoreVibrato(input, ['a'], 1, true);
    assert.equal(score.notes[0].tones[0].vibrato, true);
    assert.equal(score.notes[0].tones[1].vibrato, undefined);
    const restored = files.parseScoreFile(
      await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
    );
    assert.equal(restored.score.notes[0].tones[0].vibrato, true);
    const copied = model.readScoreClipboard(
      JSON.stringify({
        type: 'moajam-score',
        version: 1,
        notes: model.copyScoreNotes(score, 'Guitar', ['a']),
      }),
    );
    assert.equal(copied[0].tones[0].vibrato, true);
    assert.equal(policy.isBandScore(score), true);
    assert.equal(
      policy.isBandScore({
        ...score,
        notes: [{ ...score.notes[0], tones: [{ pitch: 48, vibrato: 'yes' }] }],
      }),
      false,
    );
    assert.equal(model.setScoreVibrato(score, ['a'], 1, false).notes[0].tones[0].vibrato, false);
    assert.ok(
      model.setScoreVibrato(input, ['a'], 1, true, true).notes[0].tones.every((t) => t.vibrato),
    );
  }
});

test('bass techniques support harmonic/mute and T/P, including ghost notes and file persistence', async () => {
  const original = base();
  original.parts = ['Bass'];
  original.instruments = { Bass: 'bass' };
  original.notes[0] = {
    ...original.notes[0],
    part: 'Bass',
    pitch: 48,
    tones: [
      { pitch: 48, string: 1, fret: 5 },
      { pitch: 43, string: 2, fret: 5 },
    ],
  };
  let score = model.setScoreGuitarTechnique(original, ['a'], 1, { harmonic: 'natural' });
  assert.equal(score.notes[0].tones[0].harmonic, 'natural');
  score = model.setScoreGuitarTechnique(score, ['a'], 1, { palmMute: true });
  assert.ok(score.notes[0].tones.every((t) => t.palmMute && !t.harmonic));
  assert.equal(model.canSetScoreNaturalHarmonics(original, ['a']), true);
  score = model.setScoreBassTechnique(score, ['a'], 1, 'thumb', true);
  assert.ok(score.notes[0].tones.every((t) => t.bassTechnique === 'thumb'));
  score = model.setScoreBassTechnique(score, ['a'], 1, 'pluck');
  assert.equal(score.notes[0].tones[0].bassTechnique, 'pluck');
  assert.equal(score.notes[0].tones[1].bassTechnique, 'thumb');
  const content = await files.serializeScoreFile({
    score,
    referenceAudio: null,
    instrumentSample: null,
  });
  assert.deepEqual(
    files.parseScoreFile(content).score.notes[0].tones,
    JSON.parse(JSON.stringify(score.notes[0].tones)),
  );
  assert.equal(policy.isBandScore(score), true);
  assert.equal(
    policy.isBandScore({
      ...score,
      notes: [{ ...score.notes[0], tones: [{ pitch: 48, bassTechnique: 'bad' }] }],
    }),
    false,
  );
  assert.ok(model.scoreToMusicXml(score).includes('bassTechnique'));
  const copied = model.copyScoreNotes(score, 'Bass', ['a']);
  const pasted = model.readScoreClipboard(
    JSON.stringify({ type: 'moajam-score', version: 1, notes: copied }),
  );
  assert.equal(pasted[0].tones[0].bassTechnique, 'pluck');
  assert.equal(pasted[0].tones[1].bassTechnique, 'thumb');
  const ghost = {
    ...score,
    notes: score.notes.map((n) => ({ ...n, tones: n.tones.map((t) => ({ ...t, dead: true })) })),
  };
  assert.ok(
    model
      .setScoreBassTechnique(ghost, ['a'], 1, 'thumb', true)
      .notes[0].tones.every((t) => t.dead && t.bassTechnique === 'thumb'),
  );
});

test('guitar techniques change only the chosen string and preserve written pitch and rhythm', () => {
  const score = base();
  const result = apply(score, { bend: { kind: 'release', amount: 2 } });
  assert.equal(result.notes[0].beats, 1);
  assert.equal(result.notes[0].tones[0].pitch, 69);
  assert.equal(result.notes[0].tones[0].bend.kind, 'release');
  assert.deepEqual(result.notes[0].tones[1], score.notes[0].tones[1]);
  assert.equal(score.notes[0].tones[0].bend, undefined);
  assert.equal(apply(result, { bend: undefined }).notes[0].tones[0].bend, undefined);
  assert.throws(() => apply(score, { bend: { kind: 'bad', amount: 2 } }));
  assert.throws(() => apply(model.setScoreFret(score, 'a', 1, 6), { harmonic: 'natural' }), /프렛/);
});

test('techniques roundtrip through project files and clipboard, with invalid values rejected', async () => {
  const score = apply(base(), {
    bend: { kind: 'prebend-release', amount: 3 },
  });
  const blob = await files.serializeScoreFile({
    score,
    referenceAudio: null,
    instrumentSample: null,
  });
  const restored = await files.parseScoreFile(blob);
  assert.deepEqual(restored.score.notes[0].tones[0], score.notes[0].tones[0]);
  const copied = model.copyScoreNotes(score, 'Guitar', ['a']);
  const clipboard = () => JSON.stringify({ type: 'moajam-score', version: 1, notes: copied });
  assert.deepEqual(model.readScoreClipboard(clipboard())[0].tones[0].bend, {
    kind: 'prebend-release',
    amount: 3,
  });
  assert.equal(policy.isBandScore(score), true);
  copied[0].tones[0].bend = { kind: 'bend', amount: 99 };
  assert.equal(model.readScoreClipboard(clipboard()), null);
  assert.equal(
    policy.isBandScore({
      ...score,
      notes: [{ ...score.notes[0], tones: [{ pitch: 69, bend: { kind: 'bad', amount: 2 } }] }],
    }),
    false,
  );
  assert.match(model.scoreToMusicXml(score), /moajam-guitar:/);
  assert.match(
    model.scoreToMusicXml(apply(base(), { harmonic: 'natural' })),
    /<harmonic><natural\/><\/harmonic>/,
  );
  assert.match(model.scoreToMusicXml(score), /<pre-bend\/>/);
});

test('harmonic pitches and all bend types produce their intended pitch trajectories', () => {
  assert.equal(techniques.guitarHarmonicShift({ harmonic: 'natural', fret: 5 }), 19);
  assert.equal(techniques.guitarHarmonicShift({ harmonic: 'natural', fret: 12 }), 0);
  assert.equal(techniques.guitarHarmonicShift({ harmonic: 'pinch' }), 24);
  for (const [kind, start, peak, end] of [
    ['bend', 0, 2, 2],
    ['release', 0, 2, 0],
    ['prebend', 2, 2, 2],
    ['prebend-release', 2, 0.875, 0],
  ]) {
    const tone = { bend: { kind, amount: 2 } };
    assert.equal(techniques.guitarBendOffset(tone, 0), start);
    assert.equal(techniques.guitarBendOffset(tone, 0.45), peak);
    assert.equal(techniques.guitarBendOffset(tone, 1), end);
  }
});

test('Web Audio schedules bends on frequency and palm mute shortens sound without changing beats', () => {
  const params = [],
    stops = [];
  const param = () => ({
    setValueAtTime: (v, t) => params.push([v, t]),
    linearRampToValueAtTime: (v, t) => params.push([v, t]),
    exponentialRampToValueAtTime() {},
  });
  const context = {
    createOscillator: () => ({
      frequency: param(),
      connect(next) {
        return next;
      },
      start() {},
      stop: (t) => stops.push(t),
      disconnect(next) {
        return next;
      },
    }),
    createGain: () => ({
      gain: param(),
      connect(next) {
        return next;
      },
      disconnect(next) {
        return next;
      },
    }),
  };
  const note = {
    ...base().notes[0],
    tones: [{ pitch: 69, bend: { kind: 'bend', amount: 2 }, palmMute: true }],
  };
  audio.scheduleScoreNote(context, {}, note, 1, 120);
  assert.ok(Math.abs(stops[0] - 1.16) < 1e-9);
  assert.ok(params.some(([value]) => Math.abs(value - 440 * 2 ** (2 / 12)) < 1e-6));
  assert.equal(note.beats, 1);
});

test('palm mute covers every note and string in the selected beat and leaves the next beat intact', () => {
  const score = base();
  const template = score.notes[0];
  score.notes = [0, 1, 2, 3].map((i) => ({ ...template, id: i === 0 ? 'a' : `n${i}`, beats: 0.5 }));
  const result = apply(score, { palmMute: true });
  assert.ok(result.notes[0].tones.every((t) => t.palmMute));
  assert.ok(result.notes[1].tones.every((t) => t.palmMute));
  assert.ok(result.notes[2].tones.every((t) => !t.palmMute));
  assert.ok(result.notes[3].tones.every((t) => !t.palmMute));
});

test('bend timing uses explicit beat positions and survives files', async () => {
  const b = {
    kind: 'release',
    amount: 2,
    bendStart: 1,
    bendEnd: 2,
    releaseStart: 3,
    releaseEnd: 4,
  };
  const tone = { bend: b };
  for (const [beat, offset] of [
    [0, 0],
    [1, 0],
    [1.5, 1],
    [2, 2],
    [3, 2],
    [3.5, 1],
    [4, 0],
  ])
    assert.equal(techniques.guitarBendOffset(tone, beat / 4, 4), offset);
  const score = base();
  score.notes[0].beats = 4;
  const updated = apply(score, { bend: b });
  const file = await files.serializeScoreFile({
    score: updated,
    referenceAudio: null,
    instrumentSample: null,
  });
  assert.deepEqual((await files.parseScoreFile(file)).score.notes[0].tones[0].bend, b);
  assert.equal(policy.isBandScore(updated), true);
  assert.throws(() => apply(score, { bend: { ...b, bendEnd: 0.5 } }));
});

test('harmonics and palm mute replace one another', () => {
  let score = apply(base(), { harmonic: 'natural' });
  score = apply(score, { palmMute: true });
  assert.ok(score.notes[0].tones.every((t) => t.palmMute && !t.harmonic));
  score = apply(score, { harmonic: 'pinch' });
  assert.equal(score.notes[0].tones[0].harmonic, 'pinch');
  assert.ok(score.notes[0].tones.every((t) => !t.palmMute));
  score = apply(score, { harmonic: 'natural' });
  assert.equal(score.notes[0].tones[0].harmonic, 'natural');
  assert.throws(() => apply(score, { bend: { kind: 'bend', amount: 2 } }));
});

test('bending rejects selected mute, ghost and harmonic techniques', () => {
  for (const fields of [
    { palmMute: true },
    { harmonic: 'natural' },
    { harmonic: 'pinch' },
    { dead: true },
    { ghost: true },
  ]) {
    const score = base();
    Object.assign(score.notes[0].tones[0], fields);
    assert.throws(() => apply(score, { bend: { kind: 'bend', amount: 2 } }));
  }
  assert.throws(() => apply(base(), { palmMute: true, bend: { kind: 'bend', amount: 2 } }));
});

test('shortening a note clamps clipped bend and release points to its new end', async () => {
  let score = base();
  score.notes[0].beats = 4;
  score = apply(score, {
    bend: {
      kind: 'release',
      amount: 2,
      bendStart: 0.5,
      bendEnd: 2,
      releaseStart: 3,
      releaseEnd: 4,
    },
  });
  const shortened = model.setScoreDuration(score, 'a', 1, () => 'blank');
  const bend = shortened.notes.find((n) => n.id === 'a').tones[0].bend;
  assert.deepEqual(bend, {
    kind: 'release',
    amount: 2,
    bendStart: 0.5,
    bendEnd: 1,
    releaseStart: 1,
    releaseEnd: 1,
  });
  assert.equal(techniques.validGuitarTechniques({ bend }), true);
  assert.equal(techniques.guitarBendOffset({ bend }, 1, 1), 0);
  const file = await files.serializeScoreFile({
    score: shortened,
    referenceAudio: null,
    instrumentSample: null,
  });
  assert.deepEqual(
    (await files.parseScoreFile(file)).score.notes.find((n) => n.id === 'a').tones[0].bend,
    bend,
  );
  assert.equal(score.notes[0].tones[0].bend.releaseEnd, 4);
  assert.deepEqual(
    model.setScoreDuration(shortened, 'a', 2, () => 'blank2').notes.find((n) => n.id === 'a')
      .tones[0].bend,
    bend,
  );
});

test('region ghost toggles every string and same-beat same-fret selection converts to natural harmonics', () => {
  const score = base();
  score.notes[0].beats = 0.5;
  score.notes.push({ ...score.notes[0], id: 'b', tones: [{ pitch: 60, string: 3, fret: 5 }] });
  const ids = ['a', 'b'];
  const dead = model.setScoreArticulation(score, ids, 'dead');
  assert.ok(dead.notes.every((n) => n.tones.every((t) => t.dead)));
  assert.ok(
    model.setScoreArticulation(dead, ids, 'dead').notes.every((n) => n.tones.every((t) => !t.dead)),
  );
  assert.equal(model.canSetScoreNaturalHarmonics(dead, ids), true);
  const natural = model.setScoreNaturalHarmonics(dead, ids, true);
  assert.ok(natural.notes.every((n) => n.tones.every((t) => t.harmonic === 'natural' && !t.dead)));
  const different = base();
  different.notes[0].beats = 0.5;
  different.notes.push({
    ...different.notes[0],
    id: 'b',
    tones: [{ pitch: 61, string: 3, fret: 6 }],
  });
  assert.equal(model.canSetScoreNaturalHarmonics(different, ids), false);
  assert.throws(() => model.setScoreNaturalHarmonics(different, ids, true));
  score.notes[0].beats = 1;
  assert.equal(model.canSetScoreNaturalHarmonics(score, ids), false);
});
