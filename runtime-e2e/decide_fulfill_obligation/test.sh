#!/usr/bin/env bash
# Runtime proof — TypeScript SDK Decision Mode PEP: decide -> fulfill -> forward
# (epic #2563 / tracking #2571, ADR-056).
#
# Per CLAUDE.md HARD RULE this test MUST hit a real running AxonFlow agent — no
# mocks. It proves the engine-fulfillable obligation contract end to end through
# the LOCAL SDK build (dist/ via file:../..; the npm registry is blocked):
#
#   1. client.decide(...) on a PII-bearing request returns verdict=allow with a
#      self-describing redact_pii obligation whose fulfillment names the
#      check-input engine endpoint (request phase, text/plain), plus a trace_id.
#   2. client.fulfillRequest(...) discharges it by round-tripping the statement
#      through that engine endpoint and returns ENGINE-redacted content — the
#      original PII (john.doe@example.com + 4111111111111111) no longer appears,
#      and the masking is the engine's (the SDK contains no local redaction path).
#   3. client.decideAndFulfill(...) does both in one call with the same result.
#   4. Demo / wrong credentials are refused (401 -> AuthenticationError); the PEP
#      cannot decide with credentials the enterprise PDP does not accept.
#
# Enterprise auth is HTTP Basic (org:license) — the SDK builds it from clientId +
# clientSecret.
#
# Usage (after `source /tmp/axonflow-e2e-env.sh` from the enterprise setup script):
#   AXONFLOW_AGENT_URL=http://localhost:8080 \
#   AXONFLOW_CLIENT_ID="$AXONFLOW_CLIENT_ID" \
#   AXONFLOW_CLIENT_SECRET="$AXONFLOW_CLIENT_SECRET" \
#   ./runtime-e2e/decide_fulfill_obligation/test.sh

set -uo pipefail

