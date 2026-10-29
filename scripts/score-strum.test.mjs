import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const src = (p) => import(moduleUrl(new URL(p, import.meta.url)));
const m = await src('../packages/app/src/lib/score.ts');
const files = await src('../packages/app/src/lib/scoreFile.ts');
const { isBandScore } = await src('../apps/server/src/workspaces/score-policy.ts');
const { scorePdfMarkup } = await src('../packages/app/src/lib/scorePdf.web.tsx');
const base = () => ({
  title: 'Stroke',
  bpm: 120,
  parts: ['Guitar'],
  instruments: { Guitar: 'guitar' },
  sync: {},
  notes: [
    {
      id: 'chord',
      part: 'Guitar',
      beats: 4,
      pitch: 64,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
      tones: [
        { pitch: 64, string: 1, fret: 0 },
        { pitch: 59, string: 2, fret: 0 },
        { pitch: 55, string: 3, fret: 0 },
      ],
    },
  ],
});
test('stroke/accent require three guitar strings in the same note; rests and bass are excluded', () => {
  assert.equal(m.canSetScoreStrum(base(), ['chord']), true);
  for (const changes of [
    { tones: base().notes[0].tones.slice(0, 2) },
    { rest: true },
    { blank: true },
  ]) {
    const score = base();
    Object.assign(score.notes[0], changes);
    assert.equal(m.canSetScoreStrum(score, ['chord']), false);
    assert.throws(() => m.setScoreStrum(score, ['chord'], { strum: 'up' }));
  }
  const bass = base();
  bass.instruments.Guitar = 'bass';
  assert.equal(m.canSetScoreStrum(bass, ['chord']), false);
});
test('stroke directions replace each other, render on both staves, and survive file/clipboard', async () => {
  let score = m.setScoreStrum(base(), ['chord'], { strum: 'up' });
  score = m.setScoreStrum(score, ['chord'], { strum: 'down', accent: true });
  assert.ok(score.notes[0].tones.every((t) => t.strum === 'down'));
  assert.equal(score.notes[0].accent, true);
  assert.equal(isBandScore(score), true);
  assert.match(scorePdfMarkup(score, 'Guitar', true), /data-guitar-strum="down"/);
  const restored = files.parseScoreFile(
    await files.serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
  );
  assert.equal(restored.score.notes[0].tones[0].strum, 'down');
  const clip = m.readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: m.copyScoreNotes(score, 'Guitar', ['chord']),
    }),
  );
  assert.equal(clip[0].tones[0].strum, 'down');
  assert.match(m.scoreToMusicXml(score), /strum/);
  assert.ok(
    m
      .setScoreStrum(score, ['chord'], { strum: undefined })
      .notes[0].tones.every((t) => t.strum === undefined),
  );
});
