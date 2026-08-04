// runtime-e2e/masfeat_real_wire_3254/test.mjs
//
// Real-wire test of the #3254 pin-advance masfeat fields (RegistrySummary
// orgId/highMateriality/mediumMateriality/lowMateriality/assessmentsDue/
// killSwitchesTriggered; AISystemRegistry ownerEmail/riskRating*;
// KillSwitch triggerReason/triggerConditions/restoreReason) using the
// built SDK (dist/) with the real global fetch, no mocks.
//
// The masfeat module is enterprise-gated (//go:build enterprise), so this
// test asserts one of two REAL behaviors, both observed on the wire:
//
//   COMMUNITY stack: the masfeat routes do not exist - the SDK call must
//   fail with the server's real refusal (HTTP 404/403/401), NOT succeed
//   with fabricated data and NOT fail for any parse-shaped reason. That
//   pins the honest community posture.
//
//   ENTERPRISE stack: getRegistrySummary() parses; the #3254 real fields
//   are numbers/strings and the never-served fiction fields
//   (byUseCase/byStatus) stay {}.
//
// Run via (after `npm run build`; see ../README.md for stack + creds):
//
//   export AXONFLOW_AGENT_URL=http://localhost:8080
//   export AXONFLOW_CLIENT_ID=<client id>
//   export AXONFLOW_CLIENT_SECRET=<its secret>
//   node runtime-e2e/masfeat_real_wire_3254/test.mjs

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

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`  PASS ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

console.log(`[1] probe deployment posture: GET ${endpoint}/api/v1/masfeat/registry/summary`);
let summary = null;
let refusal = null;
try {
  summary = await client.masfeat.getRegistrySummary();
} catch (e) {
  refusal = e;
}

if (refusal) {
  const msg = String(refusal.message ?? refusal);
  const status = refusal.statusCode ?? refusal.status;
  console.log(`    refused: status=${status ?? 'n/a'} message=${msg.slice(0, 120)}`);
  console.log(
    '[2] community posture: the refusal must be the real server gate, not a parse failure'
  );
  check(
    'refusal is an HTTP-level gate (404/403/401), not a TypeError/parse error',
    status === 404 || status === 403 || status === 401 || /\b(404|403|401)\b/.test(msg),
    msg.slice(0, 200)
  );
  check(
    'refusal is not a client-side parse/shape failure',
    !(refusal instanceof TypeError) && !/undefined is not|cannot read/i.test(msg)
  );
  console.log(
    '    masfeat is enterprise-gated on this stack - the #3254 field assertions run on the'
  );
  console.log(
    '    enterprise posture; here they are covered by the source-derived Jest fixtures.'
  );
} else {
  console.log('[2] enterprise posture: assert the #3254 real wire fields on the parsed summary');
  console.log(`    summary=${JSON.stringify(summary)}`);
  check('totalSystems is a number', typeof summary.totalSystems === 'number');
  check(
    'highMateriality/mediumMateriality/lowMateriality present as numbers',
    ['highMateriality', 'mediumMateriality', 'lowMateriality'].every(
      (k) => typeof summary[k] === 'number'
    )
  );
  check(
    'assessmentsDue and killSwitchesTriggered present as numbers',
    typeof summary.assessmentsDue === 'number' && typeof summary.killSwitchesTriggered === 'number'
  );
  check('orgId present as a string', typeof summary.orgId === 'string');
  check(
    'never-served fiction byUseCase/byStatus stay {}',
    JSON.stringify(summary.byUseCase) === '{}' && JSON.stringify(summary.byStatus) === '{}'
  );
  check(
    'deprecated dual-read counts equal the real fields',
    summary.highMaterialityCount === summary.highMateriality &&
      summary.mediumMaterialityCount === summary.mediumMateriality &&
      summary.lowMaterialityCount === summary.lowMateriality
  );
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} assertion(s).`);
  process.exit(1);
}
console.log('\nALL ASSERTIONS PASS for this deployment posture.');
