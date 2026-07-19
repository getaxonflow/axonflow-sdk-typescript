# `callerName` audit attribution — runtime-e2e

Real-stack assertion for
[getaxonflow/axonflow-enterprise#2912](https://github.com/getaxonflow/axonflow-enterprise/issues/2912)
(sub-issue of epic #2905). Sister proof to the equivalent Go SDK
runtime-e2e test (`axonflow-sdk-go/runtime-e2e/caller_name_audit/`).

## What this proves

`audit_tool_call`'s `tool_type` field was misleadingly named — every real
caller (claude_code/codex/cursor/openclaw) used it to identify **which
client** made the call, not any property of the tool. getaxonflow/axonflow-enterprise
PR #2953 (merged; shipped in platform v9.11.0) added a correctly-named
`caller_name` field alongside the legacy `tool_type` (kept as a deprecated
input fallback, not removed/renamed). The server resolves: `caller_name`
if supplied -> legacy `tool_type` if supplied -> `"unknown"` as the
default when neither is supplied (getaxonflow/axonflow-enterprise#2903,
folded into the same merge — an unidentified caller is no longer silently
attributed to the specific client `"claude_code"`, which was the default
before #2903).

This test drives `AxonFlow.auditToolCall(...)` through the real `fetch`
transport against a real running agent + orchestrator, then reads the
resulting `audit_logs` row back over `GET /api/v1/audit/{id}` and asserts
`policy_details.caller_name` equals what's expected, for two scenarios:

1. **Explicit `callerName`** — `policy_details.caller_name` equals the
   value sent.
2. **Neither `callerName` nor `toolType` supplied** — `policy_details.caller_name`
   is `"unknown"` (regression guard for #2903 — must NOT be `"claude_code"`).

This is the only way to observe `policy_details` from outside the
platform — the SDK's typed `AuditLogEntry` does not decode that JSONB
column.

No mocked fetch, no jest doubles — real bytes over `node:http` to the
live stack, enforced by `scripts/lint-no-mocks-in-runtime-e2e.sh`.

## Identity header note

This stack's audit-read endpoints are role-scoped (#2922): a caller with
no per-user identity gets zero rows back, fail-closed. This test's writes
and its verification read both carry a distinctive `X-User-Email` header,
trusted for **attribution only** (never authz/verdicts) when the
deployment sets `AXONFLOW_TRUST_IDENTITY_HEADERS=true` — this repo's
documented local-dev default (see `axonflow-enterprise/.env` and
docker-compose's `identity_header_attribution` feature, v9.9.0). The
header is added by wrapping the real `fetch` the SDK's `_fetch()` calls,
scoped to just the SDK call in this test — no response is faked or
intercepted.

If your stack has `AXONFLOW_TRUST_IDENTITY_HEADERS` unset (off), or runs
in Community mode (where `isCommunityMode()` alone already grants
tenant-wide reads), the identity header is harmless and the row is
readable regardless.

## Platform prerequisite

`caller_name` support (getaxonflow/axonflow-enterprise#2953) and the
`"unknown"` default fallback (getaxonflow/axonflow-enterprise#2903) are
both merged to `axonflow-enterprise` main and shipped in platform
**v9.11.0**. Point your local `axonflow-enterprise` checkout at `main` (or
any release >= v9.11.0) before running this test — older stacks accept
`caller_name` in the request body (extra fields are ignored) but silently
do not write it to `policy_details`, so this test fails against them, not
because the SDK change is wrong, but because the platform side predates
the feature.

## Usage

```bash
npm run build

export AXONFLOW_AGENT_URL=http://localhost:8080
export AXONFLOW_CLIENT_ID=local-dev-org
export AXONFLOW_CLIENT_SECRET=<its secret>
node runtime-e2e/caller_name_audit/test.mjs
```

Exits `0` on PASS, `1` on FAIL, `2` if required env vars are missing.

## Companion unit coverage

`tests/audit-tool-call.test.ts` exercises the wire-body serialization
through mocked `fetch`: `callerName` sent as `caller_name`, `toolType`
still working standalone (deprecated, backward-compatible), and both
fields present together. The runtime proof here is the redundant
real-stack confirmation that the value actually lands in
`policy_details.caller_name` on a persisted audit row — including the
platform-side `"unknown"` default resolution (#2903), which is entirely
server-side logic the SDK's unit tests cannot observe.
