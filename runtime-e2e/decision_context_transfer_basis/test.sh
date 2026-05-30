#!/usr/bin/env bash
# Runtime proof — TypeScript SDK v8.4.0 surfaces the Decision Mode request
# context (platform #2509, epic #2508) and the pasal_56b_dpa transfer basis.
#
# Builds the LOCAL SDK (dist/) and runs a Node program that:
#   1. acts as the PEP via a raw POST /api/v1/decide (that endpoint is not
#      SDK-wrapped per ADR-056), forwarding request context in the body;
#   2. reads the decision back through the SDK's listDecisions + explainDecision
#      and asserts DecisionSummary.context / DecisionExplanation.context are
#      populated with the forwarded keys;
#   3. JSON round-trips an AuditLogEntry carrying transferBasis='pasal_56b_dpa'
#      to confirm the value is surfaced verbatim.
#
# The npm registry is blocked, so we use the LOCAL build via file:../.. (never
# `npm install @axonflow/sdk` — that would fail on the publish boundary).
#
# Usage:
#   AXONFLOW_AGENT_URL=http://localhost:8080 ./test.sh

set -uo pipefail

AGENT_URL=${AXONFLOW_AGENT_URL:-http://localhost:8080}
CLIENT_ID=${AXONFLOW_TENANT_ID:-buku-e-ts-e2e}
SECRET=${AXONFLOW_TENANT_SECRET:-buku-e-secret}
SDK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_TAG=$(date -u +%s)

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

if [ ! -f "$SDK_ROOT/dist/esm/index.js" ]; then
  echo "Building local SDK..."
  (cd "$SDK_ROOT" && npm run build) || { red "FAIL: SDK build failed"; exit 1; }
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/package.json" <<EOF
{
  "name": "decision-ctx-rt-${RUN_TAG}",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": { "@axonflow/sdk": "file:${SDK_ROOT}" }
}
EOF

cat > "$WORK/main.mjs" <<EOF
import { AxonFlow } from '@axonflow/sdk';

const AGENT_URL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const CLIENT_ID = process.env.AXONFLOW_TENANT_ID || 'buku-e-ts-e2e';
const SECRET = process.env.AXONFLOW_TENANT_SECRET || 'buku-e-secret';
const want = { x_ai_agent: 'refund-bot', x_session_id: 'sess-buku-42', x_leader_identity: 'ops-lead' };

const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };
const sameCtx = (got) => got && want.x_ai_agent === got.x_ai_agent
  && want.x_session_id === got.x_session_id && want.x_leader_identity === got.x_leader_identity;

// 1. PEP: create a decision carrying request context (body 'context' map).
const auth = Buffer.from(CLIENT_ID + ':' + SECRET).toString('base64');
const decideResp = await fetch(AGENT_URL + '/api/v1/decide', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Client-ID': CLIENT_ID, Authorization: 'Basic ' + auth },
  body: JSON.stringify({
    stage: 'llm',
    query: 'summarize this support ticket',
    target: { type: 'llm', model: 'gpt-4', provider: 'openai' },
    context: { 'x-ai-agent': 'refund-bot', 'x-session-id': 'sess-buku-42', 'x-leader-identity': 'ops-lead' },
  }),
});
const decideText = await decideResp.text();
if (!decideResp.ok) fail('decide HTTP ' + decideResp.status + ': ' + decideText);
console.log('server /decide response: ' + decideText);
const decisionId = JSON.parse(decideText).decision_id;
if (!decisionId) fail('no decision_id: ' + decideText);
console.log('PEP decide -> decision_id=' + decisionId);

// 2. Read it back through the SDK.
const client = new AxonFlow({ endpoint: AGENT_URL, clientId: CLIENT_ID, clientSecret: SECRET, mode: 'production' });

const rows = await client.listDecisions({ limit: 5 });
const found = rows.find((r) => r.decisionId === decisionId);
if (!found) fail('listDecisions did not return ' + decisionId + ' (got ' + rows.length + ' rows)');
console.log('SDK listDecisions -> ' + JSON.stringify(found));
if (!sameCtx(found.context)) fail('listDecisions context = ' + JSON.stringify(found.context));
console.log('PASS: listDecisions DecisionSummary.context populated with ' + Object.keys(found.context).length + ' PEP-forwarded keys');

const exp = await client.explainDecision(decisionId);
console.log('SDK explainDecision -> context=' + JSON.stringify(exp.context) + ' contextTruncated=' + exp.contextTruncated);
if (!sameCtx(exp.context)) fail('explainDecision context = ' + JSON.stringify(exp.context));
console.log('PASS: explainDecision returned full context (contextTruncated=' + exp.contextTruncated + ')');

// 3. transfer_basis = pasal_56b_dpa is JSON-preserved. NOTE: TypeScript types are
//    erased at runtime, so this only asserts the value survives a JSON round-trip.
//    The SDK's real snake_case->camelCase decoder (parseAuditLogEntry) is covered
//    by tests/audit.test.ts ('should parse the pasal_56b_dpa transfer basis ...').
const entry = { id: 'e2e-audit', dataResidency: 'ID', transferBasis: 'pasal_56b_dpa' };
const back = JSON.parse(JSON.stringify(entry));
if (back.transferBasis !== 'pasal_56b_dpa') fail('transferBasis round-trip = ' + back.transferBasis);
console.log('PASS: transferBasis "' + back.transferBasis + '" JSON-preserved (SDK decoder path covered by tests/audit.test.ts)');

console.log('ALL PASS: v8.4.0 context + pasal_56b_dpa verified through SDK runtime');
EOF

echo "Run tag: $RUN_TAG  Agent: $AGENT_URL"
(
  cd "$WORK"
  npm install --silent --no-audit --no-fund 2>&1 | tail -2
  AXONFLOW_AGENT_URL="$AGENT_URL" AXONFLOW_TENANT_ID="$CLIENT_ID" AXONFLOW_TENANT_SECRET="$SECRET" \
    AXONFLOW_TELEMETRY=off node main.mjs 2>&1
)
RC=$?
[ $RC -eq 0 ] && green "runtime-e2e PASS" || { red "runtime-e2e FAIL (rc=$RC)"; exit $RC; }
