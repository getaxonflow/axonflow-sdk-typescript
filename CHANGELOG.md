# Changelog

All notable changes to the AxonFlow TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [9.2.0] - 2026-09-01: AuthZEN-native authorization surface

### Added

- **AuthZEN-native authorization surface (ADR-065, #3615).** `evaluate` and
  `evaluateAll` talk to `POST /api/v1/access/evaluation`. A bulk envelope
  returns ONE decision, not one per entry: its entries are preconditions of a
  single operation, so a denied entry denies the operation. Nothing is
  deprecated by this - `decide` and the gateway/proxy methods stay wire-stable
  through all of v11 - but new integrations should be written against it,
  because at v11 the engine behind it becomes the ADR-065 Policy Decision Point
  with no wire change.
- `AuthZENAttribute`, an explicit three-valued type for policy-visible
  attributes. `known` is sent, `absent` is omitted (the source established there
  is no value), and `unknown` REFUSES the request locally rather than letting
  the gateway evaluate as though the attribute were missing. `undefined` cannot
  express that difference, and collapsing it is how an attribute nobody resolved
  is recorded as one that was weighed.
- `AuthZENRefusal` (the request was not evaluated; carries the server's typed
  code, the JSON Pointer of the member to fix, whether the SDK or the gateway
  refused, and whether a retry could help) and `AuthZENProtocolError` (a 200
  whose body this build cannot safely act on - no profile context, an unknown
  profile, or a decision boolean that disagrees with its operational state). A
  `401` continues to surface as the SDK's existing `AuthenticationError`.
- The AuthZEN wire types AND their runtime validators are GENERATED from the
  platform's canonical surface artifact, vendored byte-identically at
  `tests/fixtures/authzen-surface.json`. A TypeScript interface is erased at
  runtime, so the generated validators are what actually refuses a response this
  build cannot interpret. `scripts/gen-authzen-types/generate.js` emits
  `src/types/authzen.gen.ts`; CI fails if the committed module is not what the
  artifact produces.

- **Documentation.** `README.md` gains an AuthZEN section covering the call
  shape, the refusal contract, bulk semantics, obligations and the table of
  what is evaluable today. `docs/AUTHZEN_MIGRATION_DRAFT.md` carries the
  legacy-to-AuthZEN mapping table and the v10.3.0 / v11.0.0 / v12.0.0 timeline;
  it is a DRAFT held out of the README on purpose, because nothing is
  deprecated today. The legacy surface is deprecated at v11.0.0 and removed
  only at v12.0.0.
- **Runnable proofs**: `examples/authzen/` and
  `runtime-e2e/authzen_evaluation/` (the latter runs against a live agent).

### Migration notes

- **No migration is required.** A 9.1.0 integration behaves identically on
  9.2.0. `decide` and the gateway/proxy methods are unchanged, still
  supported, and wire-stable through all of v11. The notes below apply only if
  you choose to move an integration onto the new surface.
- The mapping is mechanical: `stage: 'llm'` becomes
  `action: { name: 'llm.completion' }` plus `resource: { type: 'llm' }`,
  `stage: 'tool'` becomes `tool.call` plus `resource.id = '<server>/<tool>'`,
  and `stage: 'agent'` becomes `agent.invoke`. `callerIdentity.gatewayId`
  becomes `subject: { type: 'gateway', id }`, `query` moves to
  `context: { args: { query } }`, and `verdict` becomes
  `decision.allowed` plus `decision.state`.
- **The one behavioural difference to plan for**: the legacy surface silently
  dropped context members it did not recognise; the AuthZEN surface refuses
  them and names the member by JSON Pointer. Code that was quietly sending
  fields nothing read will start receiving refusals naming those fields, which
  is the surface reporting something true that was previously hidden. A
  refusal is NOT a denial: branch on `AuthZENRefusal` rather than treating
  every error as a deny.
- **An end-user subject is not yet expressible.** `subject.type` must be
  `gateway`. Integrations that authorize per end user should stay on the
  legacy `userToken` path until the identity plane arrives at v11.
- The full table and timeline live in `docs/AUTHZEN_MIGRATION_DRAFT.md`.

## [9.1.0] - 2026-08-04

### Added

- masfeat real wire fields (#3254 pin-advance batch): `orgId`,
  `highMateriality`, `mediumMateriality`, `lowMateriality`,
  `assessmentsDue`, `killSwitchesTriggered` on `RegistrySummary`;
  `ownerEmail`, `riskRatingImpact`, `riskRatingComplexity`,
  `riskRatingReliance` on `AISystemRegistry`; `triggerReason`,
  `triggerConditions`, `restoreReason` on `KillSwitch`. All optional; an
  old server omitting them leaves them `undefined`
  (getaxonflow/axonflow-enterprise#3254).
- The audit-surface binding gate now also binds the masfeat read models
  (`RegistrySummary`, `AISystemRegistry`, `KillSwitch`) to the pinned
  OpenAPI schemas.
- Real wire fields `policyDecision` (`policy_decision`), `policyDetails`
  (`policy_details`), `responseTimeMs` (`response_time_ms`) on the audit
  read model (`AuditLogEntry`), and `action` on audit search
  (`AuditSearchRequest`). All optional; an old server or a non-LLM plane
  omitting them leaves them `undefined`
  (getaxonflow/axonflow-enterprise#3254).
- Audit-surface binding gate (`scripts/audit-binding/check.js`): binds
  model properties through their transformer mappings to the pinned
  OpenAPI schemas, fails closed on unresolvable bindings, and names the
  deprecated fiction fields as curated debt.

- **`AuditToolCallRequest.callerName`** — identifies which client made a
  tool call (e.g. `claude_code`, `codex`, `cursor`, `openclaw`), sent to the
  orchestrator as `caller_name` (getaxonflow/axonflow-enterprise#2912,
  sub-issue of epic #2905). Replaces the misleadingly-named `toolType`
  field, which every real caller used to identify the calling client rather
  than any property of the tool itself. `toolType` is kept as a deprecated
  input fallback — not removed, not renamed — so existing callers keep
  working during the deprecation window; the server resolves `callerName`
  if supplied, else falls back to legacy `toolType`, else defaults to
  `"unknown"` for an unidentified caller (getaxonflow/axonflow-enterprise#2903
  — an unidentified caller is no longer silently attributed to the specific
  client `"claude_code"`).

### Deprecated

- masfeat fiction fields (#3254 pin-advance batch):
  `highMaterialityCount`/`mediumMaterialityCount`/`lowMaterialityCount`
  (populated via fallback from the real `high/medium/low_materiality`
  wire fields; use `highMateriality` etc.), `byUseCase`/`byStatus`
  (never served, always `{}`) on `RegistrySummary`; `technicalOwner`
  (never served), `businessOwner` (fallback from `owner_email`),
  `customerImpact`/`modelComplexity`/`humanReliance` (fallback from
  `risk_rating_*`; use `riskRating*`) on `AISystemRegistry`;
  `triggeredReason` (fallback from `trigger_reason`; use
  `triggerReason`) on `KillSwitch`. Removal rides the next major.
- `querySummary`/`success`/`blocked`/`riskScore`/`latencyMs`/
  `policyViolations`/`metadata` (read model) and `requestType` (search
  request) - never served/read on the 9.x line
  (getaxonflow/axonflow-enterprise#3254). Removal rides the next major.

## [9.0.0] - 2026-07-18

### Changed (BREAKING)

- **The LangGraph adapter now reports the (server, tool) identity as two
  separate wire fields instead of concatenating them into `connectorType`.**
  `mcpCheckInput` and `mcpCheckOutput` gain an optional `tool` field, sent
  alongside `connectorType` on the wire, matching the platform's two-field
  (server, tool) identity contract. `mcpToolInterceptor()`
  now sends `connectorType: request.serverName` and `tool: request.name` as
  two distinct values instead of `` `${serverName}.${name}` ``; the default
  `connectorTypeFn` returns the bare `serverName`. `tool` is always sent
  separately and is never folded into `connectorType`, even with a custom
  `connectorTypeFn`.

  **Migration.** Policies or per-connector settings matching the old
  concatenated value — e.g. `connectorType == "filesystem.read_file"` — stop
  matching after upgrade. Re-scope them to match `connectorType ==
  "filesystem"` together with the `tool` field (e.g. `tool == "read_file"`).
  The `connectorTypeFn` option is the compatibility lever: a caller can
  restore any prior `connectorType` value (including the old concatenated
  form, `` (req) => `${req.serverName}.${req.name}` ``) without losing the
  separate `tool` field.

  **Statement text also changed** for policies that match on the
  human-readable `statement`: it is now `` `${connectorType}.${tool}(args)` ``
  (built from the *resolved* connector type). With a custom `connectorTypeFn`
  the statement shape shifts from the old `` `${custom}(args)` `` to
  `` `${custom}.${tool}(args)` ``.

  **Missing-server edge.** With the default resolver, a tool whose
  `serverName` is empty now sends `connectorType: ''`, which the platform
  rejects with HTTP 400 → the tool call is blocked (fail-closed), never run
  ungoverned. Previously the concatenated value was `".tool"` (a non-empty
  string the platform accepted). Supply a `connectorTypeFn` for server-less
  MCP tools.

  **Minimum platform.** The `tool` field is consumed on `POST
  /api/v1/mcp/check-input` by **AxonFlow platform v9.10.0+**. On platforms
  below v9.10.0 the `tool` field is silently dropped and identity degrades to
  the bare server name — coarser than the old concatenated value — so
  **upgrade the platform to v9.10.0+ before adopting this SDK major.**
  Response-plane (`check-output`) `tool` scoping requires **AxonFlow platform
  v9.11.0+**; until then the SDK sends it forward-compatibly and older
  platforms ignore it.

## [8.5.1] - 2026-07-09 — getPlanStatus auth + queryConnector user token + example fixes

Hostile-testing sweep ahead of the BukuWarung integration
(getaxonflow/axonflow-enterprise#2861).

### Fixed

- **`getPlanStatus` sends the Basic auth header.** It was the only client
  method calling `_fetch` without `buildAuthHeaders()` — every call 401'd
  ("Authorization header required") against a live stack. Regression test
  asserts the header on the wire; `runtime-e2e/plan_status_auth/` proves the
  round-trip against a real agent.
- **`queryConnector` accepts an optional `userToken` parameter** (4th arg,
  additive). It hardcoded `user_token: ''` with no way to supply a real
  token, so JWT-validating enterprise stacks rejected every connector query.
  Cross-SDK parity with Go's `QueryConnector(userToken, …)`.
- **Examples pass `AXONFLOW_USER_TOKEN` and fail honestly.** Enterprise
  stacks validate user tokens as JWTs; `basic`, `proxy-mode`, `planning` and
  `connectors` passed hardcoded non-JWT literals — every governed call
  401'd while the examples still printed "completed" and exited 0. They now
  read `AXONFLOW_USER_TOKEN`, thread it through `generatePlan`/`executePlan`
  and `queryConnector`, and set a non-zero exit code on unexpected failures
  (`PolicyViolationError` remains an expected demo outcome).

### Added

- `runtime-e2e/plan_status_auth/` — live-agent assertion: generatePlan →
  getPlanStatus authenticated round-trip + wrong-credentials 401 control.

## [8.5.0] - 2026-06-09 — Decision Mode PEP: decide → fulfill → forward

Adds the SDK analog of the platform PEP client (`platform/shared/pep`,
ADR-056, epic #2563). A Policy Enforcement Point now follows one path —
**decide → fulfill → forward** — and the SDK makes the engine-fulfillable
obligation contract impossible to misuse: there is **no local redaction
path**, so a `redact_pii` obligation can only be discharged by round-tripping
content through the engine endpoint the obligation names.

### Added

- **`AxonFlow.decide(request)`** — the PDP step. `POST /api/v1/decide` returns a
  `DecideResponse` whose `obligations` is an array of self-describing
  `Obligation`s. Decision Mode auth is HTTP Basic (org:license), which the
  client already sends; wrong/demo credentials are refused with
  `AuthenticationError`. A deny verdict is returned in the body (HTTP 200), not
  thrown.
- **`AxonFlow.fulfillRequest(decision, statement)`** — discharges every
  request-phase `redact_pii` obligation by POSTing the statement to the engine's
  `check-input` endpoint and returning the **engine-redacted** statement as
  `[content, didRedact]`. Fails closed with `ObligationNotFulfillableError` when
  an obligation names no request-phase fulfillment, advertises a content-type the
  PEP is not holding, names an endpoint the client will not call, the engine call
  fails, or the engine reports `redaction_evaluated=false`. Never redacts locally.
- **`AxonFlow.decideAndFulfill(request)`** — the blessed one-call path (decide,
  then fulfill any request-phase obligation), returning
  `[verdict, content, decision]`; fail-closed by construction.
- **New types**: `DecideRequest`, `DecideResponse`, `Obligation`,
  `ObligationFulfillment`, `DecisionCallerIdentity`, `DecisionTarget` (snake_case
  wire shape).
- **New error class**: `ObligationNotFulfillableError` (a fail-closed signal).
- **PEP constants** + `hasRequestRedaction(obligations)` and
  `endpointPathMatches(...)` helpers (`OBLIGATION_REDACT_PII`,
  `PHASE_REQUEST`/`PHASE_RESPONSE`, `CONTENT_TYPE_TEXT`,
  `VERDICT_ALLOW`/`VERDICT_DENY`/`VERDICT_NEEDS_APPROVAL`, endpoint-path
  constants), all exported from the package root.
- **`redacted` / `redacted_statement` / `redaction_evaluated` on
  `MCPCheckInputResponse`** and **`redaction_evaluated` on
  `MCPCheckOutputResponse`** — the request-redaction contract fields the agent
  emits (ADR-056). A PEP fulfilling an obligation fails closed when
  `redaction_evaluated` is false.
- **`contentType` on `MCPCheckInputOptions` / `mcpCheckInput(...)`** — selects
  the request-redaction detector (maps to the snake_case `content_type` wire
  field; defaults to `text/plain` server-side).

### Notes

- SDK semver is decoupled from the platform: this is a **minor** bump from 8.4.0
  (purely additive, optional fields backward-compatible with older platforms).
  The wire-shape baseline records the new fields as an acknowledged SDK superset
  pending the OpenAPI spec catching up; the pinned `openapi_specs_sha` is
  unchanged.

## [8.4.0] - 2026-05-30 — Decision request context + Pasal 56(b) transfer basis

Targets AxonFlow platform **v8.5.0**.

### Added

- **`context` field on `DecisionSummary` and `DecisionExplanation`** —
  `Record<string, string>`. Surfaces the sanitized request context a PEP attaches
  to a Decision Mode call (canonical `lower_snake_case` keys such as `x_ai_agent`,
  `x_session_id`, `x_leader_identity`, and `x-bukuwarung-*`), persisted by the
  platform at the audit row's `policy_details->'context'`. `listDecisions()`
  returns the platform-truncated summary (5 keys); `explainDecision()` returns the
  full map. The `parseDecisionSummary` / `parseDecisionExplanation` decoders map
  the new wire fields through. Absent for pre-v8.4.0 audit rows.
- **`contextTruncated` field on `DecisionExplanation`** — `boolean`. True when the
  agent dropped surplus context keys at write time.
- **`TransferBasis` union type** (`'adequacy' | 'safeguards' | 'pasal_56b_dpa' |
  'consent'`), exported from the package root. Names the Indonesia UU PDP Pasal 56
  legal bases.

### Changed

- **`AuditLogEntry.transferBasis`** is now typed `TransferBasis` (was `string`) and
  accepts `pasal_56b_dpa` (Pasal 56(b) explicit DPA tag) alongside `adequacy`,
  `safeguards`, and `consent`. The union is a compile-time hint only — the runtime
  decoder passes the value through verbatim, so existing `safeguards` consumers are
  unaffected and an unknown future value still parses.

## [8.3.0] - 2026-05-27 — Indonesia PII category + cross-border audit fields

### Added

- **`pii-indonesia` policy category** in the `PolicyCategory` union type.
  Enables filtering and creating policies for Indonesian PII detection
  (NIK, KK, NPWP, BPJS) alongside the existing per-jurisdiction categories.
- **`dataResidency` and `transferBasis` fields on `AuditLogEntry`.**
  Optional string fields supporting cross-border data transfer logging.
  `dataResidency` is an ISO 3166-1 alpha-2 country code;
  `transferBasis` is one of `adequacy`, `safeguards`, or `consent`.
  Both are optional for backward compatibility with older platform versions.

## [8.2.0] - 2026-05-23 — `createHITLRequest` for explicit HITL row creation

Enables agent-framework plugins (Google ADK, n8n, OpenAI Agents SDK) to
implement the full 4-step HITL approval flow against AxonFlow:

  1. Gate evaluates `require_approval` (via `pre_check` / `checkToolInput`)
  2. Plugin calls `client.createHITLRequest(...)` to enqueue the row
  3. Plugin polls `client.getHITLRequest(approval_id)` until terminal state
  4. Plugin resumes the agent or denies the call based on the decision

Prior to this release the SDK exposed `getHITLRequest` /
`approveHITLRequest` / `rejectHITLRequest` (the read + review
surface) but had no method to **create** a row. The platform's
`POST /api/v1/hitl/queue` endpoint has existed since v6.x; only the SDK
surface was missing.

### Added

- **`client.createHITLRequest(input: HITLCreateInput): Promise<HITLApprovalRequest>`.**
  Required fields: `client_id`, `original_query`, `request_type`.
  Optional fields cover policy attribution, severity, compliance
  framework, an expiry override, and the new `notify_url` callback.
  Server-side `X-Org-ID` / `X-Tenant-ID` headers are derived by the
  platform's auth middleware from the SDK client's configured
  credentials — callers do not pass them through this method.
- **`HITLCreateInput` interface** in `src/types/hitl.ts` mirroring
  `platform/agent/hitl/handler.go:86 CreateRequestInput`. Exported
  from the top-level package alongside the existing HITL types.
- **`notify_url` field on `HITLCreateInput` and `HITLApprovalRequest`.**
  Opt-in webhook URL fired after the request reaches a terminal state
  (approved / rejected / expired / overridden). Pairs with the
  HMAC-SHA256 `X-AxonFlow-Signature` header on the receiver side.
  Scheme allowlist (`https://`, plus `http://` for self-hosted
  local-dev) is enforced server-side; bad schemes surface as an SDK
  error carrying the platform's `HTTP 400`. Companion platform work in
  getaxonflow/axonflow-enterprise#2419.
- 8 Jest cases covering: full-fields create, minimal required-fields
  create, bad-`notify_url`-scheme 400 propagation, 401 propagation,
  connect failure propagation, and the three `ConfigurationError`
  guards for missing required fields.

### Compatibility

No breaking changes. New imports are additive in `src/types/hitl.ts`
and the top-level package re-exports. The existing `getHITLRequest` /
`approveHITLRequest` / `rejectHITLRequest` / `listHITLQueue` /
`getHITLStats` methods are unchanged. `notify_url` on the response
type is optional and absent in payloads from platforms that don't yet
implement the field; older code parses the new shape cleanly.

Requires AxonFlow platform >= 8.1.0 for `notify_url` webhook delivery
and `Idempotency-Key` request deduplication.

Cross-SDK parity sweep: getaxonflow/axonflow-enterprise#2421.

## [8.1.0] - 2026-05-22 — `X-Client-ID` header on every outbound request + `org_id` in telemetry heartbeat + single-attempt HTTP contract documented

Companion release to the v9 identity cleanup on the platform. Every
governed request now carries an `X-Client-ID: <effective_client_id>`
header alongside the existing Basic Auth + `X-Axonflow-Client` headers.
Value matches the SDK's Basic Auth username — smart default `community`
when no `clientId` is configured.

### Added

- **`X-Client-ID` header on outbound HTTP requests.** Server-side identity
 decisions no longer need to re-decode Basic Auth. The platform's auth
 middleware overwrites the header with its own auth-derived value, so
 caller-supplied values are harmless (no spoofing surface).
- **`org_id` field in the telemetry heartbeat body.** Brings the TypeScript
 SDK telemetry up to parity with the platform — every heartbeat now
 identifies which deployment-organization emitted it. Two sources in
 precedence order:
 1. The `ORG_ID` env var when set (the explicit configuration
    on self-hosted deployments, or the `cs_<uuid>` tenant identifier on
    Community SaaS).
 2. Otherwise the `local-dev-org` sentinel (default-config Community-mode
    developers).
 Exported as `telemetryOrgID()` + `ORG_ID_LOCAL_DEV_SENTINEL`. Always
 emitted by v8.1+ SDKs; older receivers ignore the field cleanly for
 backward compat. Honors `AXONFLOW_TELEMETRY=off` like every other
 heartbeat field. See
 [getaxonflow.com/privacy/](https://getaxonflow.com/privacy/) for the
 customer-facing commitment that covers this field.
- **Regression tests covering the single-attempt HTTP contract.** Two
 new test files lock in that `auditToolCall` and the portal request
 helper each issue exactly one outbound `fetch` and never retry on HTTP
 401 (or 403, for the portal helper) — the storm-prevention behaviour
 customers rely on when credentials are invalid or expired.

### Changed

- **Telemetry-enabled log line** softened from "Anonymous telemetry
 enabled" to "Telemetry enabled" to stay coherent with the `org_id`
 addition — the configured `ORG_ID` on self-hosted deployments is not
 anonymized; only the `instance_id` and `cs_<uuid>` Community SaaS
 identifier remain anonymous-by-design.
- **README "A note on HTTP retries"** clarifies that the SDK does not
 wrap HTTP calls in an internal retry loop, 401 is terminal, and any
 caller-side retry wrapper MUST exclude `AuthenticationError`. The
 previous example block in "Configuration Options" showed a `retry: {
 enabled, maxAttempts, delay }` config that the SDK accepts on the
 constructor but never wires into the underlying fetch path — removed
 from the example so customers don't write retry-storm code against a
 config that does nothing. The config type (`AxonFlowConfig.retry`) is
 retained for backward compatibility; it is silently ignored.
- **`SDK_ARCHITECTURE.md`, `TECHNICAL_SPECIFICATION.md`, `TEST_PLAN.md`
 retry sections** corrected to reflect single-attempt semantics — the
 prior text referenced a `RetryConfig` interface and exponential-backoff
 behaviour that the SDK does not implement. Section headers retained so
 readers searching for "retry" land on the negation rather than nothing.

### Deprecated

- **`AxonFlowConfig.tenant` field — `@deprecated` strengthened.** The
 field will be REMOVED in v10. Use `clientId` for both authentication
 identity and tenant routing — the platform derives tenant scope from
 the authenticated `client_id`. Wire-level `tenant_id` JSON fields on
 request payloads remain unchanged.
- **`AxonFlowConfig.retry` field and `RetryConfig` interface — marked
 `@deprecated` in `src/types/config.ts`.** IDE hover / IntelliSense was
 the last surface still presenting "Retry configuration" with three
 working-looking fields. The fields had never been wired into the fetch
 path; the deprecation aligns the type system with the documented
 single-attempt contract. Slated for removal in v10.

### Compatibility

- Backward-compatible against v8 and v9 platforms: v8 agents ignore the
 unknown header; v9 agents derive identity from Basic Auth regardless.
- `org_id` is an additive field — older receivers ignore it cleanly,
 legacy SDK builds keep working unchanged.
- No removed fields. No changed defaults.

## [8.0.0] - 2026-05-09 — Decision History API + policy_version recorded on every decision + telemetry simplification

**Major release.** The headline feature is the new decision-history client API:
`listDecisions` for paging through recorded decisions, plus a runnable example
showing the full record → list → explain audit flow. Bundled into a major
because the v8 line also tightens the telemetry contract — see `Removed` at
the bottom of this entry for that.

### Added

- **`listDecisions(opts?: ListDecisionsOptions)` client method.** Pages over
 recorded decision history from the orchestrator, mirroring `GET
 /api/v1/decisions`. Companion to the v7.4.0 `explainDecision` method —
 callers can now both list and drill in. Returns `DecisionSummary[]`.
 See `examples/list-decisions/`.
- **`examples/explain-decision/`** end-to-end runnable example covering
 the full decision audit flow: record → list → explain.
- **Typed `RateLimitError` envelope** on `listDecisions` 429 responses.
 `RateLimitError.fromTierEnvelope()` parses the V1 limit/tier/upgrade
 envelope (`limitType`, `tier`, `upgrade.{wording,compareUrl,buyUrl}`)
 so callers can route Free → Pro upgrade hints. Backward-compatible —
 the existing daily-quota positional constructor still works.
- **Public re-exports.** `ListDecisionsOptions`, `DecisionSummary`,
 `UpgradeInfo`, `ExplainPolicy`, `ExplainRule` are now exported from
 the package public surface (`@axonflow/sdk`).

### Migration guide (v7 → v8)

- **`AxonFlowConfig.telemetry` field removed.** TypeScript code referencing
 this field will fail to typecheck. Migration: remove the field from your
 `AxonFlowConfig` literal. If you were using it to disable telemetry,
 set `AXONFLOW_TELEMETRY=off` in the environment instead — that's the
 sole opt-out lever as of v8. If you were using it to force-enable, the
 default is now ON for every mode so the field is no longer needed.
- **No public method-signature changes** beyond the field removal above.
 `npm install @axonflow/sdk@^8.0.0` and rebuild against v8 with no other
 source changes.

### Telemetry

- **`AXONFLOW_TELEMETRY=off` is the sole opt-out.** `AxonFlowConfig.telemetry` field removed; sandbox-mode clients now fire on the same 7-day heartbeat schedule as production (was suppressed pre-v8), tagged `stream="sandbox"` so dev pings stay distinguishable.
- **Heartbeat payload v1 schema additions** on the wire: new `telemetry_type` and `deployment_mode` fields. Existing receivers continue working unchanged — strictly additive.

## [7.1.0] - 2026-05-06 — X-Axonflow-Client header + scope-aware license validation

**Companion release to platform v7.7.0.** The TypeScript SDK now sends an
`X-Axonflow-Client` identification header on every governed request, which
the agent uses to derive the SDK request scope and validate it against any
license token's audience claim per the license matrix.

### Added

- **`X-Axonflow-Client: sdk-typescript/<version>` header** on every
 governed outbound request. Set automatically by the SDK transport;
 not configurable. Agents at v7.7.0+ derive request scope from this
 header and reject cross-quadrant token misuse (e.g. a SaaS Plugin Pro
 token paired with an SDK request) at the validator boundary. Older
 agents (pre-v7.7.0) ignore the header and continue to work unchanged.

### Compatibility

- **No public API changes.** Existing v7.0.x callers
 `npm install @axonflow/sdk@^7.1.0` and rebuild against v7.1.0 with no
 source changes.
- **Backward-compatible against pre-v7.7.0 agents.** The header is
 silently dropped by older agents; the SDK behaves identically against
 v7.0.x / v7.1.x / v7.6.x agents as before.
- **Forward-compatible.** Future agent releases that require the header
 on specific governed surfaces will work with this SDK without further
 client changes.

### Companion releases (same day)

- **Platform v7.7.0** — V1 SaaS Plugin Pro launch, license matrix,
 per-tenant tier resolution, GDPR right-to-erasure
 ([CHANGELOG](https://github.com/getaxonflow/axonflow/blob/main/CHANGELOG.md))
- **Go SDK v7.1.0** / **Python SDK v7.1.0** /
 **Java SDK v7.1.0** — same `X-Axonflow-Client` injection
- **Plugins** — Claude Code / Cursor / Codex v1.2.0; OpenClaw v2.2.0
 with Pro license token paste activating Pro features

axonflow-sdk-rust remains at v0.1.0 (preview); SDK-Rust will gain the
header in a future preview release.

## [7.0.0] - 2026-04-29 — Production, quality, and security hardening — upgrade encouraged

**Upgrade strongly recommended.** Over the past month we've shipped substantial production, quality, and security hardening across the AxonFlow SDKs and platform — upgrade to the latest major for a more secure, reliable, and bug-free experience.

**Security highlights from this release cycle:**
- **Webhook signing-key now exposed by SDK response type** (this release). The `secret` (HMAC-SHA256) field on `WebhookSubscription` — returned by `createWebhook` — was missing from the SDK type, so callers had no way to retrieve the signing key and webhook signature verification was effectively un-implementable. The field is now wired through end-to-end. Documented in [`GHSA-mph8-9v29-pm42`](https://github.com/getaxonflow/axonflow-sdk-typescript/security/advisories/GHSA-mph8-9v29-pm42).
- **`DO_NOT_TRACK` opt-out removed in favor of `AXONFLOW_TELEMETRY=off`** (this release). `DO_NOT_TRACK` was unreliable because host CLIs and runtimes commonly inject `DO_NOT_TRACK=1` regardless of user intent; an explicit AxonFlow-scoped opt-out is the only signal we honor now. JSDoc on `AxonFlowConfig` was updated so npm/IDE consumers no longer see the stale "honored" claim.
- **`prefer-nullish-coalescing` lint enforcement** (last cycle, v6.x). Blocks falsey-clobber bugs (`x.field || default` swallowing `false` / `0` / `""`) at PR time across the SDK source.

Major release across the AxonFlow SDK family. Companion releases ship the same day: TypeScript v7.0.0 / Python v7.0.0 / Go v7.0.0 (with `/v7` module path migration) / Java v7.0.0. The full set of platform-side security fixes shipped alongside this release is documented in the consolidated platform advisory [`GHSA-9h64-2846-7x7f`](https://github.com/getaxonflow/axonflow/security/advisories/GHSA-9h64-2846-7x7f).

**Reliability and bug-fix highlights:**
- **`retry_context` + `idempotency_key` for cross-step de-duplication** (last cycle, v6.x). Workflow steps that retry across pod restarts no longer record duplicate audit entries; idempotency_key flows end-to-end through MAP HITL approve/reject responses.
- **Plane-scoped pending-approvals parity** (last cycle, v6.x). MAP plane now exposes `/api/v1/plans/approvals/pending` mirroring the WCP plane queue; the SDK gained a typed `pendingApprovals()` accessor with full pagination and URLSearchParams encoding.
- **Wire-shape contract CI + transformer-coverage gate** (last cycle, v6.x). PR-blocking gate that catches drift between SDK types and platform OpenAPI before consumers hit it; transformer-coverage gate ensures every type field has an explicit serialization mapping.

### BREAKING

- **`DO_NOT_TRACK` is no longer honored as an AxonFlow telemetry opt-out.** Use `AXONFLOW_TELEMETRY=off` instead. Host tools and CLIs commonly inject `DO_NOT_TRACK=1` regardless of user intent, which makes it unreliable as a signal.

### Changed

- **Telemetry switched to a 7-day delivered-heartbeat.** At most one anonymous ping per environment every 7 days, with the stamp advanced only after the POST returns 2xx — a transient network failure doesn't silence telemetry until the next window. Concurrent stampedes are de-duplicated by an in-flight Promise. Restricted environments where no cache dir is available (e.g. AWS Lambda) fall back transparently to the previous "one ping per process" behavior.

### Fixed

- The `DO_NOT_TRACK=1 is deprecated.` `console.warn` is no longer emitted on every client construction when `DO_NOT_TRACK=1` is set.

## [6.2.0] - 2026-04-28 — listProviders() + example modernization

Minor release. New LLM-provider listing API closes the parity gap with the Java + Python SDKs; the rest of the cycle is example modernization and a non-breaking default-endpoint correction. Coordinated cycle: Python v6.9.0 / Go v6.0.0 (major: see SDKCompatibility breaking type change in that release) / Java v6.2.0 ship same day.

### Added

- **`client.listProviders(options?)`** — list configured LLM providers and their per-provider health snapshot. Calls `GET /api/v1/llm-providers`. New `LLMProvider`, `LLMProviderHealth`, and `ListProvidersOptions` types in `@axonflow/sdk`. Supports `type` and `enabled` filters. Closes the parity gap with the Java SDK's `listLLMProviders()` and the Python SDK's `list_providers()`.

### Fixed

- **`examples/basic/`** — rewritten to use the modern Gateway-Mode (`getPolicyApprovedContext` + `auditLLMCall`) and Proxy-Mode (`proxyLLMCall`) APIs. The previous version used the deprecated `protect()` helper (deprecated in v6.0.0).
- **`examples/connectors/`** — `installConnector()` now uses the correct snake-case `connector_id` (was `connectorId`) and supplies the required `tenant_id` (sourced from `AXONFLOW_TENANT_ID`, falls back to `AXONFLOW_CLIENT_ID`).
- **`examples/planning/`** — `PlanStep` field rename: `step.dependsOn` (was `step.dependencies`).
- **`examples/proxy-mode/`** — `client.executeQuery(.)` → `client.proxyLLMCall(.)` (renamed in v6.0.0).
- **All examples** — standardized on `import { AxonFlow } from '@axonflow/sdk'`; replaced the decommissioned `staging-eu.getaxonflow.com` default with `http://localhost:8080`.
- **`examples/README.md`** — corrected env-var names (`AXONFLOW_CLIENT_ID` / `AXONFLOW_CLIENT_SECRET`, not `AXONFLOW_API_KEY` / `AXONFLOW_TENANT`); runner instructions use `tsx` instead of `ts-node`.

### Changed

- **SDK default endpoint** is now `http://localhost:8080` (was `https://staging-eu.getaxonflow.com`). Constructing `new AxonFlow({.})` without an explicit `endpoint` previously routed every request to a host that was decommissioned 2026-04-09. Production callers passing an explicit `endpoint` are unaffected.
- **`AxonFlow.sandbox(.)`** now targets `http://localhost:8080` for the same reason. Override via the regular constructor for hosted environments.

## [6.1.0] - 2026-04-25 — Plugin Batch 1 explainability fields on MCP responses

Minor release. Surfaces fields the AxonFlow agent has emitted since v7.1.0 (Plugin Batch 1) but the SDK didn't declare. Pure field-additions on existing methods — no new SDK methods, no breaking changes. Documented in OpenAPI via platform v7.4.3.

Coordinated cycle: Python v6.8.0 / Go v5.8.0 / Java v6.1.0 ship same day with the same field set.

### Added

- **`MCPCheckInputResponse`** gains 5 optional Plugin Batch 1 fields:
 - `decision_id?: string` — audit correlator
 - `risk_level?: 'low' | 'medium' | 'high' | 'critical'`
 - `policy_matches?: MCPExplainPolicy[]` — per-policy explainability records (snake_case wire shape)
 - `override_available?: boolean` — whether session override is permitted for the matched policies
 - `override_existing_id?: string` — already-active override consumed by this decision (if any)
- **`MCPCheckOutputResponse`** gains 3 optional fields:
 - `decision_id?: string`
 - `policy_matches?: MCPExplainPolicy[]`
 - `redacted_message?: string` — text-redaction counterpart to `redacted_data` (used when the connector returned a string message rather than tabular rows; e.g. execute-style responses)
- **`MCPExplainPolicy`** — new exported interface for the per-policy explainability record on MCP responses (snake_case wire shape). Fields: `policy_id`, `policy_name?`, `action?`, `risk_level?`, `allow_override?`, `policy_description?`. Distinct from the existing camelCase `ExplainPolicy` (in `src/types/decisions.ts`), which is the hand-decoded view returned by `client.explainDecision()`. Both describe the same logical record; the dual-name distinction follows the SDK's existing wire-vs-decoded convention. A future release may consolidate.

All fields are optional. Pre-v7.1.0 platforms return `undefined` for every field; callers should treat absence as "context not available" rather than an error.

### Deferred

`client.explainDecision(decisionId)` and the full `ExplainRule` / `DecisionExplanation` shapes (returned by the `explain_decision` MCP tool) are tracked separately as feature work. This release ships only the field-surfacing on existing methods.

## [6.0.0] - 2026-04-25 — Major: PolicyInfo / MCPPolicyInfo rename + wire-shape canonicalization

This is a major release. Coordinated with the Java SDK v6.0.0 release as a v6 alignment cycle for the SDKs that needed breaking changes; Python (v6.7.0) and Go (v5.7.0) ship as minor on the same day because their changes are purely additive.

### BREAKING — `PolicyInfo` reassignment

`PolicyInfo` and `MCPPolicyInfo` referred to two different concepts in v5.x:

- `PolicyInfo` (in `src/types/proxy.ts`) was the proxy-mode shape returned by `/api/request` — fields like `policiesEvaluated`, `staticChecks`, `processingTime`, `tenantId`, `codeArtifact`.
- `MCPPolicyInfo` (in `src/types/connector.ts`) was the MCP shape returned by `/api/v1/mcp/check-input` and friends — fields like `policies_evaluated`, `blocked`, `block_reason`, `processing_time_ms`, `matched_policies`. **This is what the OpenAPI spec calls `PolicyInfo`.**

The naming has been swapped to align with the OpenAPI spec:

| In v5.x | In v6.0.0 |
|--|--|
| `PolicyInfo` (proxy shape) | **`ProxyPolicyInfo`** (renamed) |
| `MCPPolicyInfo` (MCP shape) | **`PolicyInfo`** (renamed; matches OpenAPI spec) |

Migration:

- If you imported `PolicyInfo` to read proxy-mode `/api/request` responses, change to `ProxyPolicyInfo` (or use the `PolicyInfoLegacyProxyShape` type alias as a one-major-version shim).
- If you imported `MCPPolicyInfo` for MCP responses, change to `PolicyInfo`. The `MCPPolicyInfo` name is kept as a `type` alias for one major-version migration window and will be removed in v7.0.0.

This was previously hidden by the naming collision — code reading `response.policyInfo` on `ExecuteQueryResponse` continues to work because the property type is now `ProxyPolicyInfo` with the same fields. The break only affects code that imported the type names by hand.

### Added

- **`WebhookSubscription.secret`** — HMAC-SHA256 signing key now exposed on the response from `createWebhook`. Required to verify the `X-AxonFlow-Signature` header on inbound webhook deliveries; without it, callers couldn't validate payload authenticity. Also adds `org_id` and `tenant_id` (ownership scoping).
- **`StepGateRequest`** carries `cost_usd`, `tokens_in`, `tokens_out` so budget-based policies can evaluate gate-time cost estimates.
- **`StepGateResponse.decision_id`** — unique audit correlator that links a gate response to its audit row (previously absent on the SDK, present on the wire).
- **`StepGateResponse.policies_evaluated` / `policies_matched`** (snake_case wire-canonical). The previous camelCase `policiesEvaluated` / `policiesMatched` always read `undefined` because the gate decoder is JSON.parse passthrough; both forms are kept (camel marked `@deprecated`) to preserve type-compat. Removed in v7.
- **`ListWorkflowsResponse.limit` / `offset`** — pagination echo, surfaced on the response.
- **`StaticPolicy.policy_id` / `priority` / `has_override`** — wire-canonical fields surfaced. `hasOverride` (camelCase) kept as `@deprecated` alias; it has always read `undefined` against the JSON.parse passthrough decoder.
- **`CreateStaticPolicyRequest.priority` / `tags`** and **`UpdateStaticPolicyRequest.priority` / `tags`** — match the spec.
- **`UpdatePlanRequest.metadata`** — accept arbitrary plan metadata, opaque to the platform.
- **`UsageBreakdownItem.group_by`** — dimension name (provider/model/agent/etc.) is now exposed on each item.
- **`BudgetAlert.acknowledged`** — alert dismissal flag.
- **`Budget.org_id` / `tenant_id`** — ownership scoping.
- **`UsageRecord`** gains `created_at`, `success`, `error_message`, `latency_ms`, `team_id`, `tenant_id`, `user_id`, `workflow_id` to match the wire. The legacy `timestamp` field is `@deprecated`; the decoder reads `r.timestamp`, but the wire emits `created_at`, so `timestamp` has always read `undefined`.
- **`WorkflowStatusResponse.metadata`** — arbitrary workflow metadata.
- **`CreateWorkflowResponse.started_at`** — wire-canonical timestamp. Legacy `created_at` and `source` are `@deprecated`; they have always read `undefined` (wire emits neither).
- **`ExecutionSnapshot.retryCount`** — number of retry attempts on a step.
- **`Finding.article`** — regulatory article reference (e.g. MAS FEAT principle number).
- **`PolicyOverride.id` / `enabled_override`** — wire-canonical fields. `active` is `@deprecated`; the wire emits `enabled_override`, so `active` has always read `undefined`.
- **`PolicyVersion.id` / `policy_id` / `change_summary` / `snapshot`** — match the wire shape (versions are immutable snapshots, not before/after diffs). `changeDescription`, `previousValues`, `newValues` are `@deprecated` orphan-reads.
- **`DynamicPolicyMatch.message`** — wire-canonical name. `reason` is `@deprecated` (read `undefined` today).
- **`ExfiltrationCheckInfo.exceeded` / `limit_type`** — match the wire. `within_limits` is `@deprecated`.
- **`CancelPlanResponse.success`** — wire-canonical boolean. `message` is `@deprecated` (orphan read).
- **`PlanResponse`** gains the wire top-level fields `success`, `version`, `result`, `error`, `workflow_execution_id`, `policy_info`. The decoder is JSON.parse passthrough, so consumers can now read these directly.
- **`EffectivePoliciesResponse`** gains the tier-stratified wire shape (`static`, `dynamic`, `tenant_id`, `organization_id`, `computed_at`). Legacy `policies` flat array and `inheritance` summary kept as SDK-side conveniences.
- **`Policy`** gains the rich wire shape (`policy_id`, `category`, `tier`, `pattern`, `severity`, `action`, `actions`, `conditions`, `description`, `organization_id`, `tenant_id`, `created_at`/`_by`, `updated_at`/`_by`, `version`). The legacy rules-only shape has only seen ~5 of 21 wire fields.
- **`ResumePlanResponse.result`** — final aggregated result (canonical wire field). The interface previously declared 5 fields (`workflowId`, `message`, `stepResult`, `nextStep`, `nextStepName`, `totalSteps`) that the transformer never populated; all 5 are now `@deprecated`.

### Fixed

- Telemetry path is bounded at `TELEMETRY_TIMEOUT_MS` (3s) total; the `/health` probe and checkpoint POST share a single monotonic deadline instead of stacking independent timeouts. Aligns with python/go/java SDKs.

### Notes

The above is an audit-driven sweep against the wire-shape contract gate. The validator now snake_case-normalizes TS interface field names against transformer evidence in `client.ts` (matching what pydantic alias / Go `json:"…"` tag / Java `@JsonProperty(…)` do natively in the other SDKs). The `@deprecated` marks above are set on fields that historically read `undefined` against the JSON.parse-passthrough decoder paths — keeping the typed name kept compile-time compat for callers that referenced the now-dead names. Removal scheduled for v7.

Two platform-side spec corrections filed alongside this work, for issues the audit surfaced where the spec was wrong (server emits the SDK's name): `AISystemRegistry.materiality_classification` and `DynamicPolicyInfo` schema. No SDK change for those — the SDK is correct.

## [5.6.0] - 2026-04-22

### Added

- **Rich `ApproveStepResponse` / `RejectStepResponse`** — both types now carry
 the same shape as the step-gate response: `decision` resolves to `"allow"` /
 `"block"`, `retry_context` mirrors the gate retry state, `approved_by` /
 `approved_at` / `rejected_by` / `rejected_at` carry reviewer identity,
 `approval_id` is the deterministic HITL queue UUID, `policies_matched`
 reconstructs the governance trail. Legacy fields (`workflow_id`, `step_id`,
 `status`) are preserved for back-compat.
- **`plan_id` on both approve/reject responses** — populated when the response
 comes from the MAP plan-scoped endpoint (`/api/v1/plans/{id}/steps/{step_id}/approve|reject`);
 empty on WCP plane responses. Same SDK types work across both endpoints.
- **`getPendingPlanApprovals`** — new client method that lists MAP-plane
 pending approvals (`GET /api/v1/plans/approvals/pending`), the counterpart
 of `getPendingApprovals` for the WCP plane. Accepts an optional `plan_id`
 filter via `PendingApprovalsOptions` so reviewer tools can scope the listing
 to one plan. Available on Evaluation+ licenses (same tier gate as the MAP
 step approve/reject endpoints).
- **`PendingApproval.plan_id`** — populated on MAP-plane entries, absent on
 WCP-plane entries. Mirrors the approve/reject asymmetry. `PendingApproval`
 also gains `step_index`, `decision`, `decision_reason`, `policies_matched`,
 `step_input`, and `approval_status` so reviewer tools can render the full
 approval context without a second request.

### Fixed

- **`approveStep` / `rejectStep` / `getPendingApprovals` endpoint URLs** — all
 three previously targeted non-existent paths under `/api/v1/workflow-control/`
 and would fail against a real AxonFlow server. Corrected to the canonical
 `/api/v1/workflows/{id}/steps/{step_id}/(approve|reject)` and
 `/api/v1/workflows/approvals/pending` routes. Customers using these methods
 against a live deployment were receiving 404s; this release makes them work.
- **`PendingApprovalsResponse` field names aligned with the wire shape** — the
 interface previously declared `approvals` and `total`, which never matched
 the server response (`pending_approvals` and `count`). Renamed to
 `pending_approvals` / `count`. Callers that read `response.approvals` or
 `response.total` need to update to the new names.

### Deprecated

- `DO_NOT_TRACK=1` as an AxonFlow telemetry opt-out — scheduled for removal after 2026-05-05 in the next major release. Use `AXONFLOW_TELEMETRY=off` instead. The SDK emits a one-line migration warning when `DO_NOT_TRACK=1` is the active control and `AXONFLOW_TELEMETRY=off` is not also set.

### Unchanged

- `approveStep(workflowId, stepId)` / `rejectStep(workflowId, stepId, reason?)`
 signatures are unchanged — only the response fields grew. Callers that only
 read `workflow_id` / `step_id` / `status` keep working.

## [5.5.0] - 2026-04-21

### Added

- **`retry_context` and `idempotency_key` support on the step gate** — `StepGateResponse`
 now carries a non-nullable `retry_context` object on every gate call with the true
 `(workflow_id, step_id)` lifecycle: `gate_count`, `completion_count`,
 `prior_completion_status` (`'none' | 'completed' | 'gated_not_completed'`),
 `prior_output_available`, `prior_output`, `prior_completion_at`, `first_attempt_at`,
 `last_attempt_at`, `last_decision`, and `idempotency_key`. Prefer these fields to
 the legacy `cached` / `decision_source` fields.
- **`stepGate(., options)`** — new optional fourth argument
 `{ includePriorOutput?: boolean }`. When `true`, the SDK sends
 `?include_prior_output=true` and `retry_context.prior_output` is populated when a
 prior `/complete` has landed. Existing callers that omit `options` behave unchanged.
- **`StepGateRequest.idempotency_key`** — caller-supplied opaque business-level key
 (max 255 chars). Immutable once recorded on the first gate call for a
 `(workflow_id, step_id)`; subsequent gate/complete calls must pass the same key.
- **`MarkStepCompletedRequest.idempotency_key`** — must match the key set on the
 corresponding gate call, if any. Mismatch (including missing-vs-set on either side)
 surfaces as a typed `IdempotencyKeyMismatchError`.
- **`IdempotencyKeyMismatchError`** — typed error thrown by `stepGate` and
 `markStepCompleted` when the platform returns HTTP 409 with
 `error.code === "IDEMPOTENCY_KEY_MISMATCH"`. Surfaces `workflowId`, `stepId`,
 `expectedIdempotencyKey`, `receivedIdempotencyKey`, and the human-readable `message`.
- **`RetryContext`, `PriorCompletionStatus`, `StepGateOptions`** — exported TypeScript
 types.

### Deprecated

- **`StepGateResponse.cached`** and **`StepGateResponse.decision_source`** — still
 populated but deprecated in favor of `retry_context.gate_count > 1` and
 `retry_context.prior_completion_status`. Planned for removal in a future major version.

### Compatibility

Companion to the platform change that introduces `retry_context` on
`POST /api/v1/workflows/{workflow_id}/steps/{step_id}/gate`. Additive only — existing
callers that never set `idempotency_key` or `includePriorOutput` see no behavior change.

## [5.4.0] - 2026-04-18

### Added

- **Execution boundary semantics** — `RetryPolicy` type union
 (`'idempotent' | 'reevaluate'`). Step gate requests accept `retry_policy`
 to control cached vs fresh evaluation behavior.
- **Step gate response metadata** — `cached` (boolean) and `decision_source`
 (string) fields on `StepGateResponse`.
- **Workflow checkpoints** — `getCheckpoints(workflowId)` lists step-gate
 checkpoints. `resumeFromCheckpoint(workflowId, checkpointId)` resumes
 from a specific checkpoint with fresh policy evaluation (Enterprise).
- **Checkpoint types** — `Checkpoint`, `CheckpointListResponse`, and
 `ResumeFromCheckpointResponse` interfaces.
- **`AxonFlow.explainDecision(decisionId)`** — fetches the full explanation for a
 previously-made policy decision via `GET /api/v1/decisions/:id/explain`.
 Returns a `DecisionExplanation` with matched policies, risk level, reason,
 override availability, existing override ID (if any), and a rolling-24h
 session hit count for the matched rule. Shape is frozen; additive-only
 fields ensure forward compatibility.
- **`DecisionExplanation`, `ExplainPolicy`, `ExplainRule`** — new TypeScript
 interfaces exported from `@axonflow/sdk`.
- **`AuditSearchRequest.decisionId`, `.policyName`, `.overrideId`** — three
 new optional filter fields on `searchAuditLogs`. Use `decisionId` to gather
 every record tied to one decision; `policyName` to find everything matched
 by a specific policy; `overrideId` to reconstruct an override's full
 lifecycle (`override_created` → `override_used` → `override_expired | override_revoked`).

### Compatibility

Companion to platform v7.1.0. Works against plugin releases (OpenClaw v1.3.0+,
Claude Code v0.5.0+, Cursor v0.5.0+, Codex v0.4.0+) that surface the
`DecisionExplanation` shape. Audit filter fields pass through when unset;
server-side filtering activates on v7.1.0+ platforms.

## [5.3.0] - 2026-04-09

### Added

- `AXONFLOW_TRY=1` environment variable to connect to `try.getaxonflow.com` shared evaluation server
- `registerTry()` helper in `@axonflow/sdk/community` for self-registering a tenant
- Checkpoint telemetry reports `endpoint_type: "community-saas"` when try mode is active

---

## [5.2.0] - 2026-04-08

### Added

- **Telemetry `endpoint_type` field.** The anonymous telemetry ping now includes an SDK-derived classification of the configured AxonFlow endpoint as one of `localhost`, `private_network`, `remote`, or `unknown`. The raw URL is never sent and is not hashed. This helps distinguish self-hosted evaluation from real production deployments on the checkpoint dashboard. Opt out as before via `DO_NOT_TRACK=1` or `AXONFLOW_TELEMETRY=off`.
- **`classifyEndpoint(url)` and `EndpointType` type** exported from `src/telemetry.ts` for applications that want to inspect the classification.

### Changed

- Examples and documentation updated to reflect the new AxonFlow platform v6.2.0 defaults for `PII_ACTION` (now `warn` — was `redact`) and the new `AXONFLOW_PROFILE` env var. No SDK API changes.

---

## [5.1.0] - 2026-04-06

### Added

- **`GovernedTool` adapter** — framework-agnostic tool governance wrapper. Wraps any `ToolDefinition` with input/output policy enforcement (`mcpCheckInput` before execution, `mcpCheckOutput` after). Helper: `governTools(tools, client)`.
- **`checkToolInput()` / `checkToolOutput()`** — generic aliases for tool governance. Existing `mcpCheckInput()` / `mcpCheckOutput()` remain supported.

### Changed

- Anonymous telemetry is now enabled by default for all endpoints, including localhost/self-hosted evaluation. Opt out with `DO_NOT_TRACK=1` or `AXONFLOW_TELEMETRY=off`.

---

## [5.0.0] - 2026-04-05

### BREAKING CHANGES

- **`X-Tenant-ID` header removed.** The SDK no longer sends `X-Tenant-ID`. The server derives tenant from OAuth2 Client Credentials (Basic auth). Requires platform v6.0.0+.
- **`materialityClassification` field renamed.** MAS FEAT `materiality` renamed to `materialityClassification` to match server JSON field `materiality_classification`.

### Added

- **`Status` field on `PlanResponse`.** The server returns plan status (pending, executing, completed, failed, cancelled) which was previously not parsed by the SDK.

### Fixed

- **MCP examples missing `client_id` and `user_token`** in request body for enterprise MCP handler authentication.

---

## [4.3.1] - 2026-04-01

### Security

- Bumped `handlebars` from 4.7.8 to 4.7.9 — fixes 7 vulnerabilities including JS injection via AST type confusion, prototype pollution leading to XSS, and DoS via malformed decorator syntax
- Bumped `picomatch` from 2.3.1 to 2.3.2 — fixes ReDoS via extglob quantifiers and method injection in POSIX character classes
- Bumped `brace-expansion` from 1.1.12 to 1.1.13 and 2.0.2 to 2.0.3 — fixes memory exhaustion via zero-step sequences

---

## [4.3.0] - 2026-03-25

### Added

- `simulatePolicies()` — dry-run all active policies against an input query. Returns allowed/blocked status, applied policies, risk score, and daily usage. Requires Evaluation tier or above.
- `getPolicyImpactReport()` — test a single policy against multiple inputs and get aggregate match/block statistics.
- `detectPolicyConflicts()` — analyze active policies for contradictions, shadows, and redundancies. Optionally filter to conflicts involving a specific policy.
- Types: `SimulatePoliciesRequest`, `SimulatePoliciesResponse`, `SimulationDailyUsage`, `ImpactReportInput`, `ImpactReportRequest`, `ImpactReportResult`, `ImpactReportResponse`, `PolicyConflictRef`, `PolicyConflict`, `PolicyConflictResponse`

### Fixed

- ESM build: `fix-esm-imports.js` post-build script now appends `.js` extension to parent-directory imports (`../errors`, `../types`, etc.) in addition to same-directory imports. Previously, the regex only matched `./` prefixed imports, causing `ERR_MODULE_NOT_FOUND` at runtime when consuming the ESM bundle in Node.js.

### Security

- Bumped `flatted` from 3.3.3 to 3.4.2 — fixes Prototype Pollution via `parse()` (GHSA-rf6f-7fwh-wjgh) and unbounded recursion DoS (GHSA-25h7-pfq9-p65f)
- Bumped `fast-xml-parser` from 5.3.6 to 5.5.8 via `@aws-sdk/xml-builder` 3.972.15 — fixes entity expansion limit bypass (GHSA-jp2q-39xq-3w4g, GHSA-8gc5-j5rx-235r) and stack overflow in XMLBuilder (GHSA-fj3w-jwp8-x2g3)
- Bumped `minimatch` from 3.1.2 to 3.1.5 and 9.0.5 to 9.0.9 — fixes multiple ReDoS vulnerabilities (GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74)
- Bumped `ajv` from 6.12.6 to 6.14.0 — fixes ReDoS when using `$data` option (GHSA-2g4f-4pwh-qvx6)

---

## [4.2.0] - 2026-03-17

### Added

- `AxonFlowLangGraphAdapter` class — wraps LangGraph workflows with AxonFlow governance gates and per-tool policy enforcement. Includes:
 - `checkGate()` / `stepCompleted()` — step-level governance at LangGraph node boundaries
 - `checkToolGate()` / `toolCompleted()` — per-tool governance within tool_call nodes (each tool gets its own gate check)
 - `mcpToolInterceptor()` — factory returning an interceptor that enforces `mcp_check_input → handler → mcp_check_output` around every MCP tool call
 - `waitForApproval()` — poll until a step is approved or rejected
 - `startWorkflow()` / `completeWorkflow()` / `abortWorkflow()` / `failWorkflow()` — workflow lifecycle management
- `WorkflowBlockedError` and `WorkflowApprovalRequiredError` exception classes
- `MCPInterceptorOptions` and `LangGraphAdapterOptions` configuration interfaces
- `getCircuitBreakerStatus()` — query active circuit breaker circuits and emergency stop state
- `getCircuitBreakerHistory(limit)` — retrieve circuit breaker trip/reset audit trail
- `getCircuitBreakerConfig(tenantId)` — get effective circuit breaker config (global or tenant-specific)
- `updateCircuitBreakerConfig(config)` — update per-tenant circuit breaker thresholds

---

## [4.1.0] - 2026-03-14

### Added

- `auditToolCall()` — record non-LLM tool calls (API, MCP, function) in the audit trail. Returns audit ID, status, and timestamp. Requires Platform v5.1.0+
- `getAuditLogsByTenant()` — retrieve audit logs for a tenant with optional pagination
- `searchAuditLogs()` — search audit logs with filters (client ID, request type, limit)

### Fixed

- Telemetry pings now suppressed for localhost/127.0.0.1 endpoints unless `telemetryEnabled` is explicitly set to `true`. Prevents telemetry noise during local development and E2E testing.
- Build script now stamps `VERSION` constant from `package.json`, fixing telemetry reporting stale SDK version.

---

## [4.0.1] - 2026-03-12

### Fixed

- Default `mode` now always resolves to `'production'` regardless of whether credentials are provided, matching behavior of Python, Go, and Java SDKs

---

## [4.0.0] - 2026-03-09

### Breaking Changes

- **Removed `total_steps` from `CreateWorkflowRequest`**. Requires Platform v4.5.0+ (recommended v5.0.0+).
 Total steps are auto-computed when the workflow reaches a terminal state.
- **`mcpCheckInput()` default `operation` changed from `"query"` to `"execute"`**. Callers relying on
 the implicit `"query"` default must now pass `operation: "query"` explicitly.
 Aligns TypeScript SDK behavior with Python, Java, and Go SDKs.

### Note

`MediaAnalysisResult.extractedText` was replaced by `hasExtractedText` + `extractedTextLength`
in v3.5.0. This major version formally acknowledges that breaking change.

---

## [3.8.0] - 2026-03-03

### Added

- `healthCheck()` now returns `capabilities` array and `sdkCompatibility` in `HealthStatus`
- Static `hasCapability(health, name)` method on `AxonFlow` to check if platform supports a specific feature
- User-Agent header (`axonflow-sdk-typescript/{version}`) sent on all HTTP requests
- Version mismatch warning logged when SDK version is below platform's `min_sdk_version`
- `PlatformCapability` and `SDKCompatibility` interfaces in types
- `trace_id` field on `CreateWorkflowRequest`, `CreateWorkflowResponse`, `WorkflowStatusResponse`, and `ListWorkflowsOptions` for distributed tracing correlation
- `ToolContext` interface for per-tool governance within workflow steps
- `tool_context` field on `StepGateRequest` for tool-level policy enforcement
- `listWorkflows()` now supports `trace_id` filter parameter
- Anonymous runtime telemetry for version adoption tracking and feature usage signals
- `TelemetryEnabled` / `telemetry` configuration option to explicitly control telemetry
- `AXONFLOW_TELEMETRY=off` and `DO_NOT_TRACK=1` environment variable opt-out support

### Removed

- Removed `@scarf/scarf` install-time telemetry in favor of privacy-preserving runtime telemetry

### Fixed

- `VERSION` constant corrected from `3.3.1` to `3.8.0`

---

## [3.7.0] - 2026-02-28

### Added

- **MCP Policy-Check Endpoints** (Platform v4.6.0+): Standalone policy validation for external orchestrators (LangGraph, CrewAI) to enforce AxonFlow policies without executing connector queries
 - `mcpCheckInput(options)`: Validate SQL/commands against input policies (SQLi detection, dangerous query blocking, PII in queries, dynamic policies). Returns `allowed: true` or `blockReason` with details
 - `mcpCheckOutput(options)`: Validate MCP response data against output policies (PII redaction, exfiltration limits, dynamic policies). Returns original or redacted data with `policyInfo`
 - New types: `MCPCheckInputOptions`, `MCPCheckInputResponse`, `MCPCheckOutputOptions`, `MCPCheckOutputResponse`
 - Supports both query-style (`responseData`) and execute-style (`message` + `metadata`) output validation

---

## [3.6.0] - 2026-02-22

### Added

- Media governance configuration methods: `getMediaGovernanceConfig()`, `updateMediaGovernanceConfig()`, `getMediaGovernanceStatus()`
- Media governance types: `MediaGovernanceConfig`, `MediaGovernanceStatus`
- Media policy category constants: `CATEGORY_MEDIA_SAFETY`, `CATEGORY_MEDIA_BIOMETRIC`, `CATEGORY_MEDIA_PII`, `CATEGORY_MEDIA_DOCUMENT`
- `markStepCompleted()` now accepts post-execution metrics (`tokens_in`, `tokens_out`, `cost_usd`) via `MarkStepCompletedRequest`

### Fixed

- `updateMediaGovernanceConfig()` no longer manually reconstructs the request body field-by-field; passes the config object directly (server handles partial updates)

---

## [3.5.0] - 2026-02-19

### Added

- **Media Governance Types**: `MediaContent`, `MediaAnalysisResult`, `MediaAnalysisResponse` for multimodal image governance
- **Media support in `proxyLLMCall()`**: Pass images (base64 or URL) via the `media` option for governance analysis before LLM routing

### Breaking

- `MediaAnalysisResult.extractedText` replaced by `hasExtractedText` (boolean) and `extractedTextLength` (number). Raw extracted text is no longer exposed in API responses.

---

## [3.4.0] - 2026-02-13

### Added

- **failWorkflow()**: Fail a workflow with optional reason
 - `async failWorkflow(workflowId: string, reason?: string): Promise<void>`
 - Sends `POST /api/v1/workflows/{id}/fail`
- **HITL Queue API** (Enterprise): Human-in-the-loop approval queue management
 - `listHITLQueue(opts?)`: list pending approvals with filtering
 - `getHITLRequest(requestId)`: get approval details
 - `approveHITLRequest(requestId, review)`: approve a request
 - `rejectHITLRequest(requestId, review)`: reject a request
 - `getHITLStats()`: dashboard statistics
 - New types: `HITLApprovalRequest`, `HITLQueueListOptions`, `HITLQueueListResponse`, `HITLReviewInput`, `HITLStats`

## [3.3.1] - 2026-02-12

### Fixed

- `streamExecutionStatus()` used incorrect endpoint path (`/api/v1/executions/{id}/stream` → `/api/v1/unified/executions/{id}/stream`), causing 404 errors when streaming execution status updates

## [3.3.0] - 2026-02-10

### Breaking Changes

- **Removed `executeQuery()`**: Use `proxyLLMCall()` instead (deprecated since v2.7.0)
- **Removed deprecated interceptors**: `wrapOpenAIClient`, `wrapAnthropicClient`, `wrapGeminiModel`, `wrapOllamaClient`, `wrapBedrockClient` (all deprecated since v2.0.0). Entire `src/interceptors/` directory removed.
- **Removed `ExecuteQueryOptions` and `ExecuteQueryResponse` from public API**: Types kept internally for `proxyLLMCall()` but no longer exported from package index

### Added

- **WCP Approval Gates**: HITL approval and rejection for workflow steps
 - `approveStep(workflowId, stepId)` - Approve a pending workflow step
 - `rejectStep(workflowId, stepId, reason?)` - Reject a step with optional reason
 - `getPendingApprovals(options?)` - List steps awaiting human approval

- **MAP Plan Cancellation**: Cancel running multi-agent plans
 - `cancelPlan(planId, reason?)` - Cancel a plan with optional reason

- **MAP Plan Update**: Modify plan configuration before or during execution
 - `updatePlan(planId, request)` - Update execution mode, domain, or version

- **MAP Plan Versioning and Rollback**: Version history and rollback support
 - `getPlanVersions(planId)` - List plan version history
 - `rollbackPlan(planId, version)` - Rollback to a previous version (returns 409 on version conflict)
 - New types: `RollbackPlanResponse` (with `planId`, `version`, `previousVersion`, `status`), `PlanVersion`

- **Webhook Subscriptions**: Event notification management
 - `createWebhook(request)` - Create a webhook subscription for gate decisions, workflow events
 - `listWebhooks()` - List active webhook subscriptions
 - `getWebhook(webhookId)` - Get webhook subscription details
 - `updateWebhook(webhookId, request)` - Update webhook URL, events, or secret
 - `deleteWebhook(webhookId)` - Delete a webhook subscription
 - New type: `WebhookSubscription`

- **Unified Execution Cancellation**: Cancel running executions across both MAP and WCP subsystems
 - `cancelExecution(executionId, reason?)` - Cancel a unified execution via `POST /api/v1/unified/executions/{id}/cancel`
 - Propagates to MAP `cancelPlan()` or WCP `abortWorkflow()` based on execution type

- **Unified Execution Tracking**: Consistent status tracking for MAP plans and WCP workflows
 - `getExecutionStatus(executionId)` - Get unified execution status by ID
 - `listUnifiedExecutions(options)` - List executions with type/status filters
 - `ExecutionStatus` type with unified fields for both MAP and WCP executions
 - `ExecutionType` enum: `map_plan`, `wcp_workflow`
 - `ExecutionStatusValue` enum: `pending`, `running`, `completed`, `failed`, `cancelled`, `aborted`, `expired`
 - `StepStatusValue` enum: `pending`, `running`, `completed`, `failed`, `skipped`, `blocked`, `approval`
 - `UnifiedStepType` enum: `llm_call`, `tool_call`, `connector_call`, `human_task`, `synthesis`, `action`, `gate`
 - `UnifiedStepStatus` type with step-level details (duration, cost, policy decisions)
 - `ExecutionHelpers` utilities: `isTerminal()`, `isStepTerminal()`, `isStepBlocking()`, `calculateProgress()`, `getCurrentStep()`, `calculateTotalCost()`, `isMapPlan()`, `isWcpWorkflow()`
 - Consistent response format across MAP Multi-Agent Planning and WCP Workflow Control Plane

- **Workflow Control Plane**: Governance gates for external orchestrators
 - "LangChain runs the workflow. AxonFlow decides when it's allowed to move forward."
 - `createWorkflow()` - Register workflows from LangChain/LangGraph/CrewAI/external
 - `stepGate()` - Check if step is allowed to proceed (allow/block/require_approval)
 - `markStepCompleted()` - Mark a step as completed with optional output data
 - `getWorkflow()` - Get workflow status and step history
 - `listWorkflows()` - List workflows with filters (status, source, pagination)
 - `completeWorkflow()` - Mark workflow as completed
 - `abortWorkflow()` - Abort workflow with reason
 - `resumeWorkflow()` - Resume after approval
 - New types: `WorkflowStatus`, `WorkflowSource`, `GateDecision`, `StepType`, `ApprovalStatus`, `MarkStepCompletedRequest`
 - Helper utilities in `WorkflowHelpers`: `isAllowed()`, `isBlocked()`, `requiresApproval()` (gate decisions)
 - Helper utilities in `WorkflowHelpers`: `isTerminal()` (workflow status)

- **Workflow Policy Enforcement**: Policy transparency for workflow operations
 - `StepGateResponse` now includes `policiesEvaluated` and `policiesMatched` fields with `PolicyMatch` type
 - `PolicyMatch` interface with `policy_id`, `policy_name`, `action`, `reason` for policy transparency
 - `PolicyEvaluationResult` interface for MAP execution with `allowed`, `applied_policies`, `risk_score`
 - Workflow operations (`workflow_created`, `workflow_step_gate`, `workflow_completed`) logged to audit trail

- **MAS FEAT Compliance Module** (Enterprise): Singapore financial services AI governance
 - AI System Registry: `masfeat.registerSystem()`, `masfeat.getSystem()`, `masfeat.updateSystem()`, `masfeat.listSystems()`, `masfeat.activateSystem()`, `masfeat.retireSystem()`, `masfeat.getRegistrySummary()`
 - 3-Dimensional Risk Rating: Customer Impact × Model Complexity × Human Reliance
 - Materiality Classification: High (sum≥12), Medium (sum≥8), Low (sum<8)
 - FEAT Assessments: `masfeat.createAssessment()`, `masfeat.getAssessment()`, `masfeat.updateAssessment()`, `masfeat.listAssessments()`, `masfeat.submitAssessment()`, `masfeat.approveAssessment()`, `masfeat.rejectAssessment()`
 - Assessment Lifecycle: pending → in_progress → completed → approved/rejected
 - Kill Switch: `masfeat.getKillSwitch()`, `masfeat.configureKillSwitch()`, `masfeat.checkKillSwitch()`, `masfeat.triggerKillSwitch()`, `masfeat.restoreKillSwitch()`, `masfeat.enableKillSwitch()`, `masfeat.disableKillSwitch()`, `masfeat.getKillSwitchHistory()`
 - Automatic model shutdown based on accuracy, bias, and error rate thresholds
 - New types: `AISystemRegistry`, `AISystemUseCase`, `MaterialityClassification`, `SystemStatus`, `FEATAssessment`, `FEATAssessmentStatus`, `FEATPillar`, `KillSwitch`, `KillSwitchStatus`, `KillSwitchEvent`, `KillSwitchEventType`, `RegistrySummary`

- **MCP Exfiltration Detection**: `MCPPolicyInfo` now includes `exfiltration_check` with row/volume limit information
 - `ExfiltrationCheckInfo` type with `rows_returned`, `row_limit`, `bytes_returned`, `byte_limit`, `within_limits` fields
 - Prevents large-scale data extraction via MCP queries
 - Configurable via `MCP_MAX_ROWS_PER_QUERY` and `MCP_MAX_BYTES_PER_QUERY` environment variables

- **MCP Dynamic Policies**: `MCPPolicyInfo` now includes `dynamic_policy_info` for Orchestrator-evaluated policies
 - `DynamicPolicyInfo` type with `policies_evaluated`, `matched_policies`, `orchestrator_reachable`, `processing_time_ms`
 - `DynamicPolicyMatch` type with `policy_id`, `policy_name`, `policy_type`, `action`, `reason`
 - Supports rate limiting, budget controls, time-based access, and role-based access policies
 - Optional feature - enable via `MCP_DYNAMIC_POLICIES_ENABLED=true`

- **`wasRedacted()` helper**: Convenience method on `ConnectorResponse` to check if any fields were redacted by PII policies

- **Dynamic policy tier support**: `tier` (`PolicyTier`) and `organizationId` fields on `CreateDynamicPolicyRequest`, `UpdateDynamicPolicyRequest`, and `DynamicPolicy` response. Defaults to `tenant` when not specified.
- **`ListDynamicPoliciesOptions` filters**: Filter dynamic policies by `tier` and `organizationId`, matching static policy list options.

- **proxyLLMCall()**: New primary method for Proxy Mode with improved documentation
 - Clearly describes Proxy Mode behavior (AxonFlow makes the LLM call on your behalf)
 - Documents when to use Proxy Mode vs Gateway Mode

- **BudgetInfo**: `QueryResponse.budgetInfo` for budget enforcement (HTTP 402)

- **Analytics**: Added optional install analytics via Scarf (opt-out: `SCARF_NO_ANALYTICS=1`)

### Changed

- Updated all internal references and examples from `executeQuery` to `proxyLLMCall`
- **Gateway Mode smart defaults**: `getPolicyApprovedContext()` and `auditLLMCall()` now use `"community"` as default clientId when not configured, enabling zero-config usage for community/self-hosted deployments

### Fixed

- **`executePlan` status hardcoded**: `executePlan()` always returned `status: 'completed'` regardless of actual server response. Now reads status from response (`data.status` > `metadata.status` > default), correctly surfacing `'awaiting_approval'` for WCP confirm mode.
- **Unified execution API URLs**: `getExecutionStatus()` and `listUnifiedExecutions()` now use correct `/api/v1/unified/executions` path (was incorrectly pointing to `/api/v1/executions` which is the Execution Replay API)
- **`RollbackPlanResponse` field naming**: Response fields use camelCase (`planId`, `previousVersion`) consistent with TypeScript conventions
- **Gateway Mode smart defaults**: Fixed fallback to `"community"` when no clientId is configured - previously defaulted to `"default"` due to tenant default value
- **PolicyCategory**: Added `pii-singapore` to PolicyCategory type for Singapore PII detection policies (NRIC, FIN, UEN patterns)

---

## [2.3.0] - 2026-01-09

### Added

- **MCP Policy Enforcement Response Fields**: `mcpQuery()` and `mcpExecute()` now return policy enforcement metadata
 - `redacted: boolean` - Whether any fields were redacted by PII policies
 - `redacted_fields: string[]` - JSON paths of redacted fields (e.g., `rows[0].ssn`)
 - `policy_info: PolicyInfo` - Full policy evaluation metadata

- **PolicyInfo types**: New types for policy enforcement metadata
 - `PolicyInfo` - Contains `policies_evaluated`, `blocked`, `block_reason`, `redactions_applied`, `processing_time_ms`, `matched_policies`
 - `PolicyMatchInfo` - Details of matched policies including `policy_id`, `policy_name`, `category`, `severity`, `action`

---

## [2.2.0] - 2026-01-08

### Added

- **OAuth2-style client credentials**: New `clientId` and `clientSecret` configuration options following OAuth2 client credentials pattern.
 - `clientId` is used for request identification (required for most API calls)
 - `clientSecret` is optional - community/self-hosted deployments work without it
 - The old `tenant` field still works as a fallback for `clientId`

- **Improved error types**: Added `ConnectorError` and `PlanExecutionError` classes for better error handling in connector and MAP operations.

- **Enterprise: Close PR** (`closePR`): Close a PR without merging and optionally delete the branch
 - Useful for cleaning up test/demo PRs created by code governance examples
 - Supports all providers: GitHub, GitLab, Bitbucket
 - Requires enterprise portal authentication

### Changed

- **Simplified authentication**: For community mode, simply provide `clientId` for request identification. No `clientSecret` needed.

```typescript
// Community mode - no secret needed
const client = new AxonFlow({
 endpoint: 'http://localhost:8080',
 clientId: 'my-app', // Used for request identification
});
```

### Fixed

- **getPlanStatus endpoint**: Fixed endpoint path from `/api/plans/{id}` to `/api/v1/plan/{id}` to match orchestrator API

### Enterprise

- OAuth2 Basic auth: `Authorization: Basic base64(clientId:clientSecret)` replaces `X-License-Key` header
- Removed `licenseKey` and `apiKey` configuration options (use `clientId`/`clientSecret`)

---

## [2.1.0] - 2026-01-05

### Added

- **Sensitive Data Category**: Added `'sensitive-data'` to `PolicyCategory` type union for policies that return `sensitive-data` category
- **Provider Restrictions for Compliance**: Support for `allowed_providers` in dynamic policy action config
 - Specify allowed providers via `actions: [{ type: 'route', config: { allowed_providers: [.] } }]`
 - Enables GDPR, HIPAA, and RBI compliance by restricting LLM routing to specific providers
- **Category field**: Added `category` field to `CreateDynamicPolicyRequest` and `UpdateDynamicPolicyRequest`

### Fixed

- **toggleDynamicPolicy HTTP Method**: Changed from PATCH to PUT to match API specification
- **Tenant Header Name**: Changed header from `X-Tenant-ID` to `X-Org-ID` to match API specification
- **PolicyVersion timestamp parsing**: Fixed `getStaticPolicyVersions()` to correctly transform snake_case API fields (`changed_at`, `changed_by`, `change_type`) to camelCase interface fields
- **Dynamic Policy Response Parsing**: Fixed all dynamic policy methods to correctly parse wrapped API responses
 - Agent proxy returns `{"policies": [.]}` and `{"policy": {.}}` wrappers
 - Updated `listDynamicPolicies`, `getDynamicPolicy`, `createDynamicPolicy`, `updateDynamicPolicy`, `toggleDynamicPolicy`, `getEffectiveDynamicPolicies`
 - Added fallback handling for both wrapped and unwrapped responses

## [2.0.0] - 2026-01-05

### Breaking Changes

- **BREAKING**: Removed `orchestratorEndpoint` and `portalEndpoint` config options (Agent now proxies all routes)
- **BREAKING**: Dynamic policy API path changed from `/api/v1/policies/dynamic` to `/api/v1/dynamic-policies`

### Added

- **Audit Log Reading**: Added `searchAuditLogs()` for searching audit logs with filters (user email, client ID, time range, request type)
- **Tenant Audit Logs**: Added `getAuditLogsByTenant()` for retrieving audit logs scoped to a specific tenant
- **Audit Types**: Added `AuditLogEntry`, `AuditSearchRequest`, `AuditQueryOptions`, and `AuditSearchResponse` types
- **PII Redaction Support**: Added `requiresRedaction` field to `PolicyApprovalResult`
 - When `true`, PII was detected with redact action and response should be processed for redaction
 - Supports new detection defaults: PII defaults to redact instead of block

### Changed

- All SDK methods now route through single Agent endpoint
- Simplified configuration - only `endpoint` field needed
- Removed `getOrchestratorUrl()` and `getPortalUrl()` helper methods (now return endpoint directly)

### Migration Guide

**Before (v1.x):**
```typescript
const client = new AxonFlow({
 endpoint: 'http://localhost:8080',
 orchestratorEndpoint: 'http://localhost:8081',
 portalEndpoint: 'http://localhost:8082',
 apiKey: 'my-api-key',
});
```

**After (v2.x):**
```typescript
const client = new AxonFlow({
 endpoint: 'http://localhost:8080',
 apiKey: 'my-api-key',
});
```

---

## [1.14.0] - 2026-01-04

### Added

- **Portal Authentication**: Added `loginToPortal()` and `logoutFromPortal()` for session-based authentication
- **Portal URL Configuration**: New `portalUrl` config option for Code Governance portal endpoints
- **CSV Export**: Added `exportCodeGovernanceDataCsv()` for CSV format exports

### Fixed

- **Code Governance Authentication**: Changed Code Governance methods to use portal session-based auth instead of API key auth

---

## [1.13.0] - 2026-01-04

### Added

- **Get Connector**: `getConnector(id)` to retrieve details for a specific connector
- **Connector Health Check**: `getConnectorHealth(id)` to check health status of an installed connector
- **ConnectorHealthStatus type**: New type for connector health responses
- **Orchestrator Health Check**: `orchestratorHealthCheck()` to verify Orchestrator service health
- **Uninstall Connector**: `uninstallConnector()` to remove installed MCP connectors

### Fixed

- **Connector API Endpoints**: Fixed endpoints to use Orchestrator (port 8081) instead of Agent
 - `listConnectors()` - Changed from Agent `/api/connectors` to Orchestrator `/api/v1/connectors`
 - `installConnector()` - Fixed path to `/api/v1/connectors/{id}/install`
- **Dynamic Policies Endpoint**: Changed from Agent `/api/v1/policies` to Orchestrator `/api/v1/policies/dynamic`

---

## [1.12.0] - 2026-01-04

### Added

- **Execution Replay API**: Debug governed workflows with step-by-step state capture
 - `listExecutions()` - List executions with filtering (status, time range)
 - `getExecution()` - Get execution with all step snapshots
 - `getExecutionSteps()` - Get individual step snapshots
 - `getExecutionTimeline()` - Timeline view for visualization
 - `exportExecution()` - Export for compliance/archival
 - `deleteExecution()` - Delete execution records

- **Cost Controls**: Budget management and LLM usage tracking
 - `createBudget()` / `getBudget()` / `listBudgets()` - Budget CRUD
 - `updateBudget()` / `deleteBudget()` - Budget management
 - `getBudgetStatus()` - Check current budget usage
 - `checkBudget()` - Pre-request budget validation
 - `recordUsage()` - Record LLM token usage
 - `getUsageSummary()` - Usage analytics and reporting

---

## [1.11.1] - 2025-12-31

### Fixed

- **Gateway Mode Community Support**: `getPolicyApprovedContext()` and `auditLLMCall()` now work without credentials
 - Removed SDK-level credential check that blocked community mode usage
 - Server decides whether to require authentication based on `DEPLOYMENT_MODE`
 - Consistent with Go/Python SDKs behavior

---

## [1.11.0] - 2025-12-30

### Changed

- **Community Mode**: Credentials are now optional for self-hosted/community deployments
 - SDK can be initialized without `apiKey` or `licenseKey` for community features
 - `executeQuery()` and `healthCheck()` work without credentials
 - Auth headers are only sent when credentials are configured

### Added

- Enterprise features (`getPolicyApprovedContext`, `auditLLMCall`) now validate credentials at call time

### Fixed

- Gateway Mode methods now throw `AuthenticationError` when called without credentials

> **Note:** v1.11.0 credential validation for Gateway Mode was too restrictive for community deployments. Use v1.11.1 for full community mode support.

---

## [1.10.0] - 2025-12-30

### Fixed

- Fixed `PolicyOverride` interface to use correct field names (`policy_id`, `action_override`, `override_reason`)
- Fixed `listPolicyOverrides()` endpoint path
- Fixed response parsing for `getStaticPolicyVersions()`
- Fixed `createStaticPolicy()` to use correct field names

> **Note:** These changes affect Enterprise users only. Community users can skip this release.

---

## [1.9.0] - 2025-12-29

### Added

- **Enterprise Policy Features**:
 - `organizationId` field in `CreateStaticPolicyRequest` for organization-tier policies
 - `organizationId` field in `ListStaticPoliciesOptions` for filtering by organization
 - `listPolicyOverrides()` method to list all active policy overrides

---

## [1.8.0] - 2025-12-29

### Added

- **Code Governance Metrics & Export APIs** (Enterprise): Compliance reporting for AI-generated code
 - `getCodeGovernanceMetrics()` - Returns aggregated statistics (PR counts, file totals, security findings)
 - `exportCodeGovernanceData()` - Exports PR records as JSON for auditors

- **New Types**: `CodeGovernanceMetrics`, `ExportOptions`, `ExportResponse`

---

## [1.7.0] - 2025-12-29

### Added

- **Code Governance Git Provider APIs** (Enterprise): Create PRs from LLM-generated code
 - `validateGitProvider()` - Validate credentials before saving
 - `configureGitProvider()` - Configure GitHub, GitLab, or Bitbucket
 - `listGitProviders()` - List configured providers
 - `deleteGitProvider()` - Remove a provider
 - `createPR()` - Create PR from generated code with audit trail
 - `listPRs()` - List PRs with filtering
 - `getPR()` - Get PR details
 - `syncPRStatus()` - Sync status from Git provider

- **New Types**: `GitProviderType`, `FileAction`, `CodeFile`, `CreatePRRequest`, `CreatePRResponse`, `PRRecord`, `ListPRsOptions`, `ListPRsResponse`

- **Supported Git Providers**:
 - GitHub (Cloud and Enterprise Server)
 - GitLab (Cloud and Self-Managed)
 - Bitbucket (Cloud and Server/Data Center)

---

## [1.6.0] - 2025-12-28

### Added

- **HITL Support**: `require_approval` action for human oversight policies
 - Use with `createStaticPolicy()` to trigger approval workflows
 - Enterprise: Full HITL queue integration
 - Community: Auto-approves immediately

- **Code Governance**: `CodeArtifact` type for LLM-generated code detection
 - Language and code type identification
 - Potential secrets and unsafe pattern detection

---

## [1.5.0] - 2025-12-25

### Added

- **Policy CRUD Methods**: Full policy management support for Unified Policy Architecture v2.0.0
 - `listStaticPolicies()` - List policies with filtering by tier, category, enabled status
 - `getStaticPolicy()` - Get single policy by ID
 - `createStaticPolicy()` - Create custom policy
 - `updateStaticPolicy()` - Update existing policy
 - `deleteStaticPolicy()` - Delete policy
 - `toggleStaticPolicy()` - Enable/disable policy
 - `getEffectiveStaticPolicies()` - Get merged hierarchy for tenant
 - `testPattern()` - Test regex pattern against input

- **Policy Override Methods** (Enterprise):
 - `createPolicyOverride()`, `getPolicyOverride()`, `deletePolicyOverride()`

- **Dynamic Policy Methods**:
 - `listDynamicPolicies()`, `getDynamicPolicy()`, `createDynamicPolicy()`
 - `updateDynamicPolicy()`, `deleteDynamicPolicy()`, `toggleDynamicPolicy()`
 - `getEffectiveDynamicPolicies()`

- **New Types**: `StaticPolicy`, `DynamicPolicy`, `PolicyOverride`, `PolicyCategory`, `PolicyTier`, `PolicyAction`

## [1.4.2] - 2025-12-23

### Added

- **MAP Timeout Configuration** - New `mapTimeout` config option (default: 120000ms) for Multi-Agent Planning operations
 - MAP operations involve multiple LLM calls and can take 30-60+ seconds
 - `generatePlan()` now uses the longer MAP timeout

### Fixed

- **Plan ID Parsing** - Fixed `plan_id` extraction to check both top-level and nested `data.plan_id`

## [1.4.1] - 2025-12-22

### Deprecated
- **`protect()` method**: Now shows deprecation warning at runtime
 - Root cause: `extractRequest()` uses `aiCall.toString()` which returns JS source code, not runtime values
 - This causes `response.choices[0]` to be undefined
 - Will be removed in v2.0.0
 - Use Gateway Mode (`getPolicyApprovedContext` + `auditLLMCall`) or Proxy Mode (`executeQuery`) instead

### Changed
- Updated README with Gateway Mode and Proxy Mode examples (removed all `protect()` examples)
- Updated module docstring with recommended patterns and approval check example

## [1.4.0] - 2025-12-19

### Deprecated
- **LLM Interceptor wrappers**: All interceptor functions now show deprecation warnings
 - `wrapOpenAIClient()`
 - `wrapAnthropicClient()`
 - `wrapGeminiModel()`
 - `wrapOllamaClient()`
 - `wrapBedrockClient()`
 - Will be removed in v2.0.0
 - Use Gateway Mode or Proxy Mode instead

### Changed
- Added `@deprecated` JSDoc annotations to all interceptor exports
- Updated documentation to recommend Gateway/Proxy Mode patterns

## [1.3.0] - 2025-12-19

### Added
- **Proxy Mode**: Full `executeQuery()` implementation for routing requests through AxonFlow
 - Supports all request types: `chat`, `sql`, `mcp-query`, `multi-agent-plan`, `execute-plan`
 - Automatic policy enforcement with `PolicyViolationError` for blocked requests
 - Rich response with policy info, metadata, and processing details
- **Health Check**: New `healthCheck()` method to verify agent availability
 - Returns `HealthStatus` with status, version, uptime, and component health
- New types: `ExecuteQueryOptions`, `ExecuteQueryResponse`, `PolicyInfo`, `HealthStatus`, `RequestType`
- Proxy Mode example at `examples/proxy-mode/index.ts`
- Comprehensive integration tests for Proxy Mode

### Changed
- Version bumped to 1.3.0
- SDK now has full parity with Python SDK for both Gateway and Proxy modes

## [1.2.1] - 2025-12-15

### Fixed
- Fix authorization header handling for plan generation with explicit userToken
- Fix policy name extraction from blocked responses - now correctly extracts from `policy_info.policies_evaluated`

### Added
- Contract testing with real Agent API response fixtures
- Comprehensive E2E test suite (16 tests) for pre-release validation
- ESLint linting in CI workflow
- Codecov coverage reporting
- Node.js 18/20/22 matrix testing

### Validated APIs
- Gateway Mode (pre-check, audit)
- Policy Enforcement (SQL injection, PII blocking)
- Plan Generation (multi-agent)
- Protect API (fail-open mode)

## [1.2.0] - 2025-12-04

### Added
- Self-hosted mode for localhost deployments without license requirement
- Gateway Mode API for direct LLM calls with policy enforcement

### Changed
- License key now optional for localhost/self-hosted deployments

## [1.1.0] - 2025-11-27

### Added
- License-based authentication as primary authentication method
- MCP connector documentation

### Changed
- Updated README with new connector examples

## [1.0.0] - 2025-10-27

### Added
- Initial release of AxonFlow TypeScript SDK
- Core client with `executeQuery` for governed AI calls
- Policy enforcement with `PolicyViolationError` exceptions
- Gateway Mode support (`getPolicyApprovedContext`, `auditLlmCall`)
- Plan generation and execution (`generatePlan`, `executePlan`)
- Protect API for fail-open mode (`protect`)
- TypeScript type definitions for all API responses
- Examples for basic usage, connectors, and planning
