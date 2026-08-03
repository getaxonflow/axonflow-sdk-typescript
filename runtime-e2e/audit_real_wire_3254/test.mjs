// runtime-e2e/audit_real_wire_3254/test.mjs
//
// Real-wire test of the #3254 audit-model fields against a real running
// agent+orchestrator stack: the built SDK (dist/) with the real global
// fetch, no mocks. Proves end to end that:
//
//   1. searchAuditLogs() surfaces the real wire fields the 9.x server
//      actually sends: policyDecision (wire policy_decision, OPEN string
//      set), policyDetails (wire policy_details), responseTimeMs (wire
//      response_time_ms).
//   2. The seven deprecated fiction fields (querySummary, success,
//      blocked, riskScore, latencyMs, policyViolations, metadata) stay
//      at their historical parse defaults against a real server, which
//      never sends them.
//   3. The new AuditSearchRequest.action filter is READ server-side
//      (verdict-normalized filtering), while the deprecated requestType
//      filter is a server-side no-op - the two halves of the #3254
//      search-request claim.
//
// Steps:
//  1. Write a fresh audit row through the real SDK's auditToolCall()
//     (proxied tool-call plane) so the search has a row this run owns.
//  2. Poll searchAuditLogs() until the row lands (the orchestrator's
//     AuditLogger batches writes).
//  3. Assert the parsed entry's #3254 fields and fiction-field defaults.
//  4. Search with action filters and a bogus request_type and assert the
//     server's filtering behavior.
//
// Run via (after `npm run build`; see ../README.md for how to bring up a
// local stack and register/derive tenant credentials):
//
//   export AXONFLOW_AGENT_URL=http://localhost:8080
//   export AXONFLOW_CLIENT_ID=<client id>
//   export AXONFLOW_CLIENT_SECRET=<its secret>
//   node runtime-e2e/audit_real_wire_3254/test.mjs

import { AxonFlow } from '../../dist/esm/client.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const clientId =
  process.env.AXONFLOW_CLIENT_ID || process.env.AXONFLOW_TENANT_ID || 'local-dev-org';
const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || process.env.AXONFLOW_TENANT_SECRET;

if (!clientSecret) {
  console.error(
    'AXONFLOW_CLIENT_SECRET (or AXONFLOW_TENANT_SECRET) must be set; see ../README.md'
  );
  process.exit(2);
}

const client = new AxonFlow({ endpoint, clientId, clientSecret });
const marker = `e2e3254_${Date.now()}`;

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`  PASS ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`[1] write a fresh audit row via the real SDK (tool=${marker})`);
const audit = await client.auditToolCall({
  toolName: marker,
  callerName: 'sdk-ts-runtime-e2e-3254',
  input: { probe: '3254' },
  success: true,
  durationMs: 42,
});
console.log(`    auditId=${audit.auditId} status=${audit.status}`);
check('auditToolCall returned a real audit id', /^audit_/.test(audit.auditId));

console.log('[2] poll searchAuditLogs() until the row lands (batched writes)');
let mine = null;
for (let attempt = 0; attempt < 15 && !mine; attempt += 1) {
  await sleep(2000);
  const result = await client.searchAuditLogs({ limit: 100 });
  mine =
    result.entries.find((e) => e.policyDetails && e.policyDetails.tool_name === marker) || null;
  if (!mine) console.log(`    attempt ${attempt + 1}: not visible yet`);
}
if (!mine) {
  console.error('FAIL: probe row never became visible to searchAuditLogs');
  process.exit(1);
}
console.log(`    found id=${mine.id}`);

console.log('[3] #3254 real wire fields on the parsed entry:');
check(
  "policyDecision populated ('allowed')",
  mine.policyDecision === 'allowed',
  `got ${JSON.stringify(mine.policyDecision)}`
);
check(
  'policyDetails populated (object carrying tool_name)',
  typeof mine.policyDetails === 'object' &&
    mine.policyDetails !== null &&
    mine.policyDetails.tool_name === marker
);
check(
  'responseTimeMs present as a number',
  typeof mine.responseTimeMs === 'number',
  `got ${typeof mine.responseTimeMs}`
);

console.log('[4] deprecated fiction fields stay at defaults against a real server:');
check('querySummary === ""', mine.querySummary === '');
check('success === true (historical default)', mine.success === true);
check('blocked === false', mine.blocked === false);
check('riskScore === 0', mine.riskScore === 0);
check('latencyMs === 0', mine.latencyMs === 0);
check(
  'policyViolations === []',
  Array.isArray(mine.policyViolations) && mine.policyViolations.length === 0
);
check(
  'metadata === {}',
  typeof mine.metadata === 'object' &&
    mine.metadata !== null &&
    Object.keys(mine.metadata).length === 0
);

console.log('[5] action filter is read server-side; request_type is a no-op:');
const allowedOnly = await client.searchAuditLogs({ action: 'allowed', limit: 100 });
check(
  'action=allowed includes the probe row and only allowed verdicts',
  allowedOnly.entries.some((e) => e.policyDetails && e.policyDetails.tool_name === marker) &&
    allowedOnly.entries.every((e) => e.policyDecision === 'allowed'),
  `total=${allowedOnly.total}`
);
const blockedOnly = await client.searchAuditLogs({ action: 'blocked', limit: 100 });
check(
  'action=blocked excludes the allowed probe row',
  !blockedOnly.entries.some((e) => e.policyDetails && e.policyDetails.tool_name === marker),
  `total=${blockedOnly.total}`
);
const reqTypeNoop = await client.searchAuditLogs({
  requestType: 'nonexistent_type_zzz',
  limit: 100,
});
check(
  'bogus request_type filter still returns rows (server ignores it, the #3254 claim)',
  reqTypeNoop.entries.some((e) => e.policyDetails && e.policyDetails.tool_name === marker),
  `total=${reqTypeNoop.total}`
);

if (failures > 0) {
  console.error(`\nFAILED: ${failures} assertion(s).`);
  process.exit(1);
}
console.log('\nALL ASSERTIONS PASS - #3254 fields proven on the real wire.');
