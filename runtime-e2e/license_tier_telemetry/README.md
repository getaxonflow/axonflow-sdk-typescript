# Runtime proof — `license_tier` in SDK telemetry (#3619)

Verifies that the SDK reports the connected platform's licence tier on its telemetry heartbeat, reads it from the `/health` response it **already** fetches for `platform_version`, and **omits** the field on every path where the tier could not be learned.

Closes the gap where telemetry could not distinguish an enterprise-licensed deployment from an unlicensed community one.

## Usage

```sh
npm run build   # the proof imports the built dist/esm output

# 1. MATRIX — every tier value and every fail-open path, against a local stand-in platform.
node runtime-e2e/license_tier_telemetry/test.mjs

# 2. REAL PLATFORM — drive the SDK at a live agent and cross-check the wire
#    value against that agent's own /health.
AXONFLOW_E2E_PLATFORM_ENDPOINT=http://localhost:8080 \
  node runtime-e2e/license_tier_telemetry/test.mjs
```

Mode 2 is the one that proves the contract end to end: it reads the tier from the live platform independently, then asserts the SDK put *that* value on the wire verbatim. If the endpoint is unreachable it asserts the **platform-down** contract instead — ping still delivered, field omitted.

## What it asserts

1. `community`, `evaluation`, `Enterprise`, the csaas `Plus` alias and the transient `starting` each reach the wire byte-for-byte. No client-side case folding or alias mapping — normalization is the receiver's job (checkpoint-service `NormalizeLicenseTier`), and folding here would mask a tier this SDK build predates.
2. On every not-learned path — platform down, HTTP 500, malformed body, no `tier` key, empty `tier` — the ping is **still delivered** and `license_tier` is **absent** from the JSON. Never `""`, never a substituted default.
3. `deployment_mode` is unchanged by the tier. The two dimensions stay separate.

## Both ping paths

`src/telemetry.ts` has TWO ping paths — the awaitable `sendTelemetryPingNow` and the fire-and-forget `sendTelemetryPing` — which build the payload independently. Both call the single `applyHealthProbe` helper so the omit-vs-populate rule cannot drift between them. The unit suite covers each path separately; this proof drives `sendTelemetryPingNow`.

## Mutation proof

| Mutation | Failing assertion |
|---|---|
| Replace the body of `applyHealthProbe` with `payload.platform_version = probe.platformVersion;` | case 1 — `license_tier absent from wire` |
| Drop the `probe.licenseTier !== null` guard (assign `?? ''`) | case 2 — `license_tier present as ""` |
| Patch only ONE of the two ping paths | the unit test written for the other path |
| Restore the pre-#3619 early return when `version` is empty | unit test `learns version and tier independently` |

No body size cap is applied here. `fetch` has already buffered the whole response by the time `resp.json()` is awaited, so a client-side cap would bound only the parse, not the read. The Go SDK does cap, because `json.Decoder` there reads from a still-streaming body and `io.LimitReader` genuinely bounds it.

## CI coverage

The equivalent assertions run in CI as `tests/telemetry-license-tier.test.ts` (18 tests), which also drive REAL local `node:http` servers on both sides rather than mocking `global.fetch` — a mocked transport certifies the payload object, only the wire body proves what the receiver sees. This runtime proof is a real-stack confirmation, not a CI gate.
