import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const { scorePlaybackBarIndex } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePlaybackDisplay.web.ts', import.meta.url))
);

test('compressed rest progress follows actual bar boundaries and only reaches final bar at its turn', () => {
  const starts = [0, 4, 8, 12, 16];
  assert.deepEqual(
    [0, 3.99, 4, 8, 15.99, 16, 19.99].map((beat) => scorePlaybackBarIndex(starts, beat)),
    [0, 0, 1, 2, 3, 4, 4],
  );
  assert.equal(scorePlaybackBarIndex([8, 11, 15], 10.99), 0);
  assert.equal(scorePlaybackBarIndex([8, 11, 15], 11), 1);
  assert.equal(scorePlaybackBarIndex([8, 11, 15], 15), 2);
});
