import { PDFDocument } from 'pdf-lib';

/** Return only the requested original pages, in document order. */
export async function selectScorePdfPages(
  bytes: ArrayBuffer,
  pages: number[],
): Promise<ArrayBuffer> {
  const original = await PDFDocument.load(bytes);
  const selected = [...new Set(pages)].sort((a, b) => a - b);
  if (
    !selected.length ||
    selected.some((page) => !Number.isInteger(page) || page < 1 || page > original.getPageCount())
  )
    throw new Error('추출할 PDF 페이지를 확인해주세요.');
  const subset = await PDFDocument.create();
  const copied = await subset.copyPages(
    original,
    selected.map((page) => page - 1),
  );
  copied.forEach((page) => subset.addPage(page));
  return new Uint8Array(await subset.save()).buffer;
}
