import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { recognitionDiagnostics, type RecognitionDiagnostics } from './recognition-diagnostics.js';
import { backgroundResponse, type AnalysisProgress } from './background-response.js';

export type RecognitionUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type RecognitionReply = {
  data: unknown;
  usage: RecognitionUsage;
  model: string;
  diagnostics?: RecognitionDiagnostics;
};
export class RecognitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public usage?: RecognitionUsage,
    public diagnostics?: RecognitionDiagnostics,
  ) {
    super(message);
  }
}
export async function requestRecognition(
  payload: object,
  options: {
    key: string;
    model: string;
    maxTokens: number;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
    onProgress?: (progress: AnalysisProgress) => void;
    pollIntervalMs?: number;
  },
): Promise<RecognitionReply> {
  const began = Date.now();
  let response: Response;
  try {
    response = await backgroundResponse(
      {
        ...payload,
        model: options.model,
        store: false,
        max_output_tokens: options.maxTokens,
      },
      {
        key: options.key,
        signal: options.signal ?? AbortSignal.timeout(1800000),
        fetcher: options.fetcher,
        onProgress: options.onProgress,
        pollIntervalMs: options.pollIntervalMs,
      },
    );
  } catch (error) {
    const e =
      error && typeof error === 'object'
        ? (error as { name?: unknown; cause?: { code?: unknown } })
        : {};
    const safeCode = (v: unknown) =>
      typeof v === 'string' && /^[A-Z_0-9-]{1,80}$/i.test(v) ? v : undefined;
    throw new RecognitionError(
      'OPENAI_CONNECTION',
      'OpenAI 연결이 끊겼거나 응답 시간이 초과됐어요. 자동으로 재시도하지 않습니다.',
      undefined,
      {
        phase: 'request',
        model: options.model,
        elapsedMs: Date.now() - began,
        networkCode: safeCode(e.cause?.code),
        errorType: safeCode(e.name),
        signalAborted: options.signal?.aborted ?? false,
      },
    );
  }
  const meta: RecognitionDiagnostics = {
    phase: 'response',
    model: options.model,
    httpStatus: response.status,
    requestId: response.headers.get('x-request-id')?.slice(0, 160),
    elapsedMs: Date.now() - began,
  };
  if (!response.ok) {
    // Do not relay provider error bodies: they may echo request content or credentials.
    throw new RecognitionError(
      `OPENAI_${response.status}`,
      response.status === 401
        ? '서버의 OpenAI API 키를 확인해주세요.'
        : response.status === 429
          ? 'OpenAI 잔액 또는 요청 한도를 확인해주세요. 자동으로 재시도하지 않습니다.'
          : `OpenAI 요청을 처리하지 못했어요. (${response.status}) 모델 설정과 PDF를 확인해주세요.`,
      undefined,
      meta,
    );
  }
  type Content = { type?: string; text?: string; refusal?: string };
  type ProviderResponse = {
    status?: string;
    id?: string;
    incomplete_details?: { reason?: string };
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      total_tokens?: unknown;
      output_tokens_details?: { reasoning_tokens?: unknown };
    };
    output?: { type?: string; content?: Content[] }[];
  };
  let result: ProviderResponse;
  try {
    result = await response.json();
  } catch {
    throw new RecognitionError('INVALID_RESPONSE', 'OpenAI 응답을 읽지 못했어요.', undefined, meta);
  }
  if (!result || typeof result !== 'object')
    throw new RecognitionError(
      'INVALID_RESPONSE',
      'OpenAI 응답 구조가 올바르지 않아요.',
      undefined,
      meta,
    );
  const token = (n: unknown) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
  const usage = {
    inputTokens: token(result.usage?.input_tokens),
    outputTokens: token(result.usage?.output_tokens),
    totalTokens: token(result.usage?.total_tokens),
  };
  const content = (Array.isArray(result.output) ? result.output : [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []));
  const text = content
    .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
  const diagnosticMeta: RecognitionDiagnostics = {
    ...meta,
    elapsedMs: Date.now() - began,
    responseId: typeof result.id === 'string' ? result.id.slice(0, 160) : undefined,
    providerStatus: typeof result.status === 'string' ? result.status.slice(0, 80) : undefined,
    incompleteReason:
      typeof result.incomplete_details?.reason === 'string'
        ? result.incomplete_details.reason.slice(0, 120)
        : undefined,
    ...usage,
    reasoningTokens:
      typeof result.usage?.output_tokens_details?.reasoning_tokens === 'number'
        ? token(result.usage.output_tokens_details.reasoning_tokens)
        : undefined,
    outputTextCharacters: text.length,
    jsonParsed: false,
  };
  const diagnostics = recognitionDiagnostics(undefined, text, diagnosticMeta, options.key);
  if (result.status !== 'completed')
    throw new RecognitionError(
      'INCOMPLETE_RESPONSE',
      '응답이 끝까지 생성되지 않았어요. PDF를 나누거나 출력 토큰 한도를 확인해주세요.',
      usage,
      diagnostics,
    );
  if (content.some((item) => item?.type === 'refusal'))
    throw new RecognitionError(
      'REFUSED',
      '이 PDF의 인식 요청을 처리할 수 없어요.',
      usage,
      recognitionDiagnostics(
        undefined,
        content.map((c) => c.refusal ?? '').join(''),
        diagnosticMeta,
        options.key,
      ),
    );
  if (!text || text.length > 2_000_000)
    throw new RecognitionError(
      'INVALID_RESPONSE',
      '인식 결과가 비어 있거나 너무 큽니다.',
      usage,
      diagnostics,
    );
  let data: unknown;
  try {
    data = JSON.parse(text, (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error();
      return value;
    });
  } catch {
    throw new RecognitionError(
      'INVALID_JSON',
      '인식 결과 JSON이 올바르지 않아요.',
      usage,
      diagnostics,
    );
  }
  return {
    data,
    usage,
    model: options.model,
    diagnostics: recognitionDiagnostics(
      data,
      text,
      { ...diagnosticMeta, jsonParsed: true },
      options.key,
      true,
    ),
  };
}

@Injectable()
export class PdfRecognitionClient {
  constructor(private readonly config: ConfigService) {}
  get enabled() {
    return !!this.config.get<string>('OPENAI_API_KEY')?.trim();
  }
  recognize(
    payload: object,
    signal?: AbortSignal,
    onProgress?: (progress: AnalysisProgress) => void,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!key)
      throw new RecognitionError('KEY_NOT_CONFIGURED', '서버에 OPENAI_API_KEY를 설정해주세요.');
    return requestRecognition(payload, {
      key,
      model: this.config.get<string>('OPENAI_SCORE_MODEL') || 'gpt-5-mini',
      maxTokens: this.config.get<number>('OPENAI_SCORE_MAX_OUTPUT_TOKENS') ?? 12000,
      signal,
      onProgress,
    });
  }
}
