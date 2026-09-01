// runtime-e2e/license_tier_telemetry/test.mjs
//
// Real-stack proof of the SDK's license_tier telemetry field (#3619).
//
// Runs real node:http listeners on both sides of the telemetry path: a
// stand-in platform serving /health, and a stand-in checkpoint receiver
// capturing the outgoing POST. Bytes flow real -> real; nothing is mocked.
//
// TWO MODES:
//
//   # 1. MATRIX (default) — every tier value and every fail-open path.
//   node runtime-e2e/license_tier_telemetry/test.mjs
//
//   # 2. REAL PLATFORM — drive the SDK at a live agent and cross-check the
//   #    wire value against that agent's own /health.
//   AXONFLOW_E2E_PLATFORM_ENDPOINT=http://localhost:8080 \
//     node runtime-e2e/license_tier_telemetry/test.mjs
//
// Mode 2 proves the contract end to end: it reads the tier from the live
// platform independently, then asserts the SDK put THAT value on the wire
// verbatim. If the endpoint is unreachable it asserts the platform-DOWN
// contract instead — ping still delivered, field omitted.
//
// Mutation proof: in src/telemetry.ts, replace the body of applyHealthProbe
// with `payload.platform_version = probe.platformVersion;` and rerun — case 1
// fails with "license_tier absent from wire". Drop the `probe.licenseTier
// !== null` guard (assign `?? ''`) and case 2 fails with
// "license_tier present as \"\"".

import { createServer } from 'node:http';

import { sendTelemetryPingNow } from '../../dist/esm/telemetry.js';

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL: ${msg}`);
};
const pass = (msg) => console.log(`PASS: ${msg}`);

/** Stand-in platform: /health returns a fixed status and raw body. */
async function startStandInPlatform(status, body) {
  const server = createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Run one real ping against platformEndpoint; return the raw wire body. */
async function captureOnePing(platformEndpoint) {
  let captured = '';
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      captured = Buffer.concat(chunks).toString('utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ latest_version: null, alerts: [] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  process.env.AXONFLOW_CHECKPOINT_URL = `http://127.0.0.1:${server.address().port}/v1/ping`;
  delete process.env.AXONFLOW_TELEMETRY;

  try {
    await sendTelemetryPingNow({ mode: 'production', endpoint: platformEndpoint });
    return captured;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tierOnWire(body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { present: false, value: '' };
  }
  return Object.prototype.hasOwnProperty.call(payload, 'license_tier')
    ? { present: true, value: payload.license_tier }
    : { present: false, value: '' };
}

async function runAgainstRealPlatform(endpoint) {
  console.log(`=== REAL PLATFORM MODE: ${endpoint} ===\n`);

  let health;
  try {
    const resp = await fetch(`${endpoint}/health`);
    health = await resp.json();
  } catch (err) {
    // Platform DOWN — a first-class real-world case, not a harness error.
    console.log(`Platform unreachable at ${endpoint} (${err})\n  -> asserting the DOWN contract instead.\n`);
    const body = await captureOnePing(endpoint);
    if (!body) {
      fail('platform down: the ping was SUPPRESSED — telemetry must degrade, not stop');
      return;
    }
    console.log(`Telemetry wire body: ${body}\n`);
    const { present, value } = tierOnWire(body);
    if (present) {
      fail(`platform down: license_tier present as ${JSON.stringify(value)} — must be omitted when not learned`);
      return;
    }
    pass('platform down: ping still delivered, license_tier omitted (not defaulted)');
    return;
  }

  console.log(`Live /health tier: ${JSON.stringify(health.tier)}\n`);
  if (!health.tier) {
    // A platform predating the `tier` field is a LEGITIMATE contract case,
    // not a harness error: the SDK must degrade to omission. Assert that
    // instead of failing the run.
    console.log('Live platform reports no tier -> asserting the omission contract instead.\n');
    const body = await captureOnePing(endpoint);
    if (!body) {
      fail('the ping was SUPPRESSED — telemetry must degrade, not stop');
      return;
    }
    console.log(`Telemetry wire body: ${body}\n`);
    const { present, value } = tierOnWire(body);
    if (present) {
      fail(`license_tier present as ${JSON.stringify(value)} though the platform reported none`);
      return;
    }
    pass('platform reports no tier: ping delivered, license_tier omitted (not defaulted)');
    return;
  }

  const body = await captureOnePing(endpoint);
  if (!body) {
    fail('no telemetry ping captured against the live platform');
    return;
  }
  console.log(`Telemetry wire body: ${body}\n`);

  const { present, value } = tierOnWire(body);
  if (!present) {
    fail(`license_tier absent from wire; the live platform reported tier=${JSON.stringify(health.tier)}`);
  } else if (value !== health.tier) {
    fail(`license_tier on wire = ${JSON.stringify(value)}, live platform /health said ${JSON.stringify(health.tier)}`);
  } else {
    pass(`license_tier=${JSON.stringify(value)} on the wire matches the live platform's own /health verbatim`);
  }
}

