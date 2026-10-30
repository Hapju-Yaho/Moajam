import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backgroundResponse, type AnalysisProgress } from './background-response.js';

const reply = (status: string) => Response.json({ id: 'resp_test', status });

test('provider token exhaustion, filter, failure and cancellation have distinct messages', async () => {
  const { requestRecognition, RecognitionError } = await import('./pdf-recognition.client.js');
  const cases = [
    { status: 'incomplete', reason: 'max_output_tokens', code: 'INCOMPLETE_RESPONSE', message: /32,000.*출력 32,000.*추론 30,000/ },
    { status: 'incomplete', reason: 'content_filter', code: 'INCOMPLETE_RESPONSE', message: /콘텐츠 필터/ },
    { status: 'failed', code: 'OPENAI_RESPONSE_FAILED', message: /실패로 종료/ },
    { status: 'cancelled', code: 'OPENAI_CANCELLED', message: /취소/ },
  ];
  for (const sample of cases) {
    let calls = 0;
    await assert.rejects(requestRecognition({}, {
      key: 'fake', model: 'test-only', maxTokens: 32000,
      fetcher: async () => {
        calls++;
        return Response.json({ id: 'resp_test', status: sample.status,
          incomplete_details: { reason: sample.reason },
          usage: { input_tokens: 100, output_tokens: 32000, total_tokens: 32100, output_tokens_details: { reasoning_tokens: 30000 } }, output: [] });
      },
    }), error => {
      assert.ok(error instanceof RecognitionError);
      assert.equal(error.code, sample.code);
      assert.match(error.message, sample.message);
      assert.equal(error.diagnostics?.providerStatus, sample.status);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('background polls the same response and reports real provider states', async () => {
  const requests: string[] = [];
  const progress: AnalysisProgress[] = [];
  let gets = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    if (init?.method === 'POST') {
      const payload = JSON.parse(String(init.body));
      assert.equal(payload.background, true);
      assert.equal(payload.store, false);
      return reply('queued');
    }
    return reply(++gets === 1 ? 'in_progress' : 'completed');
  };
  const response = await backgroundResponse(
    {},
    {
      key: 'fake',
      signal: new AbortController().signal,
      fetcher,
      pollIntervalMs: 0,
      onProgress: (value) => progress.push(value),
    },
  );
  assert.equal((await response.json()).status, 'completed');
  assert.deepEqual(
    progress.map((value) => value.status),
    ['starting', 'queued', 'in_progress', 'received'],
  );
  assert.equal(requests.filter((value) => value.startsWith('POST')).length, 1);
  assert.ok(requests.slice(1).every((value) => value.endsWith('/resp_test')));
  assert.ok(progress.slice(1).every((value) => typeof value.checkedAt === 'number'));
});

test('temporary polling failures retry only GET and retain last successful check time', async () => {
  const progress: AnalysisProgress[] = [];
  let posts = 0,
    gets = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method === 'POST') {
      posts++;
      return reply('in_progress');
    }
    gets++;
    if (gets === 1) throw new TypeError('offline');
    if (gets === 2) return new Response('', { status: 503 });
    return reply('completed');
  };
  await backgroundResponse(
    {},
    {
      key: 'fake',
      signal: new AbortController().signal,
      fetcher,
      pollIntervalMs: 0,
      onProgress: (value) => progress.push(value),
    },
  );
  assert.equal(posts, 1);
  assert.equal(gets, 3);
  assert.equal(progress.filter((value) => value.status === 'delayed').length, 2);
  assert.equal(progress[1].checkedAt, progress[2].checkedAt);
});

test('abort cancels provider job with an independent live signal', async () => {
  const controller = new AbortController();
  let cancelled = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/cancel')) {
      cancelled++;
      assert.equal(init?.signal?.aborted, false);
      return reply('cancelled');
    }
    return reply('in_progress');
  };
  await assert.rejects(
    backgroundResponse(
      {},
      {
        key: 'fake',
        signal: controller.signal,
        fetcher,
        pollIntervalMs: 0,
        onProgress: (progress) => {
          if (progress.status === 'in_progress') controller.abort();
        },
      },
    ),
  );
  assert.equal(cancelled, 1);
});

test('generation submission failure is not retried', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw new TypeError('offline');
  };
  await assert.rejects(
    backgroundResponse(
      {},
      { key: 'fake', signal: new AbortController().signal, fetcher, pollIntervalMs: 0 },
    ),
  );
  assert.equal(calls, 1);
});
