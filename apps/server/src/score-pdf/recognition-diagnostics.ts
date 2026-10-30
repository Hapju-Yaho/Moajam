import type { ConvertedScore, PdfWarning } from './convert-recognition.js';

export type RecognitionDiagnostics = {
  boundaryAlignment?: import('./structure-line-alignment.js').BoundaryAlignment[];
  measureCrops?: import('./measure-crops.js').MeasureCropInfo[];
  stages?: RecognitionDiagnostics[];
  issues?: import('./recognition-validation.js').ReviewIssue[];
  outcome?: 'completed' | 'failed' | 'review';
  phase: 'request' | 'response' | 'conversion';
  model?: string;
  responseId?: string;
  requestId?: string;
  httpStatus?: number;
  providerStatus?: string;
  incompleteReason?: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  outputTextCharacters?: number;
  jsonParsed?: boolean;
  parts?: { id: string; name: string; measures: number; events: number }[];
  warnings?: { part: string; measure: number | null; code: string }[];
  outputExcerpt?: string;
  excerptTruncated?: boolean;
  networkCode?: string;
  errorType?: string;
  signalAborted?: boolean;
  outputJson?: string;
  conversion?: ReturnType<typeof scoreConversionDiagnostics>;
  conversionWarnings?: PdfWarning[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Only model output is inspected. Never pass request payloads or HTTP error bodies. */
export function recognitionDiagnostics(
  data: unknown,
  output: string,
  meta: Omit<RecognitionDiagnostics, 'parts' | 'warnings' | 'outputExcerpt' | 'excerptTruncated'>,
  secret?: string,
  includeFullOutput = false,
): RecognitionDiagnostics {
  const redact = (text: string) => {
    let safe = text;
    if (secret) safe = safe.replaceAll(secret, '[API_KEY_REDACTED]');
    return safe
      .replace(/\bsk-[a-z0-9_-]{8,}/gi, '[API_KEY_REDACTED]')
      .replace(/data:application\/pdf;base64,[a-z0-9+/=\s]+/gi, '[PDF_BASE64_REDACTED]')
      .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi, '[IMAGE_BASE64_REDACTED]')
      .replace(/[a-z0-9+/]{200,}={0,2}/gi, '[LONG_BASE64_REDACTED]');
  };
  const str = (v: unknown, length: number) =>
    typeof v === 'string' ? redact(v).slice(0, length) : '';
  const root = record(data);
  const parts = Array.isArray(root.parts)
    ? root.parts.slice(0, 16).map((value) => {
        const p = record(value),
          measures = Array.isArray(p.measures) ? p.measures : [];
        return {
          id: str(p.id, 40),
          name: str(p.name, 80),
          measures: measures.length,
          events: measures.reduce(
            (n, m) =>
              n + (Array.isArray(record(m).events) ? (record(m).events as unknown[]).length : 0),
            0,
          ),
        };
      })
    : [];
  const warnings = Array.isArray(root.warnings)
    ? root.warnings.slice(0, 32).map((value) => {
        const w = record(value);
        return {
          part: str(w.part, 80),
          measure: typeof w.measure === 'number' && Number.isFinite(w.measure) ? w.measure : null,
          code: str(w.code, 160),
        };
      })
    : [];
  // Strip echoed payload fields even if a model includes them in malformed output.
  let preview = output;
  if (data !== undefined)
    preview =
      JSON.stringify(
        data,
        (key, value) =>
          /^(file_data|image_url|api_key|authorization|pdf_base64)$/i.test(key)
            ? '[REDACTED]'
            : value,
        2,
      ) ?? '';
  preview = redact(preview);
  return {
    ...Object.fromEntries(
      Object.entries(meta).map(([key, value]) => [
        key,
        typeof value === 'string' ? redact(value).slice(0, 200) : value,
      ]),
    ),
    phase: meta.phase,
    parts,
    warnings,
    outputExcerpt: preview.slice(0, 20000),
    excerptTruncated: preview.length > 20000,
    ...(includeFullOutput && preview.length <= 2_000_000 ? { outputJson: preview } : {}),
  };
}

export function scoreConversionDiagnostics(score: ConvertedScore, sourceStart = 1) {
  const paired = new Set([
    ...Object.values(score.keyboardStaves),
    ...Object.values(score.drumVoices),
  ]);
  const measures = score.parts.flatMap((part) => {
    const notes = score.notes.filter((n) => n.part === part);
    let index = 0;
    return Object.entries(score.measureLengths[part] ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([bar, beats]) => {
        let ticks = 0,
          events = 0,
          rests = 0,
          tuplets = 0,
          ghosts = 0;
        while (index < notes.length && ticks < Math.round(beats * 48)) {
          const note = notes[index++];
          ticks += Math.round(note.beats * 48);
          if (note.rest) rests++;
          else events++;
          if (note.tuplet === 3) tuplets++;
          if (note.tones.some((t) => t.dead || t.ghost)) ghosts++;
        }
        return {
          part,
          measure: Number(bar) + 1,
          sourceMeasure: Number(bar) + sourceStart,
          expectedBeats: beats,
          actualBeats: ticks / 48,
          events,
          rests,
          tuplets,
          ghosts,
        };
      });
  });
  return {
    logicalParts: score.parts.filter((p) => !paired.has(p)).length,
    staves: score.parts.length,
    measures,
  };
}