AGENT_URL=${AXONFLOW_AGENT_URL:-http://localhost:8080}
CLIENT_ID=${AXONFLOW_CLIENT_ID:-}
SECRET=${AXONFLOW_CLIENT_SECRET:-}
SDK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_TAG=$(date -u +%s)

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

if [ -z "$CLIENT_ID" ] || [ -z "$SECRET" ]; then
  red "FAIL: AXONFLOW_CLIENT_ID and AXONFLOW_CLIENT_SECRET must be set (source /tmp/axonflow-e2e-env.sh)"
  exit 2
fi

if [ ! -f "$SDK_ROOT/dist/esm/index.js" ]; then
  echo "Building local SDK..."
  (cd "$SDK_ROOT" && npm run build) || { red "FAIL: SDK build failed"; exit 1; }
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/package.json" <<EOF
{
  "name": "pep-decide-fulfill-rt-${RUN_TAG}",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": { "@axonflow/sdk": "file:${SDK_ROOT}" }
}
EOF

cat > "$WORK/main.mjs" <<'EOF'
import {
  AxonFlow,
  AuthenticationError,
  ObligationNotFulfillableError,
  OBLIGATION_REDACT_PII,
  PHASE_REQUEST,
  VERDICT_ALLOW,
} from '@axonflow/sdk';

const AGENT_URL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const CLIENT_ID = process.env.AXONFLOW_CLIENT_ID;
const SECRET = process.env.AXONFLOW_CLIENT_SECRET;

// The PII the request carries. The engine's redactor must mask the email +
// credit card; neither raw value may survive into the fulfilled content.
const RAW_EMAIL = 'john.doe@example.com';
const RAW_CARD = '4111111111111111';
const QUERY = `Send the receipt to ${RAW_EMAIL} and charge card ${RAW_CARD}`;

const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

const client = new AxonFlow({ endpoint: AGENT_URL, clientId: CLIENT_ID, clientSecret: SECRET, mode: 'production' });

try {
  // 1. decide() surfaces the engine-fulfillable redact_pii obligation.
  const decision = await client.decide({
    stage: 'tool',
    query: QUERY,
    target: { type: 'tool', tool: 'send_receipt' },
    caller_identity: { gateway_id: 'sdk-runtime-e2e' },
  });
  console.log(`decide -> verdict=${decision.verdict} obligations=${decision.obligations.length}`);
  if (decision.verdict !== VERDICT_ALLOW) fail(`expected allow, got ${decision.verdict} (${decision.error})`);
  if (!decision.trace_id) fail('decide response did not surface a trace_id');
  const redact = decision.obligations.filter((o) => o.type === OBLIGATION_REDACT_PII);
  if (redact.length === 0) fail(`no redact_pii obligation on a PII request; got ${JSON.stringify(decision.obligations)}`);
  const ful = redact[0].fulfillment;
  if (!ful || ful.phase !== PHASE_REQUEST) fail(`obligation not request-phase engine-fulfillable: ${JSON.stringify(ful)}`);
  if (!ful.endpoint.includes('check-input')) fail(`fulfillment endpoint is not the request-redaction endpoint: ${ful.endpoint}`);
  console.log(`  obligation fulfillment -> ${ful.endpoint} phase=${ful.phase} types=${JSON.stringify(ful.content_types)}`);

  // 2. fulfillRequest() returns ENGINE-redacted content; raw PII is gone.
  const [content, didRedact] = await client.fulfillRequest(decision, QUERY);
  console.log(`fulfillRequest -> didRedact=${didRedact} content=${JSON.stringify(content)}`);
  if (!didRedact) fail('engine reported no redaction on a request that carries PII');
  if (content.includes(RAW_EMAIL)) fail(`raw email survived fulfillment — PII leak: ${content}`);
  if (content.includes(RAW_CARD)) fail(`raw card survived fulfillment — PII leak: ${content}`);
  if (content === QUERY) fail('fulfilled content is byte-identical to the unredacted query');

  // 3. decideAndFulfill() one-call path yields the same masked content.
  const [verdict, oneCall] = await client.decideAndFulfill({
    stage: 'tool',
    query: QUERY,
    target: { type: 'tool', tool: 'send_receipt' },
  });
  console.log(`decideAndFulfill -> verdict=${verdict} content=${JSON.stringify(oneCall)}`);
  if (verdict !== VERDICT_ALLOW) fail(`decideAndFulfill verdict ${verdict}, expected allow`);
  if (oneCall.includes(RAW_EMAIL) || oneCall.includes(RAW_CARD)) fail(`decideAndFulfill leaked PII: ${oneCall}`);
} catch (e) {
  if (e instanceof ObligationNotFulfillableError) fail(`obligation unexpectedly not fulfillable against real agent: ${e.message}`);
  throw e;
}

// 4. Demo / wrong credentials are refused by the enterprise PDP.
const badClient = new AxonFlow({ endpoint: AGENT_URL, clientId: 'demo-org', clientSecret: 'demo-license-not-real', mode: 'production' });
try {
  await badClient.decide({ stage: 'tool', query: 'hi' });
  fail('demo credentials were NOT refused by the PDP');
} catch (e) {
  if (e instanceof AuthenticationError) {
    console.log('demo creds -> AuthenticationError (refused) OK');
  } else {
    fail(`demo creds raised ${e.constructor.name} (${e.message}), expected AuthenticationError`);
  }
}

console.log('PASS: decide -> fulfill -> forward verified against real agent');
EOF

echo "Run tag: $RUN_TAG  Agent: $AGENT_URL"
(
  cd "$WORK"
  npm install --silent --no-audit --no-fund 2>&1 | tail -2
  AXONFLOW_AGENT_URL="$AGENT_URL" AXONFLOW_CLIENT_ID="$CLIENT_ID" AXONFLOW_CLIENT_SECRET="$SECRET" \
    AXONFLOW_TELEMETRY=off node main.mjs 2>&1
)
RC=$?
[ $RC -eq 0 ] && green "runtime-e2e PASS" || { red "runtime-e2e FAIL (rc=$RC)"; exit $RC; }
