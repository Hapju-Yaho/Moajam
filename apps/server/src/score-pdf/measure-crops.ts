import { fileURLToPath } from 'node:url';
import type { ScoreStructure } from './recognition-validation.js';
import { RecognitionError } from './pdf-recognition.client.js';

export type MeasureCrop = {
  measures?: { number: number; bounds: number[] }[];
  part: string;
  page: number;
  measure: number;
  bounds: number[];
  width: number;
  height: number;
  png: Buffer;
};
export type MeasureCropInfo = Omit<MeasureCrop, 'png'>;

/** Render confirmed measure close-ups for explicit reanalysis requests. */
export async function renderMeasureCrops(
  pdf: Buffer,
  structure: ScoreStructure,
  signal?: AbortSignal,
): Promise<MeasureCrop[]> {
  if (signal?.aborted) throw new RecognitionError('CANCELED', '분석이 취소됐어요.');
  const targets = structure.parts.flatMap((p) => p.measures.map((m) => ({ part: p.id, ...m })));
  if (!targets.length || targets.length > 128)
    throw new RecognitionError('CROP_LIMIT', '확대할 마디는 1~128개까지 선택해주세요.');
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
  let bytes = 0;
  try {
    if (signal?.aborted) throw new RecognitionError('CANCELED', '분석이 취소됐어요.');
    const document = await task.promise;
    const crops: MeasureCrop[] = [];
    for (const target of targets) {
      if (signal?.aborted) throw new RecognitionError('CANCELED', '분석이 취소됐어요.');
      const b = target.bounds;
      if (
        !Array.isArray(b) ||
        b.length !== 4 ||
        b.some((n) => !Number.isFinite(n) || n < 0 || n > 1000) ||
        b[0] >= b[2] ||
        b[1] >= b[3]
      )
        throw new RecognitionError(
          'CROP_BOUNDS',
          `${target.number}마디의 경계를 다시 확인해주세요.`,
        );
      const page = await document.getPage(target.page),
        base = page.getViewport({ scale: 1 });
      const cropWidth = ((b[2] - b[0]) / 1000) * base.width,
        cropHeight = ((b[3] - b[1]) / 1000) * base.height;
      // Bound both peak bitmap allocation and total per-request image pixels.
      const scale = Math.min(
        6,
        1600 / cropWidth,
        1000 / cropHeight,
        Math.sqrt(32_000_000 / targets.length / (cropWidth * cropHeight)),
      );
      const width = Math.max(1, Math.ceil(cropWidth * scale)),
        height = Math.max(1, Math.ceil(cropHeight * scale));
      const canvas = createCanvas(width, height),
        context = canvas.getContext('2d');
      const render = page.render({
        canvas: canvas as unknown as Parameters<typeof page.render>[0]['canvas'],
        canvasContext: context as unknown as Parameters<typeof page.render>[0]['canvasContext'],
        viewport: page.getViewport({ scale }),
        transform: [
          1,
          0,
          0,
          1,
          (-b[0] / 1000) * base.width * scale,
          (-b[1] / 1000) * base.height * scale,
        ],
        background: '#ffffff',
      });
      await render.promise;
      const png = canvas.toBuffer('image/png');
      bytes += png.length;
      if (bytes > 16 * 1024 * 1024)
        throw new RecognitionError(
          'CROP_LIMIT',
          '확대 이미지가 많습니다. 마디를 나누어 재분석해주세요.',
        );
      crops.push({
        part: target.part,
        page: target.page,
        measure: target.number,
        bounds: [...b],
        width,
        height,
        png,
      });
      canvas.width = 1;
      canvas.height = 1;
    }
    return crops;
  } catch (e) {
    if (signal?.aborted) throw new RecognitionError('CANCELED', '분석이 취소됐어요.');
    if (e instanceof RecognitionError) throw e;
    throw new RecognitionError(
      'CROP_RENDER',
      '마디 확대 이미지를 만들지 못했어요. PDF와 마디 경계를 확인해주세요.',
    );
  } finally {
    signal?.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
