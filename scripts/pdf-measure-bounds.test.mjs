import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeMeasureBounds, normalizeMeasureRows } from '../packages/app/src/lib/pdf-measure-bounds.ts';

const rows = [
  { page: 1, system: 1, bounds: [20, 100, 300, 200] },
  { page: 1, system: 1, bounds: [300, 90, 600, 210] },
  { page: 1, system: 2, bounds: [20, 400, 600, 500] },
];
test('row extents include all annotations without changing other systems', () => {
  const result = normalizeMeasureRows(rows);
  assert.deepEqual(result[0].bounds, [20, 90, 300, 210]);
  assert.deepEqual(result[1].bounds, [300, 90, 600, 210]);
  assert.deepEqual(result[2], rows[2]);
});
test('moving an edge resizes its neighbor and moves vertical bounds together', () => {
  const result = changeMeasureBounds(rows, 0, [20, 80, 320, 220]);
  assert.deepEqual(result[0].bounds, [20, 80, 320, 220]);
  assert.deepEqual(result[1].bounds, [320, 80, 600, 220]);
  assert.deepEqual(result[2], rows[2]);
  assert.equal(changeMeasureBounds(result, 1, [310, 80, 600, 220])[0].bounds[2], 310);
});
