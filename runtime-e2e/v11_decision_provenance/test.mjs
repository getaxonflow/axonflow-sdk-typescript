// Real-stack proof of the v11.0.0 wire through the SDK.
//
// Drives the BUILT SDK (dist/) with the real global fetch against a real v11
// agent and orchestrator, and asserts:
//
//   1. decide carries engine=anchored, a policy_bundle digest and a
//      subject_type; when policy_identities is present it names
//      evaluated_policies one for one, in order.
//   2. The gateway pre-check carries decisionId, a verdict of allow or deny,
//      and the same provenance.
//   3. MCP check-output carries the provenance.
//   4. A legacy static-policy read emits PlatformRouteDeprecationWarning naming
//      /api/v1/typed-policies as the successor and v11.1 as the removal release.
//   5. A valid legacy static-policy write and a valid dynamic-policy write each
//      throw LegacyPolicyWriteFrozenError.
//
// Leg 5 needs the agent and the orchestrator on the application database role,
// as a deployment runs them: the freeze is a revoke on that role, and a stack
// connected as the database owner is not bound by it. See README.md.
//
// Run (after `npm run build`):
//   export AXONFLOW_AGENT_URL=http://localhost:8080
//   export AXONFLOW_CLIENT_ID=runtime-e2e
//   export AXONFLOW_CLIENT_SECRET=runtime-e2e-secret
//   node runtime-e2e/v11_decision_provenance/test.mjs

import { AxonFlow } from '../../dist/esm/client.js';
import {
  AxonFlowError,
  LegacyPolicyWriteFrozenError,
  PlatformRouteDeprecationWarning,
} from '../../dist/esm/errors.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const clientId = process.env.AXONFLOW_CLIENT_ID || 'runtime-e2e';
const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || 'runtime-e2e-secret';

const failures = [];
function check(ok, description) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${description}`);
  if (!ok) failures.push(description);
}

const warnings = [];
process.on('warning', (w) => {
  if (w instanceof PlatformRouteDeprecationWarning) warnings.push(w);
});

const client = new AxonFlow({ endpoint, clientId, clientSecret });

async function decideLeg() {
  const resp = await client.decide({
    stage: 'tool',
    query: 'look up the weather',
    target: { type: 'tool', tool: 'search' },
  });
  console.log(
    `  decide: verdict=${resp.verdict} engine=${resp.engine} subject_type=${resp.subject_type} ` +
      `policy_bundle=${resp.policy_bundle} evaluated=${JSON.stringify(resp.evaluated_policies)} ` +
      `identities=${JSON.stringify(resp.policy_identities)} packs=${JSON.stringify(resp.policy_packs)} ` +
      `document_version=${resp.document_version}`
  );
  check(resp.engine === 'anchored', 'decide names the anchored engine');
  check(Boolean(resp.policy_bundle), 'decide carries the policy bundle digest');
  check(Boolean(resp.subject_type), 'decide carries the subject type');
  if (resp.policy_identities !== undefined) {
    check(
      JSON.stringify(resp.policy_identities.map((p) => p.id)) ===
        JSON.stringify(resp.evaluated_policies ?? []),
      "decide's policy_identities name evaluated_policies one for one, in order"
    );
  }
}

async function preCheckLeg() {
  const result = await client.getPolicyApprovedContext({ userToken: 'tok', query: 'hello' });
  console.log(
    `  pre-check: approved=${result.approved} decisionId=${result.decisionId} verdict=${result.verdict} ` +
      `engine=${result.engine} subjectType=${result.subjectType} policyBundle=${result.policyBundle}`
  );
  check(Boolean(result.decisionId), 'pre-check carries the decision id');
  check(result.verdict === 'allow' || result.verdict === 'deny', 'pre-check carries the canonical verdict');
  check(result.engine === 'anchored', 'pre-check names the anchored engine');
  check(Boolean(result.policyBundle), 'pre-check carries the policy bundle digest');
}

async function mcpCheckOutputLeg() {
  const resp = await client.mcpCheckOutput({ connectorType: 'postgres', message: 'hello' });
  console.log(
    `  mcp check-output: allowed=${resp.allowed} engine=${resp.engine} ` +
      `subject_type=${resp.subject_type} policy_bundle=${resp.policy_bundle}`
  );
  check(resp.engine === 'anchored', 'MCP check-output names the anchored engine');
  check(Boolean(resp.policy_bundle), 'MCP check-output carries the policy bundle digest');
}

async function deprecatedReadLeg() {
  const before = warnings.length;
  await client.listStaticPolicies();
  // process.emitWarning delivers on the next tick.
  await new Promise((resolve) => setImmediate(resolve));
  const stamped = warnings.slice(before);
  for (const w of stamped) console.log(`  legacy read warning: ${w.message}`);
  check(stamped.length === 1, 'a legacy static-policy read emits one PlatformRouteDeprecationWarning');
  if (stamped.length > 0) {
    check(stamped[0].successor === '/api/v1/typed-policies', 'the warning names the typed route as the successor');
    check(stamped[0].removedIn === 'v11.1', 'the warning names v11.1 as the removal release');
  }
}

async function frozenWriteLeg() {
  const probe = `w3o-runtime-probe-${Math.random().toString(16).slice(2, 10)}`;
  try {
    await client.createStaticPolicy({
      name: probe,
      category: 'security-sqli',
      pattern: `(?i)${probe.replace(/-/g, '_')}`,
      severity: 'low',
      action: 'warn',
    });
    check(false, 'a legacy static-policy write throws LegacyPolicyWriteFrozenError (it succeeded)');
  } catch (e) {
    if (e instanceof LegacyPolicyWriteFrozenError) {
      console.log(`  static write refused: code=${e.code} message=${e.message}`);
      check(true, 'a legacy static-policy write throws LegacyPolicyWriteFrozenError');
    } else {
      check(false, `a legacy static-policy write throws LegacyPolicyWriteFrozenError (got ${e?.name}: ${e?.message})`);
    }
  }
  try {
    await client.createDynamicPolicy({
      name: probe,
      type: 'risk',
      category: 'dynamic-risk',
      conditions: [{ field: 'risk_score', operator: 'greater_than', value: 0.99 }],
      actions: [{ type: 'log', config: {} }],
    });
    check(false, 'a legacy dynamic-policy write throws LegacyPolicyWriteFrozenError (it succeeded)');
  } catch (e) {
    if (e instanceof LegacyPolicyWriteFrozenError) {
      console.log(`  dynamic write refused: code=${e.code} message=${e.message}`);
      check(true, 'a legacy dynamic-policy write throws LegacyPolicyWriteFrozenError');
    } else {
      check(false, `a legacy dynamic-policy write throws LegacyPolicyWriteFrozenError (got ${e?.name}: ${e?.message})`);
    }
  }
}

console.log(`agent: ${endpoint}`);
for (const leg of [decideLeg, preCheckLeg, mcpCheckOutputLeg, deprecatedReadLeg, frozenWriteLeg]) {
  console.log(`== ${leg.name}`);
  try {
    await leg();
  } catch (e) {
    check(false, `${leg.name} threw ${e instanceof AxonFlowError ? e.name : typeof e}: ${e?.message}`);
  }
}
if (failures.length > 0) {
  console.log(`\nFAIL: v11_decision_provenance (${failures.length} assertion(s))`);
  process.exit(1);
}
console.log('\nPASS: v11_decision_provenance');
