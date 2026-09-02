#!/usr/bin/env bash
# Runtime proof — the TypeScript SDK's read-path per-user identity (#2922).
#
# Builds the LOCAL SDK (dist/) and runs a Node program that drives the SDK's
# own production code path against a LIVE enterprise agent + orchestrator.
#
# The defect this pins: every SDK carried `user_token` as a write-path body
# field only, so explainDecision and listDecisions asked the platform
# anonymously. On an enterprise stack that is not "a caller who sees
# everything" — it is a caller the platform cannot scope, so explain answered
# not-found for ids that plainly existed and list answered a confident empty
# page.
#
# The npm registry is blocked, so this uses the LOCAL build via file:../..
# (never `npm install @axonflow/sdk` — that would fail on the publish boundary).
#
# Usage:
#   set -a; source /tmp/axonflow-e2e-env.sh; set +a
#   AXONFLOW_AGENT_URL=http://localhost:8080 ./test.sh

set -uo pipefail

AGENT_URL=${AXONFLOW_AGENT_URL:-http://localhost:8080}
CLIENT_ID=${AXONFLOW_CLIENT_ID:?AXONFLOW_CLIENT_ID must be set (source /tmp/axonflow-e2e-env.sh)}
SECRET=${AXONFLOW_CLIENT_SECRET:?AXONFLOW_CLIENT_SECRET must be set}
JWT=${AXONFLOW_JWT_SECRET:-${JWT_SECRET:?JWT_SECRET (or AXONFLOW_JWT_SECRET) must be set}}
ORCH=${AXONFLOW_ORCH_CONTAINER:-axonflow-orchestrator}
SDK_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_TAG="s3-ts-$(date -u +%s)-$$"

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
  "name": "read-path-identity-rt",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": { "@axonflow/sdk": "file:${SDK_ROOT}" }
}
EOF

cp "$(dirname "$0")/main.mjs" "$WORK/main.mjs"

(cd "$WORK" && npm install --no-audit --no-fund --loglevel=error >/dev/null 2>&1) \
  || { red "FAIL: local SDK link failed"; exit 1; }

AXONFLOW_AGENT_URL="$AGENT_URL" \
AXONFLOW_CLIENT_ID="$CLIENT_ID" \
AXONFLOW_CLIENT_SECRET="$SECRET" \
AXONFLOW_JWT_SECRET="$JWT" \
AXONFLOW_ORCH_CONTAINER="$ORCH" \
RUN_TAG="$RUN_TAG" \
node "$WORK/main.mjs"
rc=$?

if [ $rc -eq 0 ]; then
  green "ALL PASS: read-path identity verified end to end through the TypeScript SDK runtime"
else
  red "FAILED (exit $rc)"
fi
exit $rc
