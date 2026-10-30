import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { moduleUrl } from './load-typescript.mjs';
const { selectScorePdfPages } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdfPages.ts', import.meta.url))
);

test('selected PDF pages keep original content order without unselected pages', async () => {
  const pdf = await PDFDocument.create();
  for (const width of [100, 200, 300, 400]) pdf.addPage([width, 500]);
  const bytes = (await pdf.save()).buffer;
  const subset = await PDFDocument.load(await selectScorePdfPages(bytes, [4, 2, 2]));
  assert.deepEqual(
    subset.getPages().map((page) => page.getWidth()),
    [200, 400],
  );
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4);
  for (const invalid of [[], [0], [5], [1.5]])
    await assert.rejects(selectScorePdfPages(bytes, invalid));
});
