/**
 * Decision Mode PEP (Policy Enforcement Point) contract: types, constants,
 * and pure helpers.
 *
 * A PEP follows one path: **decide → fulfill → forward** (ADR-056, epic #2563).
 *
 *   - decide:  ask the PDP (`POST /api/v1/decide`) for a verdict on a request.
 *   - fulfill: for every obligation the verdict carries, call the ENGINE
 *     endpoint named in the obligation's `fulfillment` block to obtain
 *     engine-redacted content.
 *   - forward: forward the (possibly redacted) content, or block, per verdict.
 *
 * The structural guarantee #2563 demands: a PEP built on this SDK contains NO
 * redaction logic of its own. The ONLY way it discharges a `redact_pii`
 * obligation is by POSTing the source content to the engine endpoint the
 * obligation names ({@link AxonFlow.fulfillRequest} /
 * {@link AxonFlow.decideAndFulfill}) and forwarding what the engine returns. If
 * an obligation arrives without a fulfillable engine endpoint — or the engine
 * reports the redactor did not run — the helper throws
 * {@link ObligationNotFulfillableError} and the caller MUST fail closed
 * (block), never forward unredacted.
 *
 * This mirrors `platform/shared/pep` (the Go reference PEP) and the Python SDK
 * so the SDK PEP cannot reimplement redaction the way a hand-rolled regex would.
 */

// --- Obligation contract constants (mirror platform/agent decision handler) ---

/**
 * The obligation a PEP discharges by replacing request content with
 * engine-redacted content before forwarding.
 */
export const OBLIGATION_REDACT_PII = 'redact_pii';

/**
 * Fulfillment phases. `/decide` runs pre-call so it only emits request-phase
 * obligations; the response-phase value is part of the contract for PEP helpers
 * that fan out to the response-redaction endpoint after the backend call.
 */
export const PHASE_REQUEST = 'request';
export const PHASE_RESPONSE = 'response';

/**
 * The only redaction content-type wired today. The contract is content-type
 * agnostic — a PEP holding content of a type not advertised by an obligation's
 * `content_types` must fail closed rather than forward it unredacted.
 */
export const CONTENT_TYPE_TEXT = 'text/plain';

// --- Verdict values returned by the PDP ---
export const VERDICT_ALLOW = 'allow';
export const VERDICT_DENY = 'deny';
export const VERDICT_NEEDS_APPROVAL = 'needs_approval';

// --- Engine endpoints a PEP will POST content to for fulfillment ---
// An obligation whose fulfillment endpoint is not one of these is rejected — a
// PEP must not be steered into calling an arbitrary URL by a malformed verdict.
export const REQUEST_REDACTION_PATH = '/api/v1/mcp/check-input';
export const RESPONSE_REDACTION_PATH = '/api/v1/mcp/check-output';

export const DECIDE_PATH = '/api/v1/decide';

/**
 * Names the engine call a PEP makes to discharge an obligation.
 *
 * Fulfillment is a property of the contract, not of PEP-author discipline: a
 * conforming PEP POSTs the obligation's source content to `endpoint` and
 * forwards the engine-redacted content the endpoint returns.
 *
 * `content_types` advertises the mime-types the endpoint's detectors can handle
 * today. The contract is content-type-agnostic: a PEP holding content of a type
 * NOT in this list must fail closed rather than forward it unredacted. Mirrors
 * platform ObligationFulfillment (snake_case wire shape).
 */
export interface ObligationFulfillment {
  /** Engine path, e.g. "/api/v1/mcp/check-input". */
  endpoint: string;
  /** HTTP method, e.g. "POST". */
  method?: string;
  /** "request" | "response". */
  phase: string;
  /** Mime-types the endpoint can redact today. */
  content_types?: string[];
}

/**
 * A self-describing, engine-fulfillable PEP requirement on an allow verdict.
 *
 * Obligations are SELF-DESCRIBING and ENGINE-FULFILLABLE (ADR-056, #2563):
 * `/decide` is a pure PDP and never mutates content, so a `redact_pii`
 * obligation is not "go redact this yourself with your own patterns" — it is
 * "call the AxonFlow engine endpoint named in `fulfillment` to obtain
 * engine-redacted content." There is no other blessed way to satisfy it;
 * client-side redaction is forbidden. Mirrors platform DecisionObligation
 * (snake_case wire shape).
 */
