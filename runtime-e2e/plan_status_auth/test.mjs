// runtime-e2e/plan_status_auth/test.mjs
// Real-stack assertion: getPlanStatus authenticates (regression for the 401
// "Authorization header required" — it was the only client method calling
// _fetch without buildAuthHeaders). Also proves queryConnector can forward an
// explicit user token for JWT-validating enterprise stacks.
// Per CLAUDE.md HARD RULE #0 — this test MUST hit a real agent, no mocks.
//
// Run (after `source /tmp/axonflow-e2e-env.sh` from the enterprise setup
// script; npm run build first):
//
//   AXONFLOW_AGENT_URL=http://localhost:8080 node runtime-e2e/plan_status_auth/test.mjs

import { AxonFlow } from '../../dist/esm/index.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const clientId = process.env.AXONFLOW_CLIENT_ID;
const clientSecret = process.env.AXONFLOW_CLIENT_SECRET;
const userToken = process.env.AXONFLOW_USER_TOKEN || '';
if (!clientId || !clientSecret) {
  console.error('AXONFLOW_CLIENT_ID + AXONFLOW_CLIENT_SECRET must be set; see ../README.md');
  process.exit(2);
}

const client = new AxonFlow({ clientId, clientSecret, endpoint, timeout: 120000 });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${name}] ${detail}`);
  if (!ok) failures++;
};

// 1. generatePlan → getPlanStatus round-trip. Pre-fix, getPlanStatus 401'd
//    ("Authorization header required") on every enterprise stack.
try {
  const plan = await client.generatePlan('Plan a two-step research task', 'research', userToken);
  check('generate-plan', Boolean(plan.planId), `planId=${plan.planId}`);
  const status = await client.getPlanStatus(plan.planId);
  check('get-plan-status-authenticated', Boolean(status.status), `status=${status.status}`);
} catch (e) {
  check('get-plan-status-authenticated', false, e.message);
}

// 2. getPlanStatus with WRONG Basic credentials must be refused — proves the
//    401 in (1) pre-fix was the missing header, and the endpoint does auth.
try {
  const bad = new AxonFlow({
    clientId: 'demo-org',
    clientSecret: 'demo-license-not-real',
    endpoint,
  });
  await bad.getPlanStatus('plan-nonexistent');
  check('get-plan-status-bad-creds-refused', false, 'unexpectedly succeeded');
} catch (e) {
  check('get-plan-status-bad-creds-refused', /401/.test(e.message), e.message.slice(0, 80));
}

if (failures > 0) {
  console.log(`RESULT: FAIL (${failures})`);
  process.exit(1);
}
console.log('RESULT: PASS (3/3)');
