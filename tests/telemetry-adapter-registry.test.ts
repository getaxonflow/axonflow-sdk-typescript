/**
 * Adapter registry, relay caps, redirect refusal and heartbeat cadence.
 *
 * Covers axonflow-enterprise#3682 items 1-3 for the TypeScript SDK.
 *
 * WHAT THESE TESTS CAN AND CANNOT VARY. The redirect cases run REAL
 * `http.server` listeners on loopback and drive the SDK's own `fetch` calls, so
 * the redirect axis is varied end to end — which matters here more than in the
 * sibling SDKs, because `fetch` FOLLOWS redirects by default and this is a live
 * defect rather than a pin. Two listeners, and the second one records.
 *
 * They CANNOT vary two axes, stated rather than left implied:
 *
 *  - The RECEIVER. `NormalizeAdapterFeature` folds an unrecognised adapter name
 *    into `adapter:unknown` at READ time, in another repo, and is asserted
 *    there. That separation is the point of item 1: this SDK sends the caller's
 *    name and takes no view on the vocabulary.
 *  - The SCHEME. Both listeners are local `http`, so an `https -> http`
 *    downgrade is not exercised. Same blind spot that hid the Go
 *    per-user-credential leak in #3651; it does not apply to this path (the
 *    telemetry client sends no credential and no `Authorization` header) but a
 *    future change adding one would not be caught by these fixtures.
 */

import * as http from 'http';
import type { AddressInfo } from 'net';

import {
  _resetAdapterRegistryForTest,
  _restoreAdapterRegistryForTest,
  boundFeatures,
  probePlatformHealth,
  registerAdapter,
  registeredFeatures,
  sendTelemetryPingNow,
} from '../src/telemetry';
import {
  guardIntervalFor,
  HEARTBEAT_GUARD_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
} from '../src/heartbeat';

let saved: string[];

beforeEach(() => {
  saved = _resetAdapterRegistryForTest();
});

afterEach(() => {
  _restoreAdapterRegistryForTest(saved);
});

/**
 * A real loopback listener that records what it received.
 *
 * AWAITS the `listening` event, and that is not a nicety: `server.listen()` is
 * asynchronous, so `server.address()` returns null until it fires. Reading the
 * port synchronously threw `Cannot destructure property 'port' of null` in
 * every case that used it — a harness bug that failed loudly, which is the good
 * kind, but it would have been a silent `http://127.0.0.1:null` if the port had
 * been interpolated without destructuring.
 */
async function listen(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, seen: SeenRequest[]) => void
): Promise<{ url: string; seen: SeenRequest[]; close: () => Promise<void> }> {
  const seen: SeenRequest[] = [];
  const server = http.createServer((req, res) => handler(req, res, seen));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

interface SeenRequest {
  method: string;
  url: string;
  body: string;
}

function record(req: http.IncomingMessage, seen: SeenRequest[]): Promise<void> {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', body });
      resolve();
    });
  });
}

/**
 * The telemetry POSTs the listener saw.
 *
 * FILTERED, because these fixtures point the SDK's endpoint AND its checkpoint
 * at one listener, so it also records the `/health` probe and the API call.
 * Asserting on the raw length counted three and said nothing about delivery.
 */
function pings(seen: SeenRequest[]): SeenRequest[] {
  return seen.filter(r => r.method === 'POST' && r.url.endsWith('/v1/ping'));
}

// ---------------------------------------------------------------------------
// Item 1 — the registry
// ---------------------------------------------------------------------------

