// runtime-e2e/x-axonflow-client/test.mjs
// Real-stack assertion: the SDK's compiled getAuthHeaders emits
// X-Axonflow-Client: sdk-typescript/<VERSION> on every governed request.
// Per CLAUDE.md HARD RULE #0 — this test MUST hit a real agent.

import { AxonFlow, VERSION } from '../../dist/esm/index.js';

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
