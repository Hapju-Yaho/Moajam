import { setTimeout as sleep } from 'node:timers/promises';

export type AnalysisProgress = {
  status: 'starting' | 'queued' | 'in_progress' | 'checking' | 'delayed' | 'received';
  startedAt: number;
  checkedAt?: number;
};

/** Submit once. Only status GET requests are retried, never generation POSTs. */
export async function backgroundResponse(
  payload: object,
  options: {
    key: string;
    signal: AbortSignal;
    fetcher?: typeof fetch;
    onProgress?: (progress: AnalysisProgress) => void;
    pollIntervalMs?: number;
  },
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const root = 'https://api.openai.com/v1/responses';
  const headers = { Authorization: `Bearer ${options.key}`, 'Content-Type': 'application/json' };
  const startedAt = Date.now();
  let checkedAt: number | undefined;
  let id: string | undefined;
  let finished = false;
  const report = (status: AnalysisProgress['status']) =>
    options.onProgress?.({ status, startedAt, checkedAt });
  const request = (url: string, init: RequestInit, timeout: number) =>
    fetcher(url, {
      ...init,
      headers,
      redirect: 'error',
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]),
    });
  report('starting');
  try {
    let response = await request(
      root,
      { method: 'POST', body: JSON.stringify({ ...payload, background: true, store: false }) },
      90000,
    );
    while (response.ok) {
      let result: { id?: string; status?: string };
      try {
        result = await response.clone().json();
      } catch {
        return response;
      }
      if (!result || typeof result !== 'object') return response;
      if (typeof result.id === 'string' && /^resp_[a-zA-Z0-9_-]{1,200}$/.test(result.id))
        id = result.id;
      checkedAt = Date.now();
      if (result.status !== 'queued' && result.status !== 'in_progress') {
        finished = true;
        report('received');
        return response;
      }
      if (!id) throw new Error('Invalid background response ID');
      report(result.status);
      // Temporary network failures must not submit a second billable generation.
      for (;;) {
        await sleep(options.pollIntervalMs ?? 3000, undefined, { signal: options.signal });
        try {
          const next = await request(`${root}/${id}`, { method: 'GET' }, 20000);
          if (next.status === 429 || next.status >= 500) {
            report('delayed');
            continue;
          }
          response = next;
          break;
        } catch (error) {
          if (options.signal.aborted) throw error;
          report('delayed');
        }
      }
    }
    return response;
  } finally {
    if (id && !finished) {
      // Aborting our connection alone does not cancel a background generation.
      try {
        await fetcher(`${root}/${id}/cancel`, {
          method: 'POST',
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        /* Cancellation is best effort when the provider is unreachable. */
      }
    }
  }
}
