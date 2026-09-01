/**
 * license_tier telemetry field (#3619).
 *
 * Contract under test: the platform's licence tier rides along on the /health
 * response the SDK ALREADY fetches for platform_version, is forwarded to the
 * checkpoint receiver verbatim, and is OMITTED — never defaulted — whenever it
 * could not be learned.
 *
 * These tests drive REAL local HTTP servers on both sides rather than mocking
 * global.fetch, so the assertions are about bytes that actually crossed a
 * socket. A mocked transport would certify the payload object; only the wire
 * body proves what the receiver sees.
 */

import * as http from 'http';
import { AddressInfo } from 'net';

import { probePlatformHealth, sendTelemetryPing, sendTelemetryPingNow } from '../src/telemetry';

const originalEnv = { ...process.env };

/** A stand-in platform whose /health returns a fixed status and raw body. */
async function startStandInPlatform(
  status: number,
  body: string
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/**
 * A stand-in platform that additionally counts every GET /health it serves.
 * Separate from startStandInPlatform so the existing helper's signature and
 * every call site of it stay untouched.
 */
async function startCountingStandInPlatform(
  body: string
): Promise<{ url: string; healthRequests: () => number; close: () => Promise<void> }> {
  let served = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    served += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    healthRequests: () => served,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** A stand-in checkpoint receiver that records the raw POST body. */
async function startCheckpoint(): Promise<{
  url: string;
  body: () => string;
  close: () => Promise<void>;
}> {
  let captured = '';
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      captured = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ latest_version: '0.0.0' }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/v1/ping`,
    body: () => captured,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** Run one real ping against platformEndpoint and return the raw wire body. */
async function captureWire(platformEndpoint: string): Promise<string> {
  const checkpoint = await startCheckpoint();
  process.env.AXONFLOW_CHECKPOINT_URL = checkpoint.url;
  try {
    await sendTelemetryPingNow({ mode: 'production', endpoint: platformEndpoint });
    return checkpoint.body();
  } finally {
    await checkpoint.close();
  }
}

describe('license_tier on the telemetry wire (#3619)', () => {
  beforeEach(() => {
    delete process.env.DO_NOT_TRACK;
    delete process.env.AXONFLOW_TELEMETRY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Exactly the values platform/agent/run.go currentLicenseTier() can return,
  // plus the csaas "Plus" alias its health serializer emits.
  const platformEmittedTiers = ['community', 'evaluation', 'Enterprise', 'Plus', 'starting'];

  it.each(platformEmittedTiers)(
    'forwards the platform-reported tier %p to the wire verbatim',
    async tier => {
      const platform = await startStandInPlatform(
        200,
        JSON.stringify({ status: 'healthy', version: '10.3.0', tier })
      );
      try {
        const body = await captureWire(platform.url);
        // Assert on the literal JSON rather than a parsed object: a mutation
        // renaming the property would still round-trip through a decode.
        expect(body).toContain(`"license_tier":"${tier}"`);
      } finally {
        await platform.close();
      }
    }
  );

  describe('omits the field whenever the tier was not learned', () => {
    const cases: Array<[string, () => Promise<{ url: string; close: () => Promise<void> }>]> = [
      [
        'health returns 500',
        () => startStandInPlatform(500, JSON.stringify({ tier: 'Enterprise' })),
      ],
      ['health returns malformed JSON', () => startStandInPlatform(200, '{"tier":"Enterprise"')],
      [
        'health returns no tier key',
        () => startStandInPlatform(200, JSON.stringify({ status: 'healthy', version: '10.3.0' })),
      ],
      [
        'health returns an empty tier',
        () => startStandInPlatform(200, JSON.stringify({ version: '10.3.0', tier: '' })),
      ],
      [
        'health returns a non-string tier',
        () => startStandInPlatform(200, JSON.stringify({ version: '10.3.0', tier: 42 })),
      ],
      ['health returns a JSON array', () => startStandInPlatform(200, '[1,2,3]')],
    ];

    it.each(cases)('%s → ping still sent, field absent', async (_name, makePlatform) => {
      const platform = await makePlatform();
      try {
        const body = await captureWire(platform.url);
        // Telemetry degrades, it does not stop.
        expect(body).toContain('"telemetry_type":"sdk"');
        // Absent entirely — not present-and-empty.
        expect(body).not.toContain('license_tier');
      } finally {
        await platform.close();
      }
    });

    it('platform unreachable → ping still sent, field absent', async () => {
      // Bind then immediately release a port so nothing is listening on it.
      const dead = await startStandInPlatform(200, '{}');
      const url = dead.url;
      await dead.close();

      const body = await captureWire(url);
      expect(body).toContain('"telemetry_type":"sdk"');
      expect(body).not.toContain('license_tier');
    });

    it('endpoint not configured → ping still sent, field absent', async () => {
      const body = await captureWire('');
      expect(body).toContain('"telemetry_type":"sdk"');
      expect(body).not.toContain('license_tier');
    });
  });

  it('learns version and tier independently, so one absence never discards the other', async () => {
    const cases: Array<[string, { platformVersion: string | null; licenseTier: string | null }]> = [
      [
        JSON.stringify({ version: '10.3.0', tier: 'Enterprise' }),
        { platformVersion: '10.3.0', licenseTier: 'Enterprise' },
      ],
      // The pre-#3619 probe returned early when `version` was empty; had the
      // tier been read after that guard, this row would report no tier at all.
      [
        JSON.stringify({ tier: 'Enterprise' }),
        { platformVersion: null, licenseTier: 'Enterprise' },
      ],
      [JSON.stringify({ version: '10.3.0' }), { platformVersion: '10.3.0', licenseTier: null }],
      [JSON.stringify({ status: 'healthy' }), { platformVersion: null, licenseTier: null }],
    ];

    for (const [body, want] of cases) {
      const platform = await startStandInPlatform(200, body);
      try {
        await expect(probePlatformHealth(platform.url, 2000)).resolves.toEqual(want);
      } finally {
        await platform.close();
      }
    }
  });

  it('does not stack a second timeout onto the shared telemetry budget', async () => {
    // A platform that accepts the connection and never answers.
    const server = http.createServer(() => {
      /* deliberately never responds */
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const started = Date.now();
      await expect(probePlatformHealth(`http://127.0.0.1:${port}`, 400)).resolves.toEqual({
        platformVersion: null,
        licenseTier: null,
      });
      const elapsed = Date.now() - started;
      // Bounded by the supplied budget, not by an independent per-probe
      // timeout. Generous slack for CI scheduling, far below the ~2x a
      // stacked second timeout would produce.
      expect(elapsed).toBeLessThan(400 + 600);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  // This module has TWO ping paths that build the payload independently:
  // the awaitable sendTelemetryPingNow and the fire-and-forget
  // sendTelemetryPing. Every assertion above drives the first. This one
  // drives the SECOND, because a fix applied to only one copy of a
  // duplicated decision is exactly how the two paths come to disagree.
  it('carries the tier on the fire-and-forget path too, not only the awaitable one', async () => {
    const platform = await startStandInPlatform(
      200,
      JSON.stringify({ version: '10.3.0', tier: 'Enterprise' })
    );
    const checkpoint = await startCheckpoint();
    process.env.AXONFLOW_CHECKPOINT_URL = checkpoint.url;
    try {
      sendTelemetryPing({ mode: 'production', endpoint: platform.url });
      // Fire-and-forget: poll for the body rather than awaiting a promise
      // the API deliberately does not return.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && checkpoint.body() === '') {
        await new Promise(r => setTimeout(r, 25));
      }
      expect(checkpoint.body()).toContain('"license_tier":"Enterprise"');
    } finally {
      await checkpoint.close();
      await platform.close();
    }
  });

  // Regression: fetch() resolves on HEADERS, so clearing the abort timer there
  // left `resp.json()` with no bound and an AbortController that could never
  // fire again. A platform answering 200 + headers and then stalling mid-body
  // blocked the probe FOREVER — measured at 4003ms against a 400ms budget.
  // The timer is now cleared in `finally`.
  //
  // The sibling test above uses a server that never responds at all, so it
  // only covers the PRE-HEADERS half of the deadline and stayed green through
  // this defect. This one covers the post-headers half.
  it('bounds a body that stalls after the headers, not just a silent server', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"version":"10.3.0",'); // partial body, never ended
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const started = Date.now();
      // Raced against an explicit timer rather than awaited directly. Jest's
      // own timeout does not abort a test body, so on the defect this test
      // exists to catch the probe never settles, `finally` never runs, and
      // the listening server plus the pending fetch keep the worker alive —
      // the run HANGS instead of going red. Racing makes the failure finite.
      // The watchdog handle is held so it can be cleared below. Left armed,
      // the LOSER of the race keeps a 3s timer on the event loop after the
      // test has passed, which is what produced "Jest did not exit one second
      // after the test run has completed" on this file (and not on its
      // siblings). The open handle was this timer, not a socket.
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        probePlatformHealth(`http://127.0.0.1:${port}`, 400),
        new Promise(resolve => {
          watchdog = setTimeout(() => resolve('DID_NOT_SETTLE'), 3000);
        }),
      ]).finally(() => {
        if (watchdog !== undefined) clearTimeout(watchdog);
      });
      expect(outcome).toEqual({ platformVersion: null, licenseTier: null });
      expect(Date.now() - started).toBeLessThan(400 + 600);
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  // Only the timer's PLACEMENT was pinned (via the stall test above); nothing
  // pinned that it is cleared at all. Deleting the whole
  // `finally { clearTimeout(timeoutId) }` left every test green, while
  // leaving a pending timer after each successful ping — which holds the Node
  // event loop open and shows up as "telemetry delays process exit" in a CLI
  // or Lambda. This asserts the clear happens on the SUCCESS path.
  it('clears its abort timer on the success path, so no timer outlives the probe', async () => {
    const platform = await startStandInPlatform(
      200,
      JSON.stringify({ version: '10.3.0', tier: 'Enterprise' })
    );
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    try {
      const before = clearSpy.mock.calls.length;
      await expect(probePlatformHealth(platform.url, 2000)).resolves.toEqual({
        platformVersion: '10.3.0',
        licenseTier: 'Enterprise',
      });
      expect(clearSpy.mock.calls.length).toBeGreaterThan(before);
    } finally {
      clearSpy.mockRestore();
      await platform.close();
    }
  });

  // The headline contract of this change is "no new network call": the tier
  // rides along on the /health response ALREADY fetched for platform_version.
  // Nothing else in this suite counts requests, so a second probe added to
  // the telemetry path would leave every one of them green while doubling the
  // path's blocking budget and its failure surface. The Java SDK pins the same
  // contract in TelemetryLicenseTierTest.exactlyOneHealthRequestPerPing; this
  // is that test's TypeScript twin.
  it('issues exactly one /health request per ping, so the tier costs no new call', async () => {
    const platform = await startCountingStandInPlatform(
      JSON.stringify({ status: 'healthy', version: '10.3.0', tier: 'Enterprise' })
    );
    try {
      const wire = await captureWire(platform.url);
      // Anti-vacuity: a request count is only evidence if a complete ping
      // actually ran. Without this, a change that stopped probing altogether
      // would report zero requests and could read as a passing "no extra call".
      expect(wire).toContain('"license_tier":"Enterprise"');
      expect(platform.healthRequests()).toBe(1);
    } finally {
      await platform.close();
    }
  });

  it('leaves deployment_mode unchanged whether or not a tier was reported', async () => {
    for (const body of [
      JSON.stringify({ version: '10.3.0', tier: 'Enterprise' }),
      JSON.stringify({ version: '10.3.0' }),
    ]) {
      const platform = await startStandInPlatform(200, body);
      try {
        const wire = await captureWire(platform.url);
        // A 127.0.0.1 stand-in classifies as self_hosted topology; the
        // licence tier must not touch that dimension.
        expect(wire).toContain('"deployment_mode":"self_hosted"');
      } finally {
        await platform.close();
      }
    }
  });
});
