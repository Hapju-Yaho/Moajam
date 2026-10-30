import { fileURLToPath } from 'node:url';
import { RecognitionError } from './pdf-recognition.client.js';
import type { ScoreStructure } from './recognition-validation.js';

type Line = { y: number; left: number; right: number };
export type BoundaryAlignment = {
  part: string;
  page: number;
  system: number;
  before: number[][];
  after: number[][];
};
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Evidence-based snapping: never synthesize evenly divided measure boundaries. */
export function snapSystemBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: number[][],
  lineCount: number,
  paired = false,
): number[][] | null {
  if (!bounds.length || bounds.some((b) => b.length !== 4 || b.some((n) => !Number.isFinite(n))))
    return null;
  const top = Math.max(0, Math.floor((Math.min(...bounds.map((b) => b[1])) * height) / 1000) - 12);
  const bottom = Math.min(
    height - 1,
    Math.ceil((Math.max(...bounds.map((b) => b[3])) * height) / 1000) + 12,
  );
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      pixels[i + 3] > 128 && pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 < 180
    );
  };
  const rows: Line[] = [];
  // A small break under a white notehead must not turn one staff line into two.
  const maxGap = Math.max(4, Math.round(width * 0.012));
  for (let y = top; y <= bottom; y++) {
    let left = -1,
      last = -1,
      hits = 0,
      best: Line | null = null;
    for (let x = 0; x <= width; x++) {
      if (x < width && dark(x, y)) {
        if (left < 0) left = x;
        last = x;
        hits++;
      }
      if (left >= 0 && (x - last > maxGap || x === width)) {
        if (
          last - left > width * 0.45 &&
          hits / (last - left + 1) > 0.78 &&
          (!best || last - left > best.right - best.left)
        )
          best = { y, left, right: last };
        left = -1;
        last = -1;
        hits = 0;
      }
    }
    if (best) {
      const previous = rows.at(-1);
      if (previous && y - previous.y <= 2) {
        if (best.right - best.left > previous.right - previous.left) rows[rows.length - 1] = best;
      } else rows.push(best);
    }
  }
  const groups: Line[][] = [];
  for (let i = 0; i <= rows.length - lineCount; i++) {
    const group = rows.slice(i, i + lineCount);
    const step = (group.at(-1)!.y - group[0].y) / (lineCount - 1);
    if (step < 3 || step > 36 || group.some((l, j) => Math.abs(l.y - group[0].y - j * step) > 1.5))
      continue;
    // Do not read four lines out of a five/six-line staff, or five out of six.
    if (
      (i > 0 && Math.abs(group[0].y - rows[i - 1].y - step) < 1.5) ||
      (rows[i + lineCount] && Math.abs(rows[i + lineCount].y - group.at(-1)!.y - step) < 1.5)
    )
      continue;
    if (
      Math.max(...group.map((l) => l.left)) - Math.min(...group.map((l) => l.left)) >
        width * 0.012 ||
      Math.max(...group.map((l) => l.right)) - Math.min(...group.map((l) => l.right)) >
        width * 0.012
    )
      continue;
    groups.push(group);
  }
  if (!groups.length) return null;
  const center = (top + bottom) / 2;
  groups.sort(
    (a, b) =>
      Math.abs((a[0].y + a.at(-1)!.y) / 2 - center) - Math.abs((b[0].y + b.at(-1)!.y) / 2 - center),
  );
  const chosen = paired ? groups.slice(0, 2) : groups.slice(0, 1);
  if (paired && chosen.length !== 2) return null;
  const lines = chosen.flat();
  const left = median(lines.map((l) => l.left)),
    right = median(lines.map((l) => l.right));
  if (right - left < width * 0.45) return null;
  const separators: number[] = [];
  for (let x = left + 3; x < right - 3; x++) {
    let valid = true;
    for (const group of chosen) {
      let hit = 0,
        wide = 0;
      for (let y = group[0].y; y <= group.at(-1)!.y; y++) {
        if (dark(x, y) || dark(x - 1, y) || dark(x + 1, y)) hit++;
        if (
          group.every((l) => Math.abs(l.y - y) > 1) &&
          dark(Math.max(0, x - 5), y) &&
          dark(Math.min(width - 1, x + 5), y)
        )
          wide++;
      }
      const span = group.at(-1)!.y - group[0].y + 1;
      if (hit / span < 0.94 || wide > 1) {
        valid = false;
        break;
      }
    }
    if (valid) separators.push(x);
  }
  const strokes: number[][] = [];
  for (const x of separators) {
    const previous = strokes.at(-1);
    if (previous && x - previous.at(-1)! <= 4) previous.push(x);
    else strokes.push([x]);
  }
  const centers = strokes.map(median);
  const edges = [left];
  // Snap only to observed thin vertical strokes near the proposed separators.
  for (let i = 1; i < bounds.length; i++) {
    const wanted = (((bounds[i - 1][2] + bounds[i][0]) / 2) * width) / 1000;
    const candidates = centers.filter((x) => x > edges.at(-1)! + 8 && x < right - 8);
    candidates.sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
    if (
      !candidates.length ||
      Math.abs(candidates[0] - wanted) >
        Math.min(width * 0.07, ((right - left) / bounds.length) * 0.4)
    )
      return null;
    edges.push(candidates[0]);
  }
  edges.push(right);
  // Excessive endpoint disagreement is likely the wrong staff/system.
  if (
    Math.abs(left - (bounds[0][0] * width) / 1000) > width * 0.1 ||
    Math.abs(right - (bounds.at(-1)![2] * width) / 1000) > width * 0.1
  )
    return null;
  return bounds.map((b, i) => [
    Math.round((edges[i] * 1000) / width),
    b[1],
    Math.round((edges[i + 1] * 1000) / width),
    b[3],
  ]);
}

