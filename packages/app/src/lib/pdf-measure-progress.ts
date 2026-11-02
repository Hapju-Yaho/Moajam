export function pdfMeasureProgress(position: number, start: number, meter: number[], restCount = 1) {
  const length = meter[0] * 4 / meter[1];
  const ordinal = Math.min(restCount, Math.max(1, Math.floor((position - start) / length) + 1));
  return { ordinal, previewNext: ordinal === restCount };
}
