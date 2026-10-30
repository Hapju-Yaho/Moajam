import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-typescript.mjs';
const { parseScorePdfPages } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdfPageSelection.ts', import.meta.url))
);

test('PDF page entry supports lists, ranges and one page in original order', () => {
  for (const [text, pages] of [
    ['1,3,4', [1, 3, 4]],
    ['1-3', [1, 2, 3]],
    ['3', [3]],
    ['4, 1-3,2', [1, 2, 3, 4]],
    [' 1 - 3 ', [1, 2, 3]],
  ]) {
    assert.deepEqual(parseScorePdfPages(text, 4), { pages, error: '' });
  }
});
test('invalid or out-of-document page selection cannot be submitted', () => {
  for (const text of ['', '0', '5', '3-1', '1-5', '1,', '1.5', '-1', 'a', '1--3']) {
    const result = parseScorePdfPages(text, 4);
    assert.deepEqual(result.pages, []);
    assert.ok(result.error);
  }
});