export async function alignStructureToPdfLines(
  pdf: Buffer,
  structure: ScoreStructure,
  signal?: AbortSignal,
) {
  const corrected = structuredClone(structure),
    corrections: BoundaryAlignment[] = [];
  const { createCanvas } = await import('@napi-rs/canvas');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const moduleUrl = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    useWorkerFetch: false,
    useWasm: false,
    stopAtErrors: true,
    standardFontDataUrl: fileURLToPath(new URL('../../standard_fonts/', moduleUrl)).replaceAll(
      '\\',
      '/',
    ),
  });
  const cancel = () => {
    void task.destroy();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) throw new RecognitionError('CANCELED', 'Boundary alignment canceled');
    const doc = await task.promise;
    const pages = [...new Set(corrected.parts.flatMap((p) => p.measures.map((m) => m.page)))];
    for (const pageNumber of pages) {
      if (signal?.aborted) throw new RecognitionError('CANCELED', 'Boundary alignment canceled');
      const page = await doc.getPage(pageNumber),
        base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(3, 1800 / base.width, 2400 / base.height),
      });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)),
        ctx = canvas.getContext('2d');
      await page.render({
        canvas: canvas as unknown as Parameters<typeof page.render>[0]['canvas'],
        canvasContext: ctx as unknown as Parameters<typeof page.render>[0]['canvasContext'],
        viewport,
        background: '#ffffff',
      }).promise;
      const { data: pixels } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (const part of corrected.parts) {
        for (const system of new Set(
          part.measures.filter((m) => m.page === pageNumber).map((m) => m.system),
        )) {
          const rows = part.measures.filter((m) => m.page === pageNumber && m.system === system);
          if (rows.some((m, i) => i > 0 && m.bounds[0] < rows[i - 1].bounds[0])) continue;
          const count = part.instrument.startsWith('bass')
            ? 4
            : ['guitar', 'dropD', 'guitarHalfDown'].includes(part.instrument)
              ? 6
              : 5;
          const before = rows.map((m) => m.bounds);
          const after = snapSystemBounds(
            pixels,
            canvas.width,
            canvas.height,
            before,
            count,
            part.instrument === 'piano',
          );
          if (after && after.some((b, i) => b[0] !== before[i][0] || b[2] !== before[i][2])) {
            corrections.push({
              part: part.id,
              page: pageNumber,
              system,
              before: before.map((b) => [...b]),
              after,
            });
            rows.forEach((m, i) => {
              m.bounds = after[i];
            });
          }
        }
      }
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }
  } catch (error) {
    if (signal?.aborted) throw new RecognitionError('CANCELED', 'Boundary alignment canceled');
    // Unsupported/rotated/scanned layouts must remain manually reviewable.
    if (error instanceof RecognitionError) throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await task.destroy();
  }
  return { structure: corrected, corrections };
}
