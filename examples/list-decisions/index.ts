/**
 * Example: list recent AxonFlow policy decisions for the caller's tenant.
 *
 * Implements the GET /api/v1/decisions contract — companion to
 * explainDecision. Returns the slim DecisionSummary page; tier-cap
 * 429s surface as RateLimitError carrying the V1 upgrade envelope.
 *
 * Required env vars:
 *   AXONFLOW_AGENT_URL          (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID
 *   AXONFLOW_CLIENT_SECRET
 *
 * Optional filters:
 *   AXONFLOW_LIST_DECISION       allow|deny|require_approval
 *   AXONFLOW_LIST_POLICY_ID      e.g. sys_sqli_stacked_drop
 *   AXONFLOW_LIST_LIMIT          integer (server-capped per tier)
 *
 * Run: npx tsx examples/list-decisions/index.ts
 */

import { AxonFlow } from '@axonflow/sdk';
import { RateLimitError } from '@axonflow/sdk';
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
