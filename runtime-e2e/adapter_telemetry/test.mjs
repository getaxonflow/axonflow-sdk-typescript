// runtime-e2e/adapter_telemetry/test.mjs
//
// Real-wire proof of the adapter registry (axonflow-enterprise#3682).
//
// Asserts, through the SDK's real built output and over real sockets:
//
//   1. The SDK's OWN LangGraph adapter declares itself with no telemetry code
//      in the application.
//   2. An unregistered adapter does not appear.
//   3. A 65-byte name is dropped WHOLE, not truncated, and does not take the
//      valid name with it.
//   4. `edition` and `platform_deployment_mode` ride the SAME /health fetch.
//   5. A redirect is refused on BOTH legs, each proven with TWO listeners where
//      the second one records.
//
// WHY THERE ARE LISTENERS. The real checkpoint service is PRODUCTION — a
// runtime proof must not deliver test pings to it. Bytes still flow real ->
// real through the SDK's own `fetch`; the stand-ins are the two PEERS, exactly
// as in the neighbouring license_tier_telemetry driver. Imports come from
// `dist/`, so this exercises the BUILT artifact rather than the sources.
//
//   npm run build && node runtime-e2e/adapter_telemetry/test.mjs

import { createServer } from 'node:http';

import { AxonFlowLangGraphAdapter } from '../../dist/esm/adapters/langgraph.js';
import {
  _resetAdapterRegistryForTest,
  registerAdapter,
  registeredFeatures,
  sendTelemetryPingNow,
} from '../../dist/esm/telemetry.js';

let failures = 0;
const fail = m => {
  failures++;
  console.error(`FAIL: ${m}`);
};
const pass = m => console.log(`PASS: ${m}`);

async function listen(handler) {
  const seen = [];
  const server = createServer((req, res) => handler(req, res, seen));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    seen,
    close: () => new Promise(r => server.close(r)),
  };
}

function readBody(req, seen) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body });
      resolve();
    });
  });
}

const HEALTH = JSON.stringify({
  status: 'healthy',
  version: '10.4.0',
  tier: 'Enterprise',
  edition: 'enterprise',
  deployment_mode: 'in-vpc-enterprise',
});

const jsonHandler = (status, body) => (req, res, seen) =>
  void readBody(req, seen).then(() => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });

const redirectTo = target => (req, res, seen) =>
  void readBody(req, seen).then(() => {
    res.writeHead(302, { Location: target });
    res.end();
  });

/** Send one ping against the given platform and return the captured body. */
async function captureOnePing(platformEndpoint) {
  const checkpoint = await listen(jsonHandler(200, '{"latest_version":"0.0.0"}'));
  const previous = process.env.AXONFLOW_CHECKPOINT_URL;
  process.env.AXONFLOW_CHECKPOINT_URL = `${checkpoint.url}/v1/ping`;
  try {
    await sendTelemetryPingNow({ mode: 'production', endpoint: platformEndpoint });
    return checkpoint.seen.length ? JSON.parse(checkpoint.seen[0].body) : null;
  } finally {
    if (previous === undefined) delete process.env.AXONFLOW_CHECKPOINT_URL;
    else process.env.AXONFLOW_CHECKPOINT_URL = previous;
    await checkpoint.close();
  }
}

console.log('=== MATRIX MODE (stand-in platform + checkpoint) ===\n');

// --- 1. The shipped adapter declares itself. -------------------------------
console.log('-- 1. the shipped LangGraphAdapter declares itself, no caller telemetry code --');
_resetAdapterRegistryForTest();
{
  // The REAL public surface, not a registerAdapter call.
  new AxonFlowLangGraphAdapter({}, 'rt-e2e');
  const platform = await listen(jsonHandler(200, HEALTH));
  const body = await captureOnePing(platform.url);
  await platform.close();
  if (!body) fail('no ping captured');
  else if (!Array.isArray(body.features)) fail(`features absent: ${JSON.stringify(body)}`);
  else if (!body.features.includes('adapter:langgraph'))
    fail(`features = ${JSON.stringify(body.features)}, want adapter:langgraph`);
  else pass(`constructing the adapter alone put features = ${JSON.stringify(body.features)}`);
}

// --- 2. An unregistered adapter does not appear. ---------------------------
console.log('\n-- 2. an unregistered adapter does not appear --');
{
  const platform = await listen(jsonHandler(200, HEALTH));
  const body = await captureOnePing(platform.url);
  await platform.close();
  if (!body?.features) fail('features absent, so this case cannot distinguish absence');
  else if (body.features.includes('adapter:langchain'))
    fail(`features = ${JSON.stringify(body.features)} contains an unregistered adapter`);
  else if (!body.features.includes('adapter:langgraph'))
    fail('the registered adapter is gone too — the absence check above would be vacuous');
  else pass(`features = ${JSON.stringify(body.features)}: what was declared and nothing else`);
}

