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
 *   AXONFLOW_USER_TOKEN         the PER-USER identity this read is scoped to
 *                               (required on an enterprise stack — see below)
 *
 * Optional:
 *   AXONFLOW_DECISION_ID        the decision to explain. When unset this
 *                               example asks the platform for the most recent
 *                               decision THIS identity can see.
 *
 * # Why AXONFLOW_USER_TOKEN is not optional here (platform #2922)
 *
 * clientId/clientSecret say which ORGANIZATION is asking. Explain answers from
 * WHO is asking. On an enterprise stack a developer or viewer explains only
 * their own decisions, a tenant-wide role (admin/owner/policy_admin) explains
 * the whole tenant, and a caller presenting NO identity explains NOTHING — the
 * endpoint answers not-found for every id, including ids that plainly exist.
 * That is why this example failed on every enterprise stack until the SDK grew
 * a read-path identity: it was asking anonymously.
 *
 * Mint one the way the E2E workflow does:
 *
 *   export AXONFLOW_USER_TOKEN=$(./scripts/generate-jwt.sh --kind user \
 *       --email dev@acme.com --org-id "$AXONFLOW_CLIENT_ID" --role developer --quiet)
 *
 * (./scripts/setup-e2e-testing.sh already exports exactly this variable.)
 * Community deployments are single-operator and need none of it.
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

import { AxonFlow, ReadScopeError } from '@axonflow/sdk';

/**
 * The sentence a reader of this example actually needs. Without it the distinct
 * causes behind "not found" arrive looking identical.
 */
function scopeHint(err: unknown): string {
  if (!(err instanceof ReadScopeError)) return '';
  return err.identityMissing
    ? '\n  -> This read presented no per-user identity the platform could resolve, so it ' +
        'returned nothing by construction. Set AXONFLOW_USER_TOKEN (see the file header) — and ' +
        'check the address is not in a reserved domain.'
    : '\n  -> The identity in AXONFLOW_USER_TOKEN is scoped to its own rows and this decision ' +
        'is not among them. Use an admin, owner or policy_admin token to read the whole tenant.';
}

async function main() {
  let decisionId = process.env.AXONFLOW_DECISION_ID;

  const agentURL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
  const clientId = process.env.AXONFLOW_CLIENT_ID || 'community';
  const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || '';
  const userToken = process.env.AXONFLOW_USER_TOKEN || '';

  console.log(`Initializing AxonFlow client at ${agentURL}...`);
  if (!userToken) {
    console.log(
      'note: AXONFLOW_USER_TOKEN is unset - this read is unscoped. On an enterprise stack it ' +
        'will explain nothing; see the file header.'
    );
  }
  const client = new AxonFlow({
    clientId,
    clientSecret,
    endpoint: agentURL,
    // The read-path identity. Empty is legal and means "ask anonymously",
    // which on an enterprise stack explains nothing.
    userToken: userToken || undefined,
  });

  // No id given: ask for one this identity can actually see, so the example
  // explains a real decision rather than failing on a placeholder.
  if (!decisionId) {
    console.log('AXONFLOW_DECISION_ID is unset - looking up the most recent visible decision...');
    let recent;
    try {
      recent = await client.listDecisions({ limit: 1 });
    } catch (err) {
      console.error(`could not find a decision to explain: ${String(err)}${scopeHint(err)}`);
      process.exit(1);
    }
    if (recent.length === 0) {
      console.error(
        'no decisions are visible to this identity yet - make a governed call first (see the ' +
          'curl in the file header), then re-run'
      );
      process.exit(1);
    }
    decisionId = recent[0].decisionId;
    console.log(`  using decision_id=${decisionId}`);
  }

  console.log(`Explaining decision ${decisionId}...\n`);
  let exp;
  try {
    exp = await client.explainDecision(decisionId);
  } catch (err) {
    console.error(`explainDecision failed: ${String(err)}${scopeHint(err)}`);
    process.exit(1);
  }

  // An explanation that came back without the id it was asked about is not an
  // explanation - fail loudly rather than print an empty report.
  if (!exp.decisionId) {
    console.error(`the platform returned an explanation with no decision_id for ${decisionId}`);
    process.exit(1);
  }

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
