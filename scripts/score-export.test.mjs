import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const { prepareScoreExport, clampScoreExportRange, scoreExportFiles } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreExport.ts', import.meta.url))
);
const score = {
  title: 'Export',
  bpm: 100,
  parts: ['Keys', 'Left', 'Bass'],
  keyboardStaves: { Keys: 'Left' },
  instruments: { Keys: 'piano', Left: 'piano', Bass: 'bass' },
  sync: {},
  notes: ['Keys', 'Left', 'Bass'].flatMap((part) =>
    [0, 1, 2, 3].map((i) => ({
      id: `${part}/${i}`,
      part,
      pitch: 60 + i,
      beats: 4,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
    })),
  ),
  repeats: { 1: { start: true }, 2: { end: true, times: 2 } },
};
test('export range normalization accepts draft inputs and fixes limits/order at completion', () => {
  assert.deepEqual(clampScoreExportRange('', 999, 4), { from: 1, to: 4 });
  assert.deepEqual(clampScoreExportRange(4, 2, 4, 'from'), { from: 4, to: 4 });
  assert.deepEqual(clampScoreExportRange(4, 2, 4, 'to'), { from: 2, to: 2 });
  assert.deepEqual(clampScoreExportRange(-10, 2.4, 4), { from: 1, to: 2 });
});
test('selected logical parts include their staves and requested bars without modifying the project', () => {
  const options = { parts: ['Keys'], from: 2, to: 3, tab: true, ensemble: true };
  const before = JSON.stringify(score);
  const result = prepareScoreExport(score, options);
  assert.deepEqual(result.parts, ['Keys', 'Left']);
  for (const part of score.parts)
    assert.deepEqual(
      result.score.notes.filter((n) => n.part === part).map((n) => n.pitch),
      [61, 62],
    );
  assert.deepEqual(result.score.repeats, { 0: { start: true }, 1: { end: true, times: 2 } });
  assert.equal(JSON.stringify(score), before);
  assert.throws(() => prepareScoreExport(score, { ...options, parts: [] }));
});

test('multiple parts export individual files with a part suffix and their own staves', () => {
  const options = {
    parts: ['Keys', 'Bass'],
    from: 1,
    to: 4,
    tab: true,
    ensemble: false,
    name: 'Practice',
  };
  assert.deepEqual(scoreExportFiles(score, options, 'pdf'), [
    { parts: ['Keys', 'Left'], name: 'Practice_Keys.pdf' },
    { parts: ['Bass'], name: 'Practice_Bass.pdf' },
  ]);
  assert.deepEqual(
    scoreExportFiles(score, { ...options, parts: ['Keys'], name: 'Practice.midi' }, 'midi'),
    [{ parts: ['Keys', 'Left'], name: 'Practice.midi' }],
  );
});
