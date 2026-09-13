// Real-stack proof that the PEP capability handshake reaches the platform.
//
// The unit tests prove what the SDK puts on the wire. This driver proves the
// platform READ it. It drives the BUILT SDK (dist/) with the real global fetch,
// and after each governed call it reads the agent's own counter,
// axonflow_pep_handshake_total{outcome, plane} on /prometheus, which the agent
// moves once per inbound request on each plane that resolves the declaration.
// Every assertion is therefore something the agent recorded, not something the
// SDK reports about itself:
//
//   1. With a client-level declaration, decide, AuthZEN evaluate and
//      evaluateAll, mcpCheckInput, mcpCheckOutput and the gateway preCheck
//      each move exactly one series by one: outcome="accepted" on that call's
//      plane. The agent decoded the SDK's bytes and admitted the declaration.
//   2. fulfillRequest presents it on its engine round-trip.
//   3. A per-call declaration replaces the client's on that call. It declares
//      an approval-family capability, which a Community agent does not issue:
//      the agent drops it and counts over_advertised (an Enterprise agent keeps
//      it and counts accepted). The client's own declaration names no such
//      capability, so the outcome tells the two documents apart at the agent.
//   4. A client with no declaration counts outcome="absent": the SDK sends
//      nothing it was not given.
//
// Run (after `npm run build`):
//   export AXONFLOW_AGENT_URL=http://localhost:8080
//   export AXONFLOW_CLIENT_ID=runtime-e2e
//   export AXONFLOW_CLIENT_SECRET=runtime-e2e-secret
//   node runtime-e2e/pep_handshake_planes/test.mjs

import { AxonFlow } from '../../dist/esm/client.js';
import { AxonFlowError } from '../../dist/esm/errors.js';
import { PEPHandshake } from '../../dist/esm/pep-handshake.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const clientId = process.env.AXONFLOW_CLIENT_ID || 'runtime-e2e';
const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || 'runtime-e2e-secret';

const AUDIENCE = 'https://pep.example.test';
const DECLARED = new PEPHandshake({
  pepId: 'sdk-typescript-e2e',
  audience: AUDIENCE,
  capabilities: [{ type: 'field_redact', version: 1 }],
});
const OVERRIDE = new PEPHandshake({
  pepId: 'sdk-typescript-e2e-override',
  audience: AUDIENCE,
  capabilities: [
    { type: 'approval_challenge', version: 1 },
    { type: 'field_redact', version: 1 },
  ],
});

const QUERY = 'look up the weather';
const DECIDE = { stage: 'tool', query: QUERY, target: { type: 'tool', tool: 'search' } };
const EVALUATION = {
  subject: { type: 'gateway', id: 'sdk-typescript-e2e' },
  action: { name: 'llm.completion' },
  resource: { type: 'llm', id: 'llm' },
  context: { args: { query: QUERY } },
};
const BULK = {
  subject: { type: 'gateway', id: 'sdk-typescript-e2e' },
  action: { name: 'llm.completion' },
  context: { args: { query: QUERY } },
  evaluations: [{ resource: { type: 'llm', id: 'llm' } }],
};
// A decision carrying the request-phase redaction obligation, so fulfillRequest
// makes its engine round-trip. It is the caller's input, as a decision from
// decide would be; the round-trip itself goes to the real agent.
const REDACTING = {
  verdict: 'allow',
  decision_id: 'sdk-typescript-e2e',
  stage: 'tool',
  evaluated_policies: [],
  obligations: [
    {
      type: 'redact_pii',
      fulfillment: {
        endpoint: '/api/v1/mcp/check-input',
        method: 'POST',
        phase: 'request',
        content_types: ['text/plain'],
      },
    },
  ],
};

const SERIES = /^axonflow_pep_handshake_total\{([^}]*)\}\s+(\S+)$/;
const LABEL = /(\w+)="([^"]*)"/g;

const failures = [];
function check(ok, description) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${description}`);
  if (!ok) failures.push(description);
}

/** The agent's handshake counter, keyed "outcome@plane". */
async function scrape() {
  const response = await fetch(`${endpoint}/prometheus`);
  if (!response.ok) throw new Error(`/prometheus answered ${response.status}`);
  const counts = new Map();
  for (const line of (await response.text()).split('\n')) {
    const match = SERIES.exec(line);
    if (!match) continue;
    const labels = Object.fromEntries([...match[1].matchAll(LABEL)].map((m) => [m[1], m[2]]));
    counts.set(`${labels.outcome}@${labels.plane}`, Number(match[2]));
  }
  return counts;
}

function moved(before, after) {
  const out = {};
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const delta = (after.get(key) ?? 0) - (before.get(key) ?? 0);
    if (delta !== 0) out[key] = delta;
  }
  return out;
}

function render(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([key, n]) => `${key} +${n}`).join(', ') : 'nothing';
}

async function counted(description, call, want) {
  console.log(`== ${description}`);
  const before = await scrape();
  try {
    await call();
  } catch (e) {
    check(false, `${description} threw ${e instanceof AxonFlowError ? e.name : 'Error'}: ${e.message}`);
    return;
  }
  const got = moved(before, await scrape());
  console.log(`  ${description}: the agent counted ${render(got)}`);
  check(JSON.stringify(got) === JSON.stringify(want), `${description}: ${render(want)}`);
}

const health = await (await fetch(`${endpoint}/health`)).json();
console.log(`agent: ${endpoint} (edition ${JSON.stringify(health.edition)})`);
// The platform drops approval-family capabilities only for a Community
// enforcement point; any other edition admits the per-call document whole.
const overrideOutcome = health.edition === 'community' ? 'over_advertised' : 'accepted';

const client = new AxonFlow({ endpoint, clientId, clientSecret, pepHandshake: DECLARED });
await counted('decide', () => client.decide(DECIDE), { 'accepted@decision': 1 });
await counted('evaluate', () => client.evaluate(EVALUATION), { 'accepted@access_evaluation': 1 });
await counted('evaluateAll', () => client.evaluateAll(BULK), { 'accepted@access_evaluation': 1 });
await counted(
  'mcpCheckInput',
  () => client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' }),
  { 'accepted@mcp': 1 }
);
await counted(
  'mcpCheckOutput',
  () => client.mcpCheckOutput({ connectorType: 'postgres', message: 'hello' }),
  { 'accepted@mcp': 1 }
);
await counted('preCheck', () => client.preCheck({ userToken: 'tok', query: 'hello' }), {
  'accepted@gateway': 1,
});
await counted(
  'fulfillRequest',
  () => client.fulfillRequest(REDACTING, 'email the receipt to jane.doe@example.com'),
  { 'accepted@mcp': 1 }
);
await counted(
  'decide with a per-call declaration',
  () => client.decide(DECIDE, { pepHandshake: OVERRIDE }),
  { [`${overrideOutcome}@decision`]: 1 }
);

const bare = new AxonFlow({ endpoint, clientId, clientSecret });
await counted('decide with no declaration', () => bare.decide(DECIDE), { 'absent@decision': 1 });

if (failures.length > 0) {
  console.log(`\nFAIL: pep_handshake_planes (${failures.length} assertion(s))`);
  process.exit(1);
}
console.log('\nPASS: pep_handshake_planes');
