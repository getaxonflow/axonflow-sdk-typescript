# `callerName` audit attribution — runtime-e2e

Real-stack assertion for
[getaxonflow/axonflow-enterprise#2912](https://github.com/getaxonflow/axonflow-enterprise/issues/2912)
(sub-issue of epic #2905). Sister proof to the equivalent Go SDK
runtime-e2e test (`axonflow-sdk-go/runtime-e2e/caller_name_audit/`).

## What this proves

`audit_tool_call`'s `tool_type` field was misleadingly named — every real
caller (claude_code/codex/cursor/openclaw) used it to identify **which
client** made the call, not any property of the tool. getaxonflow/axonflow-enterprise
PR #2953 added a correctly-named `caller_name` field alongside the legacy
`tool_type` (kept as a deprecated input fallback, not removed/renamed). The
server resolves: `caller_name` if supplied -> legacy `tool_type` if
supplied -> a default.

This test drives `AxonFlow.auditToolCall({ callerName: ... })` through the
real `fetch` transport against a real running agent + orchestrator, then
reads the resulting `audit_logs` row back over `GET /api/v1/audit/{id}`
and asserts `policy_details.caller_name` equals what was sent. This is the
only way to observe `policy_details` from outside the platform — the
SDK's typed `AuditLogEntry` does not decode that JSONB column.

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

## Prerequisite: platform support is not yet on `main`

`caller_name` support (axonflow-enterprise#2953) is implemented but, as of
this writing, still an open PR on the `feat/2912-caller-name-tool-type-deprecation`
branch — not yet merged to `axonflow-enterprise` main. Until it merges, a
stack built from `axonflow-enterprise` main will accept `caller_name` in
the request body (extra fields are ignored) but silently NOT write it to
`policy_details` — this test will FAIL against such a stack, not because
the SDK change is wrong, but because the platform side isn't deployed
yet. Point your local `axonflow-enterprise` checkout at that branch (or a
later commit that includes it) before running this test.

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
`policy_details.caller_name` on a persisted audit row.
