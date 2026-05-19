// runtime-e2e/x-client-id/test.mjs
// Real-stack assertion: the SDK's compiled getAuthHeaders emits
// X-Client-ID: <effective_client_id> (v9) on every governed request.
// Per CLAUDE.md HARD RULE #0 — this test MUST hit a real agent.

import { AxonFlow } from '../../dist/esm/index.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const tenantId = process.env.AXONFLOW_TENANT_ID;
const tenantSecret = process.env.AXONFLOW_TENANT_SECRET;
if (!tenantId || !tenantSecret) {
  console.error('AXONFLOW_TENANT_ID + AXONFLOW_TENANT_SECRET must be set; see ../README.md');
  process.exit(2);
}

// Wrap fetch so we can capture the SDK's outbound X-Client-ID off the wire.
// Unlike X-Axonflow-Client, the agent doesn't echo X-Client-ID in error
// responses — we just verify what the SDK actually sent.
let captured = '';
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const headers = init.headers || {};
  captured = headers['X-Client-ID'] || headers['x-client-id'] || '';
  return origFetch(url, init);
};

const client = new AxonFlow({ endpoint, clientId: tenantId, clientSecret: tenantSecret });
console.log(`Asserting wire X-Client-ID = ${tenantId}`);

try {
  await client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
} catch {
  // outcome of the call doesn't matter; only the captured header
}

if (captured !== tenantId) {
  console.error(`FAIL: wire X-Client-ID = ${JSON.stringify(captured)}, want ${JSON.stringify(tenantId)}`);
  process.exit(1);
}
console.log(`PASS: wire X-Client-ID = ${JSON.stringify(captured)}`);
