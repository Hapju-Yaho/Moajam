import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfMeasureProgress } from '../packages/app/src/lib/pdf-measure-progress.ts';
test('multi-bar rests only preview the following region during their final bar', () => {
  assert.deepEqual(pdfMeasureProgress(4, 4, [4, 4], 7), { ordinal: 1, previewNext: false });
  assert.deepEqual(pdfMeasureProgress(27.9, 4, [4, 4], 7), { ordinal: 6, previewNext: false });
  assert.deepEqual(pdfMeasureProgress(28, 4, [4, 4], 7), { ordinal: 7, previewNext: true });
});
test('progress uses meter and stays within the combined rest', () => {
  assert.deepEqual(pdfMeasureProgress(1.5, 0, [3, 8], 2), { ordinal: 2, previewNext: true });
  assert.deepEqual(pdfMeasureProgress(100, 0, [4, 4], 2), { ordinal: 2, previewNext: true });
  assert.deepEqual(pdfMeasureProgress(0, 0, [4, 4]), { ordinal: 1, previewNext: true });
});
