<!-- allow-mocks-here: this README names forbidden mock libraries explicitly so contributors recognise them. The lint script greps for those names; the marker tells it this file is documentation, not a test. -->
# SDK runtime tests

Per CLAUDE.md HARD RULE #0: a user-facing feature is not done until you
have demonstrated it working through the SDK's actual runtime — a real
`fetch` call from a real `import { AxonFlow }` against a real running
AxonFlow agent.

**Tests in this directory MUST hit a real endpoint.** No `mockFetch`,
no `jest.mock`, no `msw`, no `nock`, no fixture servers. The
`scripts/lint-no-mocks-in-runtime-e2e.sh` lint enforces this; a
forbidden mock pattern fails CI.

**Convention.** Each test lives in its own subdirectory like
`runtime-e2e/<feature>/`. Each subdirectory has a `test.mjs` (or
`test.ts`) that the runner can invoke directly with `node`.

**How to run locally.** Set `AXONFLOW_AGENT_URL` (default
`http://localhost:8080`). Bring up a local agent — the easiest path
is `cd ../axonflow-enterprise && docker compose -f docker-compose.yml
-f docker-compose.community-saas.yml up -d`. Then:

```
export AXONFLOW_AGENT_URL=http://localhost:8080
# Register a community-saas tenant
RESP=$(curl -s -X POST $AXONFLOW_AGENT_URL/api/v1/register \
  -H "Content-Type: application/json" -d '{"label":"sdk-runtime-e2e"}')
export AXONFLOW_TENANT_ID=$(echo "$RESP" | jq -r .tenant_id)
export AXONFLOW_TENANT_SECRET=$(echo "$RESP" | jq -r .secret)

for d in runtime-e2e/*/; do
  node "$d/test.mjs" || exit 1
done
```

**What counts as a test.** Each `test.mjs` exits non-zero if the SDK's
real wire output to a real agent isn't what you expect. Best evidence
pattern: capture an agent log line that echoes a value the SDK should
have sent (e.g. `X-Axonflow-Client: sdk-typescript/<version>`).
