# Runtime proof — `org_id` in SDK telemetry payload (v9.1)

Verifies the v9.1 contract for the TypeScript SDK: every telemetry
heartbeat body carries an `org_id` field, populated from the `ORG_ID`
env var with a `local-dev-org` sentinel fallback. Issue #2277.

## Usage

Build the SDK first (the test imports from `dist/esm`):

```sh
npm run build

# ORG_ID set — operator-supplied (self-hosted) or cs_<uuid> (Community SaaS):
ORG_ID=acme-corp node runtime-e2e/v91_org_id_telemetry/test.mjs

# ORG_ID unset — local-dev-org sentinel:
unset ORG_ID && node runtime-e2e/v91_org_id_telemetry/test.mjs
```

Expected output:

```
PASS: telemetry wire payload carries org_id="acme-corp" (expected="acme-corp")
Wire body: {"telemetry_type":"sdk","sdk":"typescript", ... ,"org_id":"acme-corp"}
```

## What it asserts

1. The SDK's `sendTelemetryPing` emits a POST to
   `AXONFLOW_CHECKPOINT_URL` within seconds of invocation.
2. The POST body is valid JSON.
3. The body has an `org_id` key.
4. The value matches `$ORG_ID` (when set) or `local-dev-org` (when unset).

## CI coverage

This runtime proof is a redundant real-stack confirmation alongside the
Jest tests in `tests/telemetry.test.ts`:

- `org_id (v9.1) → telemetryOrgID helper` (4 cases)
- `org_id (v9.1) → wire payload always carries org_id` (3 cases via mock fetch)
- `org_id (v9.1) → wire payload always carries org_id (real-network E2E)`
  (3 cases via `http.createServer`)

The mutation guard is the TypeScript type system itself — `TelemetryPayload`
requires `org_id: string`; removing the populate line fails type-check
with `TS2741: Property 'org_id' is missing`.

## Cross-SDK parity

Companion runtime-e2e tests live under the same subdirectory in the
other 4 SDKs:

- `axonflow-sdk-go/runtime-e2e/v91_org_id_telemetry/`
- `axonflow-sdk-python/runtime-e2e/v91_org_id_telemetry/`
- `axonflow-sdk-java/runtime-e2e/v91_org_id_telemetry/`
- `axonflow-sdk-rust/runtime-e2e/v91_org_id_telemetry/`

All five SDKs emit `org_id` with the same wire name, same sentinel
value (`local-dev-org`), and the same precedence (env → sentinel).