// --- 3. A 65-byte name is dropped WHOLE. -----------------------------------
console.log('\n-- 3. a 65-byte adapter name is dropped whole, not truncated --');
_resetAdapterRegistryForTest();
{
  registerAdapter('a'.repeat(65));
  registerAdapter('langchain');
  const platform = await listen(jsonHandler(200, HEALTH));
  const body = await captureOnePing(platform.url);
  await platform.close();
  const f = body?.features ?? [];
  if (f.includes(`adapter:${'a'.repeat(65)}`)) fail('the 65-byte name reached the wire in full');
  else if (f.includes(`adapter:${'a'.repeat(64)}`))
    fail('the 65-byte name was TRUNCATED to 64 and sent — a name nothing is running');
  else if (!f.includes('adapter:langchain'))
    fail(`features = ${JSON.stringify(f)} lost the VALID name too`);
  else pass(`features = ${JSON.stringify(f)}: over-cap dropped whole, valid one kept`);
}

// --- 4. edition + platform_deployment_mode ride the same /health. ----------
console.log('\n-- 4. edition and platform_deployment_mode ride the SAME /health fetch --');
{
  const platform = await listen(jsonHandler(200, HEALTH));
  const body = await captureOnePing(platform.url);
  const healthHits = platform.seen.length;
  await platform.close();
  if (body?.edition !== 'enterprise') fail(`edition = ${body?.edition}, want "enterprise"`);
  else if (body?.platform_deployment_mode !== 'in-vpc-enterprise')
    fail(`platform_deployment_mode = ${body?.platform_deployment_mode}`);
  else if (body?.deployment_mode === 'in-vpc-enterprise')
    fail("the platform's mode overwrote the SDK's OWN deployment_mode topology field");
  else if (healthHits !== 1)
    fail(`/health was fetched ${healthHits} times; every relayed dimension must ride ONE fetch`);
  else
    pass(
      `edition=${body.edition} platform_deployment_mode=${body.platform_deployment_mode} ` +
        `from ${healthHits} /health fetch; SDK topology still ${body.deployment_mode}`
    );
}

// --- 5. Redirects refused on BOTH legs, two listeners each. ----------------
console.log('\n-- 5. redirects are refused on both telemetry legs --');
{
  // TWO listeners. A single-listener fixture cannot express this defect: if the
  // redirector and the target are the same process, a followed redirect and a
  // refused one are indistinguishable.
  const target = await listen(
    jsonHandler(200, JSON.stringify({ version: '6.6.6-REDIRECT-TARGET', tier: 'Plus' }))
  );
  const redirector = await listen(redirectTo(`${target.url}/health`));
  const body = await captureOnePing(redirector.url);
  const redirectorHits = redirector.seen.length;
  const targetHits = target.seen.length;
  await redirector.close();
  await target.close();

  if (!body) fail('health redirect: no ping captured; it must still be DELIVERED, only unenriched');
  // POSITIVE CONTROL: the first listener was actually asked.
  else if (redirectorHits === 0)
    fail('health redirect: the redirector was never contacted, so nothing below proves anything');
  else if (targetHits !== 0)
    fail(`health redirect: the TARGET was fetched ${targetHits} times — the 30x was followed`);
  else if (body.platform_version === '6.6.6-REDIRECT-TARGET')
    fail("health redirect: the target's version reached the wire");
  else
    pass(
      `health 302 refused: redirector hit ${redirectorHits}, target hit 0, ping still delivered`
    );
}

{
  const target = await listen(jsonHandler(200, '{"latest_version":"0.0.0"}'));
  const redirector = await listen(redirectTo(`${target.url}/v1/ping`));
  const previous = process.env.AXONFLOW_CHECKPOINT_URL;
  process.env.AXONFLOW_CHECKPOINT_URL = `${redirector.url}/v1/ping`;
  let delivered;
  try {
    delivered = await sendTelemetryPingNow({ mode: 'production', endpoint: '' });
  } finally {
    if (previous === undefined) delete process.env.AXONFLOW_CHECKPOINT_URL;
    else process.env.AXONFLOW_CHECKPOINT_URL = previous;
  }
  const redirectorHits = redirector.seen.length;
  const targetHits = target.seen.length;
  const bodilessGets = target.seen.filter(r => r.method === 'GET' && r.body === '').length;
  await redirector.close();
  await target.close();

  if (redirectorHits === 0) fail('checkpoint redirect: the redirector was never contacted');
  else if (targetHits !== 0)
    fail(
      `checkpoint redirect: the TARGET received ${targetHits} request(s), ${bodilessGets} of them ` +
        'a bodyless GET. A followed redirect reports DELIVERY for a ping never sent, and the ' +
        '7-day stamp advances on it'
    );
  else if (delivered !== false)
    fail(`checkpoint redirect: sendTelemetryPingNow returned ${delivered}, want false`);
  else
    pass(
      `checkpoint 302 refused: redirector hit ${redirectorHits}, target hit 0, delivered=false — ` +
        'the stamp cannot advance on a ping that never landed'
    );
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nAll assertions passed.');