describe('the adapter registry', () => {
  it('starts empty, which is the positive control for every absence below', () => {
    // "features did not contain adapter:x" is only evidence if the mechanism
    // works at all and the registry really was empty to begin with.
    expect(registeredFeatures()).toEqual([]);
  });

  it('puts a registered adapter on the wire', () => {
    registerAdapter('langchain');
    expect(registeredFeatures()).toEqual(['adapter:langchain']);
  });

  it('does not invent one that was never registered', () => {
    registerAdapter('langchain');
    const features = registeredFeatures();
    expect(features).not.toContain('adapter:langgraph');
    // Without this the assertion above is satisfied by an empty array.
    expect(features).toEqual(['adapter:langchain']);
  });

  it.each([
    [['LangChain'], ['adapter:langchain'], 'lowercased, as the receiver folds before matching'],
    [['  langgraph\t\n'], ['adapter:langgraph'], 'trimmed; whitespace is not part of a name'],
    [
      ['litellm', 'LITELLM', ' litellm '],
      ['adapter:litellm'],
      'deduplicated: a per-request constructor declares itself once',
    ],
    [
      ['langgraph', 'langchain'],
      ['adapter:langchain', 'adapter:langgraph'],
      'sorted: registration order must not change the bytes',
    ],
    [
      ['some-framework-we-have-never-heard-of'],
      ['adapter:some-framework-we-have-never-heard-of'],
      'NOT filtered: an SDK-side allowlist would be a second vocabulary that drifts',
    ],
  ])('normalises %p -> %p (%s)', (names, expected) => {
    for (const n of names as string[]) registerAdapter(n);
    expect(registeredFeatures()).toEqual(expected);
  });

  it.each(['', '   ', '\t\n', undefined, null, 42, {}])(
    'refuses the unusable name %p rather than coercing or throwing',
    bad => {
      // A non-string must not be coerced: String(undefined) would put the
      // literal text "undefined" on the wire as an adapter name.
      expect(() => registerAdapter(bad as unknown as string)).not.toThrow();
      expect(registeredFeatures()).toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// Item 2 — the caps
// ---------------------------------------------------------------------------

describe('the relayed-value cap', () => {
  it('keeps 64 bytes and DROPS 65 whole', () => {
    registerAdapter('a'.repeat(64));
    expect(registeredFeatures()).toEqual([`adapter:${'a'.repeat(64)}`]);

    _restoreAdapterRegistryForTest([]);
    registerAdapter('a'.repeat(65));
    expect(registeredFeatures()).toEqual([]);
  });

  it('counts BYTES, not UTF-16 code units', () => {
    // '😀' is String.length 2, ONE code point, and FOUR bytes. 20 of them are
    // 40 code units, 20 code points and 80 bytes — under the cap by every
    // measure except the one that matters.
    const name = '😀'.repeat(20);
    expect(name.length).toBeLessThanOrEqual(64); // fixture premise: under by .length
    expect(Buffer.byteLength(name, 'utf8')).toBeGreaterThan(64); // over by BYTES
    registerAdapter(name);
    expect(registeredFeatures()).toEqual([]);
  });

  it('bounds the features array to 32 entries, deterministically', () => {
    for (let i = 0; i < 40; i++) registerAdapter(String(i).padStart(2, '0'));
    const features = registeredFeatures();
    expect(features).toHaveLength(32);
    // Sorted-then-truncated, so "which 32 survive" is a defined answer rather
    // than a Set-iteration accident.
    expect(features[0]).toBe('adapter:00');
    expect(features[31]).toBe('adapter:31');
  });

  it('drops an over-long features entry whole — tested on boundFeatures directly', () => {
    // registerAdapter already refuses a name over 64 bytes, so the longest
    // entry it can emit is 'adapter:'.length + 64 = 72 — well under 128. A test
    // driven through the registry could not express this defect and would read
    // as disproof of a bound never exercised.
    expect('adapter:'.length + 64).toBeLessThanOrEqual(128);

    const within = 'adapter:' + 'b'.repeat(128 - 'adapter:'.length);
    const over = within + 'b';
    expect(Buffer.byteLength(within, 'utf8')).toBe(128);
    expect(boundFeatures([within, over])).toEqual([within]);
  });
});

// ---------------------------------------------------------------------------
// Item 2 (relay) — edition and platform_deployment_mode
// ---------------------------------------------------------------------------

describe('the /health relay', () => {
  it('learns every dimension from ONE request', async () => {
    const health = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'healthy',
            version: '10.4.0',
            tier: 'Enterprise',
            edition: 'enterprise',
            deployment_mode: 'in-vpc-enterprise',
          })
        );
      });
    });
    try {
      const probe = await probePlatformHealth(health.url, 2000);
      expect(probe.platformVersion).toBe('10.4.0');
      expect(probe.licenseTier).toBe('Enterprise');
      expect(probe.edition).toBe('enterprise');
      expect(probe.platformDeploymentMode).toBe('in-vpc-enterprise');
      // The COUNT is what makes "no new request" a measurement.
      expect(health.seen).toHaveLength(1);
      expect(health.seen[0].url).toBe('/health');
    } finally {
      await health.close();
    }
  });

  it.each([
    ['{"version":"10.4.0"}', 'keys absent entirely'],
    ['{"version":"10.4.0","edition":"","deployment_mode":""}', 'explicit empty strings'],
    ['{"version":"10.4.0","edition":42,"deployment_mode":true}', 'non-string values'],
  ])('treats %s as NOT LEARNED (%s)', async body => {
    const health = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    });
    try {
      const probe = await probePlatformHealth(health.url, 2000);
      expect(probe.edition).toBeNull();
      expect(probe.platformDeploymentMode).toBeNull();
      // Positive control: the run happened and the INDEPENDENT field survived,
      // so the two nulls are real absences and not a dead probe. A badly-typed
      // new dimension must not regress an existing one.
      expect(probe.platformVersion).toBe('10.4.0');
    } finally {
      await health.close();
    }
  });

  it('drops an oversized value ALONE, keeping the rest', async () => {
    const health = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '10.4.0', edition: 'e'.repeat(65) }));
    });
    try {
      const probe = await probePlatformHealth(health.url, 2000);
      expect(probe.edition).toBeNull();
      expect(probe.platformVersion).toBe('10.4.0');
    } finally {
      await health.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 3 — redirects, with TWO listeners
// ---------------------------------------------------------------------------

describe('redirect refusal', () => {
  it('refuses a /health redirect and never reads the target', async () => {
    // TWO listeners, and the second one RECORDS. A single-listener fixture
    // cannot express this defect: if the redirector and the target are the same
    // process, a followed redirect and a refused one are indistinguishable. The
    // target serves a complete, plausible /health with DIFFERENT values so that
    // following would be visible in the result.
    const target = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: '6.6.6-REDIRECT-TARGET', tier: 'Plus' }));
      });
    });
    const redirector = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(302, { Location: `${target.url}/health` });
        res.end();
      });
    });
    try {
      const probe = await probePlatformHealth(redirector.url, 2000);

      // POSITIVE CONTROL: the first listener was actually asked. Without it,
      // "the target saw nothing" is equally true of a run that never happened.
      expect(redirector.seen).toHaveLength(1);
      expect(target.seen).toHaveLength(0);
      expect(probe.platformVersion).toBeNull();
      expect(probe.licenseTier).toBeNull();
    } finally {
      await redirector.close();
      await target.close();
    }
  });

  it('does not treat a checkpoint redirect as delivery', async () => {
    // The more dangerous half. `fetch` re-issues a redirected POST as a
    // BODYLESS GET, so a followed 302 yields a 200 for a request that carried
    // NOTHING, the SDK reads that as delivery, and the 7-day stamp advances on
    // a ping that was never sent.
    const target = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"latest_version":"0.0.0"}');
      });
    });
    const redirector = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(302, { Location: `${target.url}/v1/ping` });
        res.end();
      });
    });
    const previous = process.env.AXONFLOW_CHECKPOINT_URL;
    process.env.AXONFLOW_CHECKPOINT_URL = `${redirector.url}/v1/ping`;
    try {
      const delivered = await sendTelemetryPingNow({ mode: 'production', endpoint: '' });

      expect(redirector.seen).toHaveLength(1);
      expect(target.seen).toHaveLength(0);
      expect(delivered).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.AXONFLOW_CHECKPOINT_URL;
      else process.env.AXONFLOW_CHECKPOINT_URL = previous;
      await redirector.close();
      await target.close();
    }
  });

  it('puts the registered adapter on the wire through the real POST', async () => {
    registerAdapter('litellm');
    const checkpoint = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    const previous = process.env.AXONFLOW_CHECKPOINT_URL;
    process.env.AXONFLOW_CHECKPOINT_URL = `${checkpoint.url}/v1/ping`;
    try {
      const delivered = await sendTelemetryPingNow({ mode: 'production', endpoint: '' });
      expect(delivered).toBe(true);
      expect(pings(checkpoint.seen)).toHaveLength(1);
      const body = JSON.parse(checkpoint.seen[0].body);
      expect(body.features).toEqual(['adapter:litellm']);
      expect(body.telemetry_type).toBe('sdk');
    } finally {
      if (previous === undefined) delete process.env.AXONFLOW_CHECKPOINT_URL;
      else process.env.AXONFLOW_CHECKPOINT_URL = previous;
      await checkpoint.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Item 3 — cadence
// ---------------------------------------------------------------------------

describe('the failure backoff', () => {
  it('doubles and caps', () => {
    expect(guardIntervalFor(0)).toBe(HEARTBEAT_GUARD_INTERVAL_MS);
    expect(guardIntervalFor(1)).toBe(2 * HEARTBEAT_GUARD_INTERVAL_MS);
    expect(guardIntervalFor(2)).toBe(4 * HEARTBEAT_GUARD_INTERVAL_MS);
    expect(guardIntervalFor(7)).toBe(128 * HEARTBEAT_GUARD_INTERVAL_MS);
    expect(guardIntervalFor(8)).toBe(HEARTBEAT_INTERVAL_MS);
    // An unbounded counter must cap rather than produce an absurd interval.
    expect(guardIntervalFor(1e6)).toBe(HEARTBEAT_INTERVAL_MS);
  });
});

// ---------------------------------------------------------------------------
// heartbeatReady — a PUBLIC promise whose resolution point changed
// ---------------------------------------------------------------------------

describe('heartbeatReady', () => {
  // This promise used to be chained off a ping the CONSTRUCTOR performed. The
  // heartbeat now fires on the first outbound request, so it resolves later —
  // a visible behaviour change for every existing caller, and both outcomes are
  // pinned here rather than left to be discovered. The failure mode this
  // guards against is the promise silently resolving with nothing, which would
  // make `await client.heartbeatReady` look like it guaranteed delivery while
  // guaranteeing nothing at all.

  it('stays PENDING for a client that never sends a request', async () => {
    const { AxonFlow } = await import('../src/client');
    const client = new AxonFlow({ endpoint: 'http://127.0.0.1:1' });

    const settled = await Promise.race([
      client.heartbeatReady.then(() => 'resolved'),
      new Promise<string>(resolve => setTimeout(() => resolve('pending'), 250)),
    ]);

    expect(settled).toBe('pending');
  });

  it('resolves for a client derived with asUser(), on ITS first request', async () => {
    // `asUser()` derives with `Object.assign`, which copies the promise but
    // cannot copy a WeakMap entry keyed on the parent. Keyed on `this`, a
    // derived client's first request resolved NOTHING and this await hung
    // forever — while the README told callers to await exactly that. The
    // resolver is keyed on `heartbeatRoot`, which Object.assign does copy.
    const checkpoint = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    const previousUrl = process.env.AXONFLOW_CHECKPOINT_URL;
    const previousOff = process.env.AXONFLOW_TELEMETRY;
    process.env.AXONFLOW_CHECKPOINT_URL = `${checkpoint.url}/v1/ping`;
    process.env.AXONFLOW_TELEMETRY = '';

    const { AxonFlow } = await import('../src/client');
    const { replaceHeartbeatStateForTest, restoreHeartbeatStateForTest } = await import(
      '../src/heartbeat'
    );
    const previousState = replaceHeartbeatStateForTest(null);
    try {
      const parent = new AxonFlow({ endpoint: checkpoint.url });
      const derived = parent.asUser('alice-token');

      // Only the DERIVED client sends. The parent never does.
      await derived.listDecisions().catch(() => undefined);

      const settled = await Promise.race([
        derived.heartbeatReady.then(() => 'resolved'),
        new Promise<string>(resolve => setTimeout(() => resolve('pending'), 2000)),
      ]);
      expect(settled).toBe('resolved');
      expect(pings(checkpoint.seen)).toHaveLength(1);

      // The parent's promise is the SAME object, so it is settled too — one
      // heartbeat per process, one promise, whichever client sends first.
      const parentSettled = await Promise.race([
        parent.heartbeatReady.then(() => 'resolved'),
        new Promise<string>(resolve => setTimeout(() => resolve('pending'), 250)),
      ]);
      expect(parentSettled).toBe('resolved');
    } finally {
      restoreHeartbeatStateForTest(previousState);
      if (previousUrl === undefined) delete process.env.AXONFLOW_CHECKPOINT_URL;
      else process.env.AXONFLOW_CHECKPOINT_URL = previousUrl;
      if (previousOff === undefined) delete process.env.AXONFLOW_TELEMETRY;
      else process.env.AXONFLOW_TELEMETRY = previousOff;
      await checkpoint.close();
    }
  });

  it('resolves once the first request has run the gate', async () => {
    const checkpoint = await listen((req, res, seen) => {
      void record(req, seen).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    const previousUrl = process.env.AXONFLOW_CHECKPOINT_URL;
    const previousOff = process.env.AXONFLOW_TELEMETRY;
    process.env.AXONFLOW_CHECKPOINT_URL = `${checkpoint.url}/v1/ping`;
    process.env.AXONFLOW_TELEMETRY = '';

    const { AxonFlow } = await import('../src/client');
    const { replaceHeartbeatStateForTest, restoreHeartbeatStateForTest } = await import(
      '../src/heartbeat'
    );
    const previousState = replaceHeartbeatStateForTest(null);
    try {
      const client = new AxonFlow({ endpoint: checkpoint.url });
      // One request. It fails or 200s — irrelevant; the heartbeat rides the
      // ATTEMPT, so a caller whose first call fails is still a caller.
      await client.listDecisions().catch(() => undefined);

      const settled = await Promise.race([
        client.heartbeatReady.then(() => 'resolved'),
        new Promise<string>(resolve => setTimeout(() => resolve('pending'), 2000)),
      ]);
      expect(settled).toBe('resolved');

      // AND THE POST ACTUALLY LANDED BY THEN. Without this, replacing the
      // awaited `flushHeartbeat()` with a fire-and-forget `void flushHeartbeat()`
      // survives — the promise resolves, a caller does `process.exit(0)`, and
      // the ping is truncated. "Resolved" is not the contract; "resolved AFTER
      // delivery settled" is.
      expect(pings(checkpoint.seen)).toHaveLength(1);
    } finally {
      restoreHeartbeatStateForTest(previousState);
      if (previousUrl === undefined) delete process.env.AXONFLOW_CHECKPOINT_URL;
      else process.env.AXONFLOW_CHECKPOINT_URL = previousUrl;
      if (previousOff === undefined) delete process.env.AXONFLOW_TELEMETRY;
      else process.env.AXONFLOW_TELEMETRY = previousOff;
      await checkpoint.close();
    }
  });
});

describe('the shipped LangGraph adapter', () => {
  it('declares itself from its constructor', async () => {
    // MUTATION GATE: delete `registerAdapter('langgraph')` from
    // AxonFlowLangGraphAdapter's constructor and this fails.
    //
    // Before this test only the runtime-e2e driver caught that mutant, and the
    // e2e does not run in the unit job — so the registration could have been
    // removed and jest would have stayed green. A pin that only a
    // never-executed suite enforces is not a pin.
    const { AxonFlowLangGraphAdapter } = await import('../src/adapters/langgraph');

    // Positive control: the import ALONE registers nothing. Without this the
    // assertion below would also pass for import-time registration, which is a
    // different (over-reporting) contract.
    expect(registeredFeatures()).toEqual([]);

    new AxonFlowLangGraphAdapter({} as never, 'wf');
    expect(registeredFeatures()).toEqual(['adapter:langgraph']);
  });
});
