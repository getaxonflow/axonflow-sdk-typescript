#!/usr/bin/env bash
# Runtime proof — TypeScript SDK v8 sandbox-mode telemetry fires with stream=sandbox.
#
# Builds a tiny Node program that uses the LOCAL SDK build in sandbox mode
# against an unreachable agent endpoint. The SDK fires its anonymous
# telemetry ping during the AxonFlow constructor's heartbeatReady chain.
# We then query the deployed checkpoint Lambda's CloudWatch logs for the
# audit line that should record stream=sandbox in DynamoDB.
#
# Pre-v8 this test would have produced ZERO pings (sandbox-mode silent
# suppression). Post-v8 we expect exactly one ping with stream=sandbox.
#
# Stack-state assumptions:
#   - axonflow-enterprise PR #2005 is deployed (server-side stream allowlist
#     accepts and persists "sandbox" — without that, this row is stored
#     as stream=heartbeat, defeating the test's purpose).
#   - AWS credentials with read access on /aws/lambda/prod-axonflow-checkpoint.
#
# HARD RULE #6 — TypeScript npm registry is blocked. We use the LOCAL build
# (dist/) via a relative file:../.. install. Do NOT switch this to
# npm install @axonflow/sdk@8 — it will fail on the publish boundary.
#
# Usage:
#   AWS_REGION=us-east-1 ./test.sh

set -uo pipefail

REGION=${AWS_REGION:-us-east-1}
LOG_GROUP=${LOG_GROUP:-/aws/lambda/prod-axonflow-checkpoint}
RUN_TAG=$(date -u +%s)
SDK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# 1. Make sure the local SDK is built. The runtime-e2e program imports
#    from the compiled ESM dist, not src — that's the surface real
#    customers see.
if [ ! -f "$SDK_ROOT/dist/esm/index.js" ]; then
  echo "Building local SDK..."
  (cd "$SDK_ROOT" && npm run build) || {
    red "FAIL: SDK build failed"
    exit 1
  }
fi

# 2. Build a transient Node program that imports the local SDK + creates a
#    Sandbox client. The unreachable :65530 endpoint is intentional — we
#    only want the anonymous heartbeat to fire, not any platform call.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/package.json" <<EOF
{
  "name": "sandbox-rt-${RUN_TAG}",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@axonflow/sdk": "file:${SDK_ROOT}"
  }
}
EOF

cat > "$WORK/main.mjs" <<'EOF'
import { AxonFlow } from '@axonflow/sdk';

// Belt-and-braces: jest.setup.ts sets AXONFLOW_TELEMETRY=off in test
// processes. We're outside Jest here, but if the operator's shell rcfile
// sets it (it does on the dev box), telemetry would be silenced and the
// test would fail for the wrong reason. Clear it.
delete process.env.AXONFLOW_TELEMETRY;

const stamp = () => new Date().toISOString();
console.log(`[${stamp()}] Constructing AxonFlow.sandbox at unreachable endpoint...`);

// AxonFlow.sandbox() defaults endpoint to http://localhost:8080. Override
// with a clearly-dead port so no platform fetch can succeed — only the
// telemetry path to checkpoint.getaxonflow.com proceeds.
const client = new AxonFlow({
  clientId: 'rt-test',
  clientSecret: 'rt-test',
  mode: 'sandbox',
  endpoint: 'http://localhost:65530',
});

console.log(`[${stamp()}] Constructor returned. Awaiting heartbeatReady (bounded ~3s)...`);

// Race the heartbeat against a 5s upper-bound so the script always exits.
await Promise.race([
  client.heartbeatReady,
  new Promise(r => setTimeout(r, 5000)),
]);

console.log(`[${stamp()}] heartbeatReady settled (or 5s timeout). Done.`);
EOF

T0_MS=$(($(date -u +%s)*1000))
echo "Run tag: $RUN_TAG"
echo "T0 (ms): $T0_MS"
echo

(
  cd "$WORK"
  npm install --silent --no-audit --no-fund 2>&1 | tail -3
  node main.mjs 2>&1
)

echo
echo "Waiting 10s for CloudWatch log delivery..."
sleep 10

# 3. Look for the audit row our run produced — match by sdk=typescript/8.
echo "Querying CloudWatch logs since T0 for sdk=typescript/8 event_stored entries..."
HITS=$(aws --region "$REGION" logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$T0_MS" \
  --filter-pattern '"event_stored" "sdk=typescript/8"' \
  --query 'events[*].message' \
  --output text 2>&1)

if [ -z "$HITS" ]; then
  red "FAIL: no event_stored sdk=typescript/8 row landed in checkpoint logs since T0"
  red "  Expected: one audit row tagged stream=sandbox"
  red "  CloudWatch query window: $T0_MS → now"
  exit 1
fi

echo "Audit rows found:"
echo "$HITS"
echo

if echo "$HITS" | grep -q 'stream=sandbox'; then
  green "PASS: TypeScript SDK sandbox-mode ping landed with stream=sandbox"
else
  red "FAIL: audit row did not include stream=sandbox"
  red "  This usually means PR #2005 (server-side allowlist) is not yet deployed —"
  red "  the server still hardcodes stream=heartbeat regardless of payload."
  exit 1
fi
