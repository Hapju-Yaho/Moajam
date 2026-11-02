import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestPdfPartPosition } from '../packages/app/src/lib/pdf-part-position.ts';
const bar = (page, x, y, restCount = 1) => ({ page, bounds: [x, y, x + 100, y + 50], meter: [4, 4], restCount });
test('part switching stays near the current page, row and horizontal measure', () => {
  const measures = [bar(1, 0, 100), bar(2, 0, 200), bar(2, 100, 200), bar(3, 100, 100)];
  assert.equal(nearestPdfPartPosition(bar(2, 100, 150), measures), 8);
});
test('target timing includes multi-measure rests and handles missing parts', () => {
  assert.equal(nearestPdfPartPosition(bar(1, 100, 100), [bar(1, 0, 100, 5), bar(1, 100, 100)]), 20);
  assert.equal(nearestPdfPartPosition(undefined, []), 0);
});
