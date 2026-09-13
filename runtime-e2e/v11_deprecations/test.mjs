// Real-stack proof that the TypeScript SDK reports each deprecated route once per client.
//
// A v11 platform stamps every response from its deprecated legacy policy surface with
// X-AxonFlow-Removed-In and a successor Link (and, once the deprecating release is
// tagged, Deprecation). The client reports each stamped route ONCE per client through
// process.emitWarning(PlatformRouteDeprecationWarning), keyed by method and path without
// the query, and a client derived through asUser shares that memory. This drives the
// BUILT SDK (dist/) against a real agent and asserts:
//
//  0. MEASURE: the platform stamps both legacy static-policy reads on this stack. The
//     headers are read raw and printed, so the assertions below rest on stamps the
//     platform actually sent.
//  1. listStaticPolicies() twice on one client reports the route once, with the
//     platform's removal release and successor.
//  2. A client derived from it with asUser calls the same route and reports nothing new.
//  3. getEffectiveStaticPolicies(), a different stamped route, reports once, and a
//     second call reports nothing new.
//
// Warnings are read from the process's own 'warning' event, which is how the SDK
// delivers them; no function is replaced.
//
// The simulation routes this SDK also documents as deprecated are registered only on an
// Evaluation+ licence: the Go SDK's live v11_deprecations leg proves their stamps, and
// this SDK's unit tests its handling of them.
//
// Build the SDK first (`npm run compile`), then:
//
//   AXONFLOW_AGENT_URL=http://localhost:8080 \
//   AXONFLOW_CLIENT_ID=runtime-e2e AXONFLOW_CLIENT_SECRET=runtime-e2e-secret \
//   node runtime-e2e/v11_deprecations/test.mjs

import { AxonFlow } from '../../dist/esm/client.js';
import { PlatformRouteDeprecationWarning } from '../../dist/esm/errors.js';

const ENDPOINT = process.env.AXONFLOW_AGENT_URL ?? 'http://localhost:8080';
const CLIENT_ID = process.env.AXONFLOW_CLIENT_ID ?? 'runtime-e2e';
const CLIENT_SECRET = process.env.AXONFLOW_CLIENT_SECRET ?? 'runtime-e2e-secret';
const ROUTES = ['/api/v1/static-policies', '/api/v1/static-policies/effective'];
const SUCCESSOR = '/api/v1/typed-policies';
const failures = [];

function check(ok, description) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${description}`);
  if (!ok) failures.push(description);
}

const reported = [];
process.on('warning', w => {
  if (w instanceof PlatformRouteDeprecationWarning) reported.push(w);
});

/** Run `call`, let Node deliver any warning it emitted, and return what was reported. */
async function reportsOf(call) {
  const before = reported.length;
  await call();
  await new Promise(resolve => setImmediate(resolve));
  return reported.slice(before);
}

async function measure() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const stamps = {};
  for (const route of ROUTES) {
    const response = await fetch(`${ENDPOINT}${route}`, {
      headers: { Authorization: `Basic ${auth}`, 'X-Client-ID': CLIENT_ID },
    });
    stamps[route] = {
      status: response.status,
      'X-AxonFlow-Removed-In': response.headers.get('X-AxonFlow-Removed-In'),
      Link: response.headers.get('Link'),
      Deprecation: response.headers.get('Deprecation'),
    };
    console.log(`  ${route}: ${JSON.stringify(stamps[route])}`);
  }
  return stamps;
}

async function run(client) {
  console.log("== 0. the platform's stamps on this stack");
  const stamps = await measure();
  for (const route of ROUTES) {
    check(
      stamps[route]['X-AxonFlow-Removed-In'] === 'v11.1',
      `the platform stamps ${route} with X-AxonFlow-Removed-In: v11.1`
    );
    check(
      (stamps[route].Link ?? '').includes(SUCCESSOR),
      `the platform names ${SUCCESSOR} as the successor of ${route}`
    );
  }

  console.log('== 1. one client, the same route twice');
  const first = await reportsOf(async () => {
    await client.listStaticPolicies();
    await client.listStaticPolicies();
  });
  for (const w of first) console.log(`  reported: ${w.message}`);
  check(first.length === 1, 'two calls to one stamped route report it once');
  if (first.length > 0) {
    check(first[0].route === 'GET /api/v1/static-policies', 'the report names the route');
    check(first[0].removedIn === 'v11.1', "the report carries the platform's removal release");
    check(first[0].successor === SUCCESSOR, "the report carries the platform's successor");
  }

  console.log('== 2. a derived client, the same route');
  const derived = await reportsOf(() => client.asUser(undefined).listStaticPolicies());
  check(derived.length === 0, 'a client derived with asUser shares the memory and reports nothing new');

  console.log('== 3. a different stamped route, twice');
  const other = await reportsOf(async () => {
    await client.getEffectiveStaticPolicies();
    await client.getEffectiveStaticPolicies();
  });
  for (const w of other) console.log(`  reported: ${w.message}`);
  check(
    JSON.stringify(other.map(w => w.route)) === JSON.stringify(['GET /api/v1/static-policies/effective']),
    'a different stamped route is reported once, and its second call reports nothing new'
  );
}

console.log(`agent: ${ENDPOINT}`);
const client = new AxonFlow({ endpoint: ENDPOINT, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
try {
  await run(client);
} catch (e) {
  check(false, `the run raised ${e?.name}: ${e?.message}`);
}
if (failures.length > 0) {
  console.log(`\nFAIL: v11_deprecations (${failures.length} assertion(s))`);
  process.exit(1);
}
console.log('\nPASS: v11_deprecations');