export interface Obligation {
  /** Obligation type, e.g. "redact_pii". */
  type: string;
  /** Human-readable detail for audit logs. */
  detail?: string;
  /** How a PEP discharges this obligation via the engine. */
  fulfillment?: ObligationFulfillment;
}

/**
 * Gateway-asserted identity for a /decide request.
 *
 * org_id / tenant_id are optional in the body — the auth-derived identity is
 * authoritative; body-supplied values are accepted only when they match.
 * Mirrors platform DecisionCallerIdentity (snake_case wire shape).
 */
export interface DecisionCallerIdentity {
  gateway_id?: string;
  org_id?: string;
  tenant_id?: string;
}

/**
 * Describes what the gateway is about to call. Mirrors platform DecisionTarget
 * (snake_case wire shape).
 */
export interface DecisionTarget {
  /** "llm" | "tool" | "agent". */
  type?: string;
  /** When type=llm. */
  model?: string;
  /** When type=llm. */
  provider?: string;
  /** When type=tool. */
  tool?: string;
}

/**
 * Inbound contract for `POST /api/v1/decide`. Mirrors platform DecideRequest
 * (snake_case wire shape).
 *
 * Required: `stage` (one of "llm" | "tool" | "agent") and `query`.
 * `user_token` is optional — a PEP that supplies one gets the validated-user
 * record on the audit row; one that doesn't gets a synthesized service user.
 */
export interface DecideRequest {
  stage: string;
  query: string;
  caller_identity?: DecisionCallerIdentity;
  target?: DecisionTarget;
  user_token?: string;
  context?: Record<string, unknown>;
}

/**
 * PDP verdict returned by `POST /api/v1/decide`. Mirrors platform DecideResponse
 * (snake_case wire shape).
 *
 * `obligations` is normalized to an array by the client so PEP code can iterate
 * without a null-check. `trace_id` is W3C-format (32 lowercase hex chars).
 * `error` is set on the deny path when the request was malformed.
 */
export interface DecideResponse {
  verdict: string;
  decision_id?: string;
  trace_id?: string;
  reasons?: string[];
  obligations: Obligation[];
  evaluated_policies?: string[];
  stage?: string;
  expires_at?: string;
  error?: string;
}

/**
 * Reports whether any obligation requires request-phase PII redaction.
 *
 * Exposed so a PEP can branch ("does this verdict carry work for me?") before
 * calling {@link AxonFlow.fulfillRequest}.
 */
export function hasRequestRedaction(obligations: Obligation[]): boolean {
  return obligations.some(
    o =>
      o.type === OBLIGATION_REDACT_PII &&
      o.fulfillment != null &&
      o.fulfillment.phase === PHASE_REQUEST
  );
}

/**
 * Returns a shallow copy of `obj` with every key whose value is `undefined`
 * removed, so a serialized `DecideRequest` omits empty optional fields
 * (`user_token`, `context`) on the wire per the spec. Nested objects
 * (`caller_identity`, `target`) are likewise stripped of undefined keys; a
 * nested object that becomes empty is dropped entirely.
 */
export function stripUndefined(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) {
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const nested = stripUndefined(v as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        out[k] = nested;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Reports whether `endpoint` is the expected engine path.
 *
 * Tolerates an absolute URL whose path component matches (some PDPs return a
 * fully-qualified obligation endpoint); a blank endpoint never matches. Refusing
 * any other endpoint stops a malformed verdict from steering the PEP into
 * calling an arbitrary URL.
 */
export function endpointPathMatches(endpoint: string, expected: string): boolean {
  const e = (endpoint || '').trim();
  if (e === expected) {
    return true;
  }
  const marker = '://';
  const idx = e.indexOf(marker);
  if (idx >= 0) {
    const rest = e.slice(idx + marker.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) {
      let path = rest.slice(slash);
      const q = path.indexOf('?');
      if (q >= 0) {
        path = path.slice(0, q);
      }
      return path === expected;
    }
  }
  return false;
}
