// runtime-e2e/x-axonflow-client/test.mjs
// Real-stack assertion: the SDK's compiled getAuthHeaders emits
// X-Axonflow-Client: sdk-typescript/<VERSION> on every governed request.
// Per CLAUDE.md HARD RULE #0 — this test MUST hit a real agent.

import { readFileSync } from 'node:fs';
import { AxonFlow, VERSION } from '../../dist/esm/index.js';

// THE BUILT CONSTANT AND THE MANIFEST ARE TWO SITES, AND THIS SUITE COULD NOT
// SEE THEM DISAGREE. Everything below asserts the wire against VERSION, which
// is `src/version.ts` compiled into the bundle - so on a release where
// package.json moved and `npm run stamp-version` was not run, BOTH sides of
// that comparison read the OLD number and this suite passed. That is not
// hypothetical: it is exactly what shipped in the 9.3.0 prep PR before its
// version-alignment check caught it, and a runtime suite that cannot see the
// defect its own subject is about is the gap this closes.
//
// package.json is the version npm publishes under; VERSION is the version the
// published package tells the platform it is. A caller installs the first and
// the platform reads the second, so a disagreement means /health recommends a
// version that, once installed, reports itself as a different one and takes a
// downgrade warning for ever.
const pkgVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;
if (VERSION !== pkgVersion) {
  console.error(
    `FAIL: the built VERSION constant is ${VERSION} and package.json is ${pkgVersion}. ` +
      'These are the version npm publishes under and the version the published package ' +
      'reports on the wire; run `npm run stamp-version`.',
  );
  process.exit(1);
}
console.log(`Version sites agree: package.json = src/version.ts = ${VERSION}`);

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const tenantId = process.env.AXONFLOW_TENANT_ID;
const tenantSecret = process.env.AXONFLOW_TENANT_SECRET;
if (!tenantId || !tenantSecret) {
  console.error('AXONFLOW_TENANT_ID + AXONFLOW_TENANT_SECRET must be set; register a community-saas tenant first');
  process.exit(2);
}

const expected = `sdk-typescript/${VERSION}`;
const client = new AxonFlow({ endpoint, clientId: tenantId, clientSecret: tenantSecret });

// Use the agent's scope-mismatch path to trigger an echo of X-Axonflow-Client
// in the agent's [AUTH] log line. Inject a known plugin-aud token via fetch wrap;
// the agent will reject with 401 + scope_mismatch and the agent log will reflect
// exactly what the SDK sent.
const PLUGIN_AUD_TOKEN = process.env.AXONFLOW_E2E_PLUGIN_TOKEN;
if (!PLUGIN_AUD_TOKEN) {
  console.error('AXONFLOW_E2E_PLUGIN_TOKEN must be set to a token with aud=axonflow.saas.plugin');
  console.error('See ../README.md for how to mint one.');
  process.exit(2);
}
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  init.headers = { ...(init.headers || {}), 'X-License-Token': PLUGIN_AUD_TOKEN };
  return origFetch(url, init);
};

console.log(`Asserting wire X-Axonflow-Client = ${expected}`);
try {
  await client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
  console.error('UNEXPECTED 200 — agent should have rejected scope_mismatch');
  process.exit(1);
} catch (err) {
  const msg = (err && err.message) || String(err);
  if (msg.includes(`client "${expected}"`)) {
    console.log(`PASS: agent reflected ${expected} in scope_mismatch response`);
    process.exit(0);
  }
  console.error(`FAIL: scope_mismatch response did not echo ${expected}; got: ${msg}`);
  process.exit(1);
}
