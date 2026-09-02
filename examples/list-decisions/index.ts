/**
 * Example: list the recent AxonFlow policy decisions VISIBLE TO THE CALLER.
 *
 * Implements the GET /api/v1/decisions contract — companion to
 * explainDecision. Returns the slim DecisionSummary page; tier-cap
 * 429s surface as RateLimitError carrying the V1 upgrade envelope.
 *
 * # Whose decisions come back (platform #2922)
 *
 * Not the tenant's — the caller's. On an enterprise stack a tenant-wide role
 * (admin/owner/policy_admin) lists the whole tenant, any other identity lists
 * only its own rows, and a caller presenting NO identity lists nothing
 * whatsoever. That last case used to look exactly like a quiet tenant; the SDK
 * now refuses it as a ReadScopeError instead of reporting an empty page as data.
 *
 * Mint an identity the way the E2E workflow does:
 *
 *   export AXONFLOW_USER_TOKEN=$(./scripts/generate-jwt.sh --kind user \
 *       --email dev@acme.com --org-id "$AXONFLOW_CLIENT_ID" --role developer --quiet)
 *
 * (./scripts/setup-e2e-testing.sh already exports exactly this variable.)
 * Community deployments are single-operator and need none of it.
 *
 * Required env vars:
 *   AXONFLOW_AGENT_URL          (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID
 *   AXONFLOW_CLIENT_SECRET
 *   AXONFLOW_USER_TOKEN         the per-user identity to scope the read to
 *                               (required on an enterprise stack)
 *
 * Optional filters:
 *   AXONFLOW_LIST_DECISION       allowed|blocked|redacted|needs_approval|error
 *                                (canonical audit verdicts, platform 9.0.0+;
 *                                pre-9.0.0 allow|deny|require_approval now 400)
 *   AXONFLOW_LIST_POLICY_ID      e.g. sys_sqli_stacked_drop
 *   AXONFLOW_LIST_LIMIT          integer (server-capped per tier)
 *
 * Run: npx tsx examples/list-decisions/index.ts
 */

import { AxonFlow } from '@axonflow/sdk';
import { RateLimitError, ReadScopeError } from '@axonflow/sdk';
import type { ListDecisionsOptions } from '@axonflow/sdk';

async function main() {
  const agentURL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
  const clientId = process.env.AXONFLOW_CLIENT_ID;
  const clientSecret = process.env.AXONFLOW_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('AXONFLOW_CLIENT_ID and AXONFLOW_CLIENT_SECRET must be set');
    process.exit(1);
  }

  const opts: ListDecisionsOptions = {};
  if (process.env.AXONFLOW_LIST_DECISION) opts.decision = process.env.AXONFLOW_LIST_DECISION;
  if (process.env.AXONFLOW_LIST_POLICY_ID) opts.policyId = process.env.AXONFLOW_LIST_POLICY_ID;
  if (process.env.AXONFLOW_LIST_LIMIT) opts.limit = parseInt(process.env.AXONFLOW_LIST_LIMIT, 10);

  const client = new AxonFlow({
    clientId,
    clientSecret,
    endpoint: agentURL,
    // The read-path identity this listing is scoped to. See the file header:
    // leaving it unset against an enterprise stack is what made this example
    // report a confident, empty page.
    userToken: process.env.AXONFLOW_USER_TOKEN || undefined,
  });

  try {
    const decisions = await client.listDecisions(opts);
    console.log(`=== Recent decisions (${decisions.length}) ===`);
    for (const d of decisions) {
      const policy = d.policyId ?? '-';
      const tool = d.toolSignature ?? '-';
      console.log(
        `  ${d.timestamp.toISOString()} ${d.decision.padEnd(18)} ${d.decisionId} policy=${policy} tool=${tool}`
      );
    }
  } catch (err) {
    if (err instanceof ReadScopeError && err.identityMissing) {
      console.error('=== This read was unscoped ===');
      console.error(`  ${err.message}\n`);
      console.error(
        '  The platform returned zero rows because it resolved no identity to scope on,'
      );
      console.error('  not because your tenant has no decisions. Set AXONFLOW_USER_TOKEN:');
      console.error('    export AXONFLOW_USER_TOKEN=$(./scripts/generate-jwt.sh --kind user \\');
      console.error(
        '        --email dev@acme.com --org-id "$AXONFLOW_CLIENT_ID" --role developer --quiet)'
      );
      process.exit(3);
    }
    if (err instanceof RateLimitError) {
      console.error(`=== Tier limit reached (${err.limitType}) ===`);
      console.error(`  current tier: ${err.tier}`);
      console.error(`  limit:        ${err.limit}`);
      console.error(`  reason:       ${err.message}`);
      if (err.upgrade) {
        console.error('');
        console.error(`  upgrade to ${err.upgrade.tier}: ${err.upgrade.wording}`);
        console.error(`    compare:    ${err.upgrade.compareUrl}`);
        console.error(`    buy:        ${err.upgrade.buyUrl}`);
      }
      process.exit(2);
    }
    throw err;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