async function runMatrix() {
  console.log('=== MATRIX MODE (stand-in platform) ===\n');

  console.log('-- 1. verbatim round-trip of every platform-emitted tier --');
  for (const tier of ['community', 'evaluation', 'Enterprise', 'Plus', 'starting']) {
    const platform = await startStandInPlatform(200, JSON.stringify({ status: 'healthy', version: '10.3.0', tier }));
    const body = await captureOnePing(platform.url);
    await platform.close();

    const { present, value } = tierOnWire(body);
    if (!body) fail(`tier=${tier}: no ping captured`);
    else if (!present) fail(`tier=${tier}: license_tier absent from wire; body: ${body}`);
    else if (value !== tier) fail(`tier=${tier}: license_tier on wire = ${JSON.stringify(value)}, want verbatim ${JSON.stringify(tier)}`);
    else pass(`tier=${JSON.stringify(tier).padEnd(13)} forwarded verbatim`);
  }

  console.log('\n-- 2. fail-open paths: field omitted, ping still delivered --');
  const dead = await startStandInPlatform(200, '{}');
  const deadUrl = dead.url;
  await dead.close();

  const cases = [
    { name: 'endpoint not configured', endpoint: '', close: async () => {} },
    { name: 'platform unreachable', endpoint: deadUrl, close: async () => {} },
  ];
  for (const spec of [
    { name: 'health returns 500', status: 500, body: JSON.stringify({ tier: 'Enterprise' }) },
    { name: 'health returns malformed JSON', status: 200, body: '{"tier":"Enterprise"' },
    { name: 'health has no tier key', status: 200, body: JSON.stringify({ status: 'healthy', version: '10.3.0' }) },
    { name: 'health has an empty tier', status: 200, body: JSON.stringify({ version: '10.3.0', tier: '' }) },
    { name: 'health has a non-string tier', status: 200, body: JSON.stringify({ version: '10.3.0', tier: 42 }) },
  ]) {
    const platform = await startStandInPlatform(spec.status, spec.body);
    cases.push({ name: spec.name, endpoint: platform.url, close: platform.close });
  }

  for (const tc of cases) {
    const body = await captureOnePing(tc.endpoint);
    await tc.close();

    if (!body) {
      fail(`${tc.name}: the ping was SUPPRESSED — telemetry must degrade, not stop`);
      continue;
    }
    if (!body.includes('"telemetry_type":"sdk"')) {
      fail(`${tc.name}: ping body is not a well-formed sdk ping: ${body}`);
      continue;
    }
    const { present, value } = tierOnWire(body);
    if (present) {
      fail(`${tc.name}: license_tier present as ${JSON.stringify(value)} — must be omitted when not learned`);
      continue;
    }
    pass(`${tc.name.padEnd(32)} ping delivered, license_tier omitted`);
  }

  console.log('\n-- 3. deployment_mode is independent of the tier --');
  for (const spec of [
    { name: 'with tier', body: JSON.stringify({ version: '10.3.0', tier: 'Enterprise' }) },
    { name: 'without tier', body: JSON.stringify({ version: '10.3.0' }) },
  ]) {
    const platform = await startStandInPlatform(200, spec.body);
    const body = await captureOnePing(platform.url);
    await platform.close();

    const mode = JSON.parse(body).deployment_mode;
    if (mode !== 'self_hosted') {
      fail(`${spec.name}: deployment_mode = ${JSON.stringify(mode)}, want "self_hosted" — the tier must not alter topology`);
      continue;
    }
    pass(`${spec.name.padEnd(14)} deployment_mode=${JSON.stringify(mode)} unchanged`);
  }
}

const realEndpoint = process.env.AXONFLOW_E2E_PLATFORM_ENDPOINT;
if (realEndpoint) {
  await runAgainstRealPlatform(realEndpoint);
} else {
  await runMatrix();
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nAll assertions passed.');
