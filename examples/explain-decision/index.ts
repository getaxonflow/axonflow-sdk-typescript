/**
 * Example: explain a previously-made AxonFlow policy decision.
 *
 * Implements the ADR-043 explainability flow. Given a decision_id (typically
 * surfaced on the response of a blocked governed call, an audit_logs row, or
 * the `explain_decision` MCP tool), this example fetches the structured
 * explanation and renders the matched policies, risk level, and override
 * availability.
 *
 * Required env vars:
 *   AXONFLOW_AGENT_URL          (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID          (default: community)
 *   AXONFLOW_CLIENT_SECRET      (default: empty)
 *   AXONFLOW_DECISION_ID        the decision to explain
 *
 * Get a decision_id quickly by hitting a known-blocked policy:
 *
 *   curl -u "$AXONFLOW_CLIENT_ID:$AXONFLOW_CLIENT_SECRET" \
 *        -X POST $AXONFLOW_AGENT_URL/api/v1/mcp/check-input \
 *        -H 'Content-Type: application/json' \
 *        -d '{"connector_type":"postgres","operation":"execute",
 *             "statement":"SELECT 1; DROP TABLE users;--","user_token":"u1"}'
 *
 * then read decision_id from the block response or the most recent audit row.
 *
 * Run: npx tsx examples/explain-decision/index.ts
 */

import { AxonFlow } from '@axonflow/sdk';

async function main() {
  const decisionId = process.env.AXONFLOW_DECISION_ID;
  if (!decisionId) {
    console.error('AXONFLOW_DECISION_ID must be set (a decision_id from a recent blocked call)');
    process.exit(2);
  }

  const agentURL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
  const clientId = process.env.AXONFLOW_CLIENT_ID || 'community';
  const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || '';

  console.log(`Initializing AxonFlow client at ${agentURL}...`);
  const client = new AxonFlow({
    clientId,
    clientSecret,
    endpoint: agentURL,
  });

  console.log(`Explaining decision ${decisionId}...\n`);
  const exp = await client.explainDecision(decisionId);

  console.log('=== Decision Explanation ===');
  console.log(`  decision_id: ${exp.decisionId}`);
  console.log(`  timestamp:   ${exp.timestamp.toISOString()}`);
  console.log(`  decision:    ${exp.decision}`);
  console.log(`  reason:      ${exp.reason}`);
  if (exp.riskLevel) console.log(`  risk_level:  ${exp.riskLevel}`);
  if (exp.toolSignature) console.log(`  tool:        ${exp.toolSignature}`);

  console.log(`\n  policy_matches (${exp.policyMatches.length}):`);
  exp.policyMatches.forEach((m, i) => {
    const name = m.policyName || '(unnamed)';
    const action = m.action || '-';
    const risk = m.riskLevel || '-';
    console.log(
      `    [${i}] ${m.policyId} (${name}) — action=${action} risk=${risk} allow_override=${!!m.allowOverride}`
    );
  });

  if (exp.matchedRules && exp.matchedRules.length > 0) {
    console.log(`\n  matched_rules (${exp.matchedRules.length}):`);
    for (const r of exp.matchedRules) {
      const ruleId = r.ruleId || '(no rule id)';
      const matchedOn = r.matchedOn || '-';
      console.log(`    ${r.policyId} on ${ruleId}: matched=${matchedOn}`);
    }
  }

  console.log(`\n  override_available:           ${exp.overrideAvailable}`);
  if (exp.overrideExistingId) {
    console.log(`  override_existing_id:         ${exp.overrideExistingId}`);
  }
  console.log(`  historical_hit_count_session: ${exp.historicalHitCountSession}`);
  if (exp.policySourceLink) {
    console.log(`  policy_source_link:           ${exp.policySourceLink}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
