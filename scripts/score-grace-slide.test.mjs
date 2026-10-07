import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
Error.stackTraceLimit = 0;
import { moduleUrl } from './load-typescript.mjs';
const model = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const files = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const { scorePdfMarkup } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdf.web.tsx', import.meta.url))
);
function example() {
  const score = {
    title: '한 박 슬라이드',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [14, 10].map((fret, i) => ({
      id: `n${i}`,
      part: 'Guitar',
      pitch: 64 + fret,
      beats: 1,
      tones: [{ pitch: 64 + fret, string: 1, fret }],
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
    })),
  };
  return model.setScoreGraceSlide(score, 'n0', 12);
}
test('drum grace notes preserve kit heads, rhythm, exports and remove cleanly with the last hit', async () => {
  const input = {
    title: '드럼 꾸밈음',
    bpm: 120,
    parts: ['Drums'],
    sync: {},
    instruments: { Drums: 'drums' },
    notes: [42, 38].map((pitch, i) => ({
      id: `drum-${i}`,
      part: 'Drums',
      pitch,
      tones: [{ pitch }],
      beats: i ? 1 : 0.5,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
    })),
  };
  let score = model.setScoreGraceNote(input, 'drum-0', true);
  assert.deepEqual(
    score.notes.map((note) => note.beats),
    [0, 1],
  );
  const markup = scorePdfMarkup(score, 'Drums', false);
  assert.match(markup, /data-percussion-grace="true"/);
  const graceMarkup = markup.slice(markup.indexOf('data-grace-note="drum-0"'));
  assert.match(graceMarkup, /data-drum-head="x"/);
  assert.doesNotMatch(graceMarkup, /[♯♭♮]/);
  const xml = model.scoreToMusicXml(score);
  assert.match(xml, /<grace slash="yes"[^>]*\/>/);
  assert.match(xml, /<unpitched>/);
  const restored = (
    await files.parseScoreFile(
      await files.serializeScoreFile({
        score,
        referenceAudio: null,
        instrumentSample: null,
      }),
    )
  ).score;
  assert.equal(restored.notes[0].graceBeats, 0.5);
  const performance = model.scoreGracePerformance(restored, 'Drums');
  assert.ok(performance.notes[0].beats > 0);
  assert.equal(
    performance.notes.reduce((sum, note) => sum + note.beats, 0),
    1,
  );
  assert.deepEqual(
    performance.notes.map((note) => note.pitch),
    [42, 38],
  );
  score = model.setScoreDrum(score, 'drum-0', 38);
  score = model.setScoreDrum(score, 'drum-0', 42, true);
  assert.equal(score.notes[0].graceBeats, 0.5);
  assert.deepEqual(
    score.notes[0].tones.map((tone) => tone.pitch),
    [38],
  );
  score = model.setScoreDrum(score, 'drum-0', 38, true);
  assert.deepEqual(
    score.notes.map((note) => note.id),
    ['drum-1'],
  );
  assert.equal(model.setScoreGraceNote(restored, 'drum-0', false).notes[0].beats, 0.5);
});
test('independent grace notes exclude time, remain editable, restore and preserve articulations and connections', async () => {
  const input = example();
  input.notes[0] = {
    ...input.notes[0],
    pitch: 76,
    tones: [{ pitch: 76, string: 1, fret: 12 }],
    graceSlide: undefined,
  };
  input.notes[1] = { ...input.notes[1], pitch: 78, tones: [{ pitch: 78, string: 1, fret: 14 }] };
  let score = model.setScoreGraceNote(input, 'n0', true);
  score = model.setScoreConnection(score, ['n0'], 'slide');
  score = model.setScoreArticulation(score, ['n0'], 'staccato');
  score = model.setScoreToneArticulation(score, ['n0'], 1, 'dead');
  score = model.cleanScoreConnections(score);
  assert.deepEqual(
    score.notes.map((n) => n.beats),
    [0, 1],
  );
  assert.equal(score.notes[0].connection.type, 'slide');
  assert.equal(score.notes[0].staccato, true);
  assert.equal(score.notes[0].tones[0].dead, true);
  assert.deepEqual(
    model.scoreMeasures(score, 'Guitar')[0].map((f) => f.offset),
    [0, 0],
  );
  const restored = (
    await files.parseScoreFile(
      await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
    )
  ).score;
  assert.deepEqual(restored.notes, JSON.parse(JSON.stringify(score.notes)));
  const copied = model.copyScoreNotes(
    score,
    'Guitar',
    score.notes.map((n) => n.id),
  );
  assert.equal(
    model.readScoreClipboard(JSON.stringify({ type: 'moajam-score', version: 1, notes: copied }))[0]
      .graceBeats,
    1,
  );
  const markup = scorePdfMarkup(score, 'Guitar', true);
  assert.match(markup, /data-grace-note="n0"/);
  assert.match(markup, /data-tab-rhythm="n1"/);
  assert.equal(model.setScoreGraceNote(score, 'n0', false).notes[0].beats, 1);
  assert.equal(model.deleteScorePosition(score, 'n0').notes.length, 1);
  const performance = model.scoreGracePerformance(score, 'Guitar');
  assert.ok(performance.notes[0].beats > 0);
  assert.equal(
    performance.notes.reduce((n, x) => n + x.beats, 0),
    1,
  );
});
test('grace slide preserves one beat, following onset and frets through capo, file and PDF', async () => {
  const score = example();
  assert.deepEqual(
    score.notes.map((n) => n.beats),
    [1, 1],
  );
  assert.deepEqual(score.notes[0].graceSlide, { pitch: 76, string: 1, fret: 12 });
  const shifted = model.setScoreCapo(score, 'Guitar', 3);
  assert.equal(shifted.notes[0].pitch, 81);
  assert.deepEqual(shifted.notes[0].graceSlide, { pitch: 79, string: 1, fret: 12 });
  const restored = (
    await files.parseScoreFile(
      await files.serializeScoreFile({
        score: shifted,
        referenceAudio: null,
        instrumentSample: null,
      }),
    )
  ).score;
  assert.deepEqual(restored.notes, shifted.notes);
  const markup = scorePdfMarkup(score, 'Guitar', true);
  assert.match(markup, /data-grace-slide="tab"/);
  assert.match(markup, /data-grace-slide="staff"/);
  const xml = model.scoreToMusicXml(score);
  assert.match(xml, /<grace slash="yes" steal-time-following="20"\/>/);
  assert.match(xml, /<slide type="stop" number="6"\/>/);
});
test('slide validation and edits clear invalid decorations without changing rhythm', () => {
  const score = example();
  assert.throws(() => model.setScoreGraceSlide(score, 'n0', 14));
  assert.throws(() => model.setScoreGraceSlide(score, 'n0', 25));
  assert.equal(model.setScoreGraceSlide(score, 'n0', null).notes[0].graceSlide, undefined);
  assert.equal(model.setScoreFret(score, 'n0', 1, 12).notes[0].graceSlide, undefined);
  assert.equal(model.setScoreFret(score, 'n0', 2, 10).notes[0].graceSlide, undefined);
  let id = 0;
  const split = model.spliceScorePartTime(score, 'Guitar', 0.5, 0.5, 1, () => `split${id++}`);
  assert.equal(split.notes.filter((n) => n.graceSlide).length, 1);
  assert.deepEqual(split.notes[0].graceSlide, score.notes[0].graceSlide);
});
