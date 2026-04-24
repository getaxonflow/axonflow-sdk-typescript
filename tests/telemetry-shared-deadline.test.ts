/**
 * Regression test for axonflow-enterprise#1707: the /health probe and the
 * checkpoint POST must share a single TELEMETRY_TIMEOUT_MS deadline, so total
 * blocking time is bounded by that constant rather than stacking to ~5s.
 *
 * Prior to the fix, detectPlatformVersion had its own 2000ms AbortController
 * timeout and the POST had its own TELEMETRY_TIMEOUT_MS=3000ms AbortController
 * timeout, executed sequentially. On an unreachable endpoint the two stacked
 * to ~5s — defeating the "bounded at TELEMETRY_TIMEOUT_MS" claim in the
 * inline docstring.
 *
 * Key invariant: regardless of how long /health takes, the whole
 * sendTelemetryPing path (including the awaited inner async IIFE) must
 * complete within TELEMETRY_TIMEOUT_MS plus a small slack. We verify by
 * making /health a slow hang and letting the POST mock respond instantly;
 * total elapsed must stay near TELEMETRY_TIMEOUT_MS, not near
 * TELEMETRY_TIMEOUT_MS + 2000.
 */

import { sendTelemetryPing } from '../src/telemetry';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe('telemetry — shared deadline (regression for #1707)', () => {
  beforeEach(() => {
    // Strip environment-level opt-outs so sendTelemetryPing actually fires.
    // CI and developer shells commonly have DO_NOT_TRACK=1 or AXONFLOW_TELEMETRY=off
    // set; without this cleanup the fetches never happen and the test times out
    // without verifying the thing it claims to verify.
    delete process.env.DO_NOT_TRACK;
    delete process.env.AXONFLOW_TELEMETRY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  it('bounds total /health + POST duration at TELEMETRY_TIMEOUT_MS (~3s), not stacked (~5s)', async () => {
    // Simulate a slow /health that hangs past its cap, and a fast POST.
    // With the shared-deadline fix, /health is capped at HEALTH_BUDGET_CAP_MS
    // (1s) and the POST proceeds with the remaining ~2s. Total ~1s for the
    // /health cap + ~0s for the mocked instant POST = <= ~1.2s.
    //
    // Without the fix (stacked timeouts), /health would consume its own 2s
    // budget before the POST even starts, pushing total elapsed toward 2s+.
    //
    // Use a threshold that clearly discriminates the two behaviors:
    //   shared-deadline fix:   elapsed ~1000-1200ms
    //   stacked-timeout bug:   elapsed ~2000-2200ms

    const fetchMock = jest.fn().mockImplementation((url: string, init?: { signal?: AbortSignal; method?: string }) => {
      if (url.endsWith('/health')) {
        // Simulate a slow /health by returning a Promise that only rejects when
        // the caller's AbortController fires. This mirrors real fetch() semantics:
        // when the signal aborts, the pending fetch rejects with an AbortError.
        return new Promise((_resolve, reject) => {
          // Safety-net teardown: if the caller never aborts (e.g. under a
          // regression where the AbortController timeout is disabled), let the
          // Promise reject after a bounded window so the worker exits cleanly.
          const teardown = setTimeout(() => {
            reject(new Error('mock teardown — no abort fired'));
          }, 10_000);
          teardown.unref?.();
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              clearTimeout(teardown);
              const err = new Error('aborted') as Error & { name: string };
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }
      // POST: respond instantly with 200
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ latest_version: '99.99.99' }),
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const start = Date.now();
    sendTelemetryPing({
      mode: 'production',
      explicitMode: 'production',
      endpoint: 'http://127.0.0.1:1', // would be unreachable in reality; mock swaps the behavior
      telemetryEnabled: true,
      debug: false,
    });

    // sendTelemetryPing returns void synchronously (fire-and-forget wrapper).
    // To measure the total fetch-path duration we need to wait for the inner
    // IIFE to finish. Poll until fetch has been called for both /health and
    // the checkpoint POST, OR until an upper bound expires.
    const upperBound = 4500; // clearly > 3.5s shared-fix expected, < 5s stacked-bug worst-case
    const pollStart = Date.now();
    while (Date.now() - pollStart < upperBound) {
      const sawHealth = fetchMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].endsWith('/health'),
      );
      const sawPost = fetchMock.mock.calls.some(
        (c) =>
          typeof c[0] === 'string' &&
          c[1]?.method === 'POST',
      );
      if (sawHealth && sawPost) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const elapsed = Date.now() - start;

    // The shared-deadline fix caps /health at 1s then proceeds. Under the
    // stacked bug, /health consumed its own 2s timeout before proceeding,
    // which would push elapsed toward 2000ms+. 1500ms is the discriminator.
    expect(elapsed).toBeLessThan(1500);

    // And the POST must have actually fired (not skipped due to budget exhaustion).
    const sawPost = fetchMock.mock.calls.some(
      (c) => typeof c[0] === 'string' && c[1]?.method === 'POST',
    );
    expect(sawPost).toBe(true);
  });
});
