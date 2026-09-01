/**
 * AuthZEN-native authorization for the AxonFlow SDK.
 *
 * This is the surface the ADR-065 compatibility plan commits to in all five
 * SDKs. It talks to `POST /api/v1/access/evaluation`, whose wire shape is
 * generated from the platform's canonical contract (see
 * `src/types/authzen.gen.ts`); nothing in this file re-states a field name or
 * an enum value.
 *
 * ## What this replaces, and when
 *
 * Nothing yet. The existing decision surface (`decide`, `explainDecision` and
 * the gateway/proxy methods) stays wire-stable through all of v11 and is not
 * deprecated here. This is the surface to write NEW integrations against,
 * because at v11 the engine behind it becomes the ADR-065 Policy Decision Point
 * with no wire change — an integration written against it migrates once rather
 * than twice. See `docs/AUTHZEN_MIGRATION_DRAFT.md`.
 *
 * ## The one thing worth knowing before you call it
 *
 * The server refuses anything it cannot evaluate rather than evaluating around
 * it. Send a subject property, an unrecognised context member, or an argument
 * beside the query, and you get an `AuthZENRefusal` naming the exact member —
 * not a decision computed without it. That is deliberate: a decision that
 * silently ignored an attribute would tell you the attribute was weighed when
 * it was not, and every audit of that decision would inherit the claim.
 *
 * So treat an `AuthZENRefusal` as "fix the request", and retry only when
 * `refusal.retryable` is true.
 */

import { AuthenticationError, AxonFlowError } from './errors';
import {
  AUTHZEN_ERROR_CODE_EVALUATION_UNAVAILABLE,
  AUTHZEN_ERROR_CODE_INCOMPLETE_EVALUATION,
  AUTHZEN_ERROR_CODE_MALFORMED_ENVELOPE,
  AUTHZEN_ERROR_CODE_UNEVALUABLE_ATTRIBUTE,
  AUTHZEN_OPERATIONAL_STATE_ALLOW,
  AUTHZEN_OPERATIONAL_STATE_ERROR,
  AUTHZEN_OPERATIONAL_STATE_VALUES,
  AUTHZEN_PROFILE_V1,
  AuthZENAction,
  AuthZENApprovalRequirement,
  AuthZENCategory,
  AuthZENEnvelope,
  AuthZENError,
  AuthZENErrorCode,
  AuthZENObligation,
  AuthZENOperationalState,
  AuthZENReasonCode,
  AuthZENRequest,
  AuthZENResource,
  AuthZENResponse,
  AuthZENResponseContext,
  AuthZENSchemaError,
  AuthZENSubject,
  validateAuthZENEnvelope,
  validateAuthZENError,
  validateAuthZENResponse,
} from './types/authzen.gen';

/** The AuthZEN evaluation endpoint. */
export const AUTHZEN_PATH = '/api/v1/access/evaluation';

/**
 * How a Policy Enforcement Point negotiates the AxonFlow profile.
 *
 * The SDK always sends it. AuthZEN 1.0's response is a bare boolean, and the
 * four-valued state, the obligations and the approval challenge ride in the
 * response context, which the server returns only to a caller that asked for it
 * by version. This SDK understands the profile, so there is no reason to ask
 * for less than it can read — and a response WITHOUT the context is therefore a
 * protocol failure here rather than a decision with no obligations.
 */
export const AUTHZEN_PROFILE_HEADER = 'X-Axonflow-AuthZEN-Profile';

// ---------------------------------------------------------------------------
// Why an attribute could not be established.
// ---------------------------------------------------------------------------
//
// These mirror ADR-065's tri-state reason codes so an operator reading an SDK
// refusal and an operator reading a platform trace use the same words. They are
// CLIENT-LOCAL: an unknown attribute never reaches the wire, because the whole
// point is that the request is not sent. The reason is a free-form string on
// purpose — a closed set hand-copied from the platform would be a transcription
// that drifts, and it would buy nothing, since nothing on the far side reads it.
export const AUTHZEN_UNKNOWN_NOT_SUPPLIED = 'attribute_not_supplied';
export const AUTHZEN_UNKNOWN_RESOLUTION_FAILED = 'resolution_failed';
export const AUTHZEN_UNKNOWN_STALE = 'stale';
export const AUTHZEN_UNKNOWN_SCHEMA_MISMATCH = 'schema_mismatch';
export const AUTHZEN_UNKNOWN_CLOSURE_UNAVAILABLE = 'closure_unavailable';
export const AUTHZEN_UNKNOWN_CLOSURE_TRUNCATED = 'closure_truncated';
export const AUTHZEN_UNKNOWN_MALFORMED_VALUE = 'malformed_value';
export const AUTHZEN_UNKNOWN_REQUIRED_ABSENT = 'required_attribute_absent';

/** Who declined to produce a decision. */
export type AuthZENRefusedBy = 'client' | 'gateway';

/**
 * The request was NOT evaluated, and here is the typed reason why.
 *
 * A refusal is not a denial. `decision: false` says the request WAS evaluated
 * and the answer was no; a refusal says no decision exists. Code that treats
 * every error as a deny fails closed — which is safe — but will block traffic
 * that should have been allowed once the request is corrected.
 *
 * `refusedBy` says who made the call. `'gateway'` is a refusal document the
 * server sent; `'client'` is this SDK declining to send a request it can
 * already see will not be evaluated — an attribute the caller could not
 * resolve, or an evaluation with no subject. The code vocabulary is shared
 * because the REASONS are shared: an incomplete evaluation is an incomplete
 * evaluation whoever notices it first.
 */
export class AuthZENRefusal extends AxonFlowError {
  public readonly code: AuthZENErrorCode;
  public readonly pointer?: string;
  public readonly supported?: string[];
  public readonly requestId?: string;
  public readonly refusedBy: AuthZENRefusedBy;

  constructor(
    code: AuthZENErrorCode,
    message: string,
    options: {
      refusedBy: AuthZENRefusedBy;
      pointer?: string;
      supported?: string[];
      requestId?: string;
    }
  ) {
    super(message, {
      code,
      pointer: options.pointer,
      supported: options.supported,
      requestId: options.requestId,
      refusedBy: options.refusedBy,
    });
    this.name = 'AuthZENRefusal';
    this.code = code;
    this.pointer = options.pointer;
    this.supported = options.supported;
    this.requestId = options.requestId;
    this.refusedBy = options.refusedBy;
    Object.setPrototypeOf(this, AuthZENRefusal.prototype);
  }

  /** Build a refusal from the structured document the server sent. */
  static fromBody(body: AuthZENError): AuthZENRefusal {
    return new AuthZENRefusal(body.code, body.message, {
      refusedBy: 'gateway',
      pointer: body.pointer,
      supported: body.supported,
      requestId: body.request_id,
    });
  }

  /**
   * Whether sending the same request again could give a different answer.
   *
   * Only a dependency failure the GATEWAY reported is. Every other code names
   * something about the request itself, which will not change on a retry — so
   * a client that retries on any refusal burns its budget on requests that
   * cannot succeed.
   *
   * A client-side refusal is never retryable, whatever its code: this SDK does
   * not resolve the caller's attributes, so nothing it can do will change the
   * answer. Reading retryability off the code alone would have told a caller to
   * retry an attribute its own resolver failed to produce.
   */
  get retryable(): boolean {
    return this.refusedBy === 'gateway' && this.code === AUTHZEN_ERROR_CODE_EVALUATION_UNAVAILABLE;
  }
}

/**
 * A 200 whose body this build cannot safely interpret.
 *
 * Deliberately NOT an `AuthZENRefusal`. A refusal carries the server's own
 * typed code from a closed vocabulary the server owns; a response this build
 * cannot read is not something the server said, and dressing it in a server
 * code would tell the caller the gateway refused when it did not. The two also
 * demand different actions: a refusal means fix the request, a protocol error
 * means upgrade the SDK or go and look at the deployment.
 *
 * It is always fail-closed: no decision is returned, so a caller that lets it
 * propagate blocks the operation.
 */
export class AuthZENProtocolError extends AxonFlowError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthZENProtocolError';
    Object.setPrototypeOf(this, AuthZENProtocolError.prototype);
  }
}

/** The three states a policy-visible attribute can be in. */
export type AuthZENAttributeState = 'known' | 'absent' | 'unknown';

/**
 * One policy-visible attribute in exactly one of three states.
 *
 * `undefined` and `null` cannot express this. ADR-065's model has three:
 *
 * - `known` — the authoritative source returned a value. It is sent.
 * - `absent` — the source successfully established that there is NO value.
 *   Absence is a FACT, not a failure, so the member is omitted and the request
 *   is sent: a policy that handles absence gets to handle it.
 * - `unknown` — the value could not be established. The request is NOT sent.
 *   Sending it would have the gateway evaluate as though the attribute were
 *   absent, and the resulting decision — and every audit of it — would record
 *   that an attribute was weighed when nobody ever read it. That is the exact
 *   failure the whole surface refuses to commit, one hop earlier.
 *
 * Collapsing absent into unknown is the defect this type exists to prevent, and
 * it is not hypothetical: on the platform side an ABSENT `subject.type` was
 * read as the one supported value, so omitting the field bypassed the
 * impersonation refusal that naming it correctly triggered.
 *
 * Where it may be used: inside the ATTRIBUTE bags — `context` on a request or a
 * bulk envelope, and the `properties` bag on a subject, action or resource — at
 * any depth. Not on the structural members (`subject.id`, `action.name`,
 * `resource.type` …): those are the identity of the question being asked, not
 * data about it, and an identity the caller cannot resolve is not an attribute
 * whose absence a policy could evaluate — there is simply no request to make.
 *
 * @example
 * ```typescript
 * AuthZENAttribute.known('acme-corp');
 * AuthZENAttribute.absent();
 * AuthZENAttribute.unknown(AUTHZEN_UNKNOWN_RESOLUTION_FAILED);
 * ```
 */
export class AuthZENAttribute {
  public readonly state: AuthZENAttributeState;
  public readonly value: unknown;
  public readonly reason: string;

  private constructor(state: AuthZENAttributeState, value: unknown, reason: string) {
    this.state = state;
    this.value = value;
    this.reason = reason;
  }

  /** The source returned this value. */
  static known(value: unknown): AuthZENAttribute {
    return new AuthZENAttribute('known', value, '');
  }

  /** The source established that there is no value. */
  static absent(): AuthZENAttribute {
    return new AuthZENAttribute('absent', undefined, '');
  }

  /**
   * The value could not be established, for the named reason.
   *
   * The reason is mandatory. An unknown with no reason carries no more than
   * `undefined` already did, and the whole point of the third state is that it
   * says why.
   */
  static unknown(reason: string): AuthZENAttribute {
    if (!reason || reason.trim() === '') {
      throw new AxonFlowError(
        'an unknown attribute must name why it could not be established; an unknown with ' +
          'no reason carries no more information than undefined, which is the collapse ' +
          'this type exists to prevent'
      );
    }
    return new AuthZENAttribute('unknown', undefined, reason);
  }

  /**
   * Whether `value` is a tri-state attribute.
   *
   * A method rather than a bare `instanceof` at each call site: a page that
   * loaded two copies of this package (a bundler duplicating it across chunks)
   * has two distinct classes, and `instanceof` would then quietly report an
   * attribute as ordinary data — which would serialise a resolver's internal
   * shape onto the wire.
   */
  static is(value: unknown): value is AuthZENAttribute {
    if (value instanceof AuthZENAttribute) return true;
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as { state?: unknown; reason?: unknown };
    return (
      (candidate.state === 'known' ||
        candidate.state === 'absent' ||
        candidate.state === 'unknown') &&
      typeof candidate.reason === 'string' &&
      Object.prototype.hasOwnProperty.call(candidate, 'value')
    );
  }
}

/**
 * The decision, with the readings a Policy Enforcement Point acts on.
 *
 * It implements the generated wire type rather than replacing it, so `decision`
 * and `context` remain exactly what the server sent while the readings below
 * stay in hand-written code the generator never has to know about.
 */
export class AuthZENDecision implements AuthZENResponse {
  public readonly decision: boolean;
  public readonly context?: AuthZENResponseContext;

  constructor(response: AuthZENResponse) {
    this.decision = response.decision;
    this.context = response.context;
  }

  /**
   * Whether the enforcement point may proceed.
   *
   * Read this rather than `decision`. `decision` is AuthZEN 1.0's collapsed
   * boolean; the operational STATE is what the policy engine actually produced,
   * and exactly one state permits execution. Requiring both means a response
   * whose boolean and state disagree can never be read as an allow — and such a
   * response is refused before it gets here anyway, so this is the second of
   * two locks rather than the only one.
   *
   * An allow with an undischarged MANDATORY obligation is not an allow. See
   * `mandatoryObligations`.
   */
  get allowed(): boolean {
    return (
      this.decision === true &&
      this.context !== undefined &&
      this.context.state === AUTHZEN_OPERATIONAL_STATE_ALLOW
    );
  }

  /**
   * The four-valued operational state.
   *
   * `ERROR` when there is no context. Unreachable via `evaluate`, which refuses
   * a context-less 200 before constructing this — but the type is public and a
   * caller can build one by hand, and the safe reading of an outcome that
   * carries no state is not ALLOW.
   */
  get state(): AuthZENOperationalState {
    return this.context ? this.context.state : AUTHZEN_OPERATIONAL_STATE_ERROR;
  }

  /**
   * The id of the evaluation that DETERMINED this outcome.
   *
   * For a bulk envelope this is the entry that decided the meet, not the last
   * one evaluated: it is the id an operator looks up to explain the answer.
   */
  get decisionId(): string | undefined {
    return this.context?.decision_id;
  }

  /** The safe machine-readable reason code, when the server sent one. */
  get reason(): AuthZENReasonCode | undefined {
    return this.context?.reason;
  }

  /** The coarse outcome category, when the server sent one. */
  get category(): AuthZENCategory | undefined {
    return this.context?.category;
  }

  /** Instructions the enforcement point must discharge before proceeding. */
  get obligations(): AuthZENObligation[] {
    return this.context?.obligations ?? [];
  }

  /**
   * The obligations that are not optional.
   *
   * A mandatory obligation that cannot be discharged means the operation must
   * NOT proceed, even though `allowed` is true. This SDK cannot make that call
   * for you — whether your enforcement point can discharge a redaction is a
   * fact about your seam, not about the decision — so it gives you the list and
   * stays out of the way.
   */
  get mandatoryObligations(): AuthZENObligation[] {
    return this.obligations.filter(obligation => obligation.mandatory);
  }

  /** The approval challenge, when the state is CHALLENGE. */
  get approval(): AuthZENApprovalRequirement | undefined {
    return this.context?.approval;
  }
}

// ---------------------------------------------------------------------------
// Tri-state resolution
// ---------------------------------------------------------------------------

// RFC 6901. A correlation key containing a slash would otherwise produce a
// pointer naming a member that does not exist, on the refusal whose entire
// diagnostic value is the pointer.
function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

class Unresolvable extends Error {
  constructor(
    public readonly pointer: string,
    public readonly reason: string
  ) {
    super(pointer);
  }
}

// Distinguishes "this member resolved to no value, drop it" from "this member
// resolved to the value null". They are different: a caller may legitimately
// send a JSON null, and reusing null for the drop signal would silently rewrite
// one into the other.
const DROP = Symbol('authzen.absent');

function resolveValue(value: unknown, pointer: string): unknown {
  if (AuthZENAttribute.is(value)) {
    if (value.state === 'known') {
      // A known attribute may itself hold a container carrying more
      // attributes; resolving the payload keeps the rule uniform rather than
      // depending on how deeply a caller nested its resolver output.
      return resolveValue(value.value, pointer);
    }
    if (value.state === 'absent') return DROP;
    throw new Unresolvable(pointer, value.reason);
  }
  if (Array.isArray(value)) {
    // An ABSENT element is dropped from the list rather than left as a hole. A
    // list with a gap in it is a different list, and the index a policy reads
    // would shift under it either way; dropping is the reading that matches
    // "there is no value here".
    const items: unknown[] = [];
    value.forEach((item, index) => {
      const resolved = resolveValue(item, `${pointer}/${index}`);
      if (resolved !== DROP) items.push(resolved);
    });
    return items;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach(key => {
      const resolved = resolveValue(
        (value as Record<string, unknown>)[key],
        `${pointer}/${escapePointerToken(key)}`
      );
      if (resolved !== DROP) out[key] = resolved;
    });
    return out;
  }
  return value;
}

/**
 * Resolve one attribute bag.
 *
 * ABSENCE DOES NOT CASCADE. A bag whose every member resolved absent is sent as
 * an empty object, not deleted: the bag is the caller's structure and the
 * attributes are the data inside it, and an SDK that removed a container the
 * caller placed would be editing the question rather than resolving the answer.
 *
 * The lever a caller wants sits one level in, which is where the attributes
 * are: `{ args, correlation: AuthZENAttribute.absent() }` drops `correlation`
 * and keeps everything else. Omitting the bag itself is ordinary TypeScript —
 * do not pass it — because a bag that is not part of the question is not an
 * attribute whose absence anything could evaluate.
 */
function resolveBag(
  bag: Record<string, unknown> | undefined,
  pointer: string
): Record<string, unknown> | undefined {
  if (bag === undefined) return undefined;
  return resolveValue(bag, pointer) as Record<string, unknown>;
}

function resolveSubject(
  subject: AuthZENSubject | undefined,
  at: string
): AuthZENSubject | undefined {
  if (!subject) return undefined;
  return {
    type: subject.type,
    id: subject.id,
    properties: resolveBag(subject.properties, `${at}/subject/properties`),
  };
}

function resolveAction(action: AuthZENAction | undefined, at: string): AuthZENAction | undefined {
  if (!action) return undefined;
  return {
    name: action.name,
    properties: resolveBag(action.properties, `${at}/action/properties`),
  };
}

function resolveResource(
  resource: AuthZENResource | undefined,
  at: string
): AuthZENResource | undefined {
  if (!resource) return undefined;
  return {
    type: resource.type,
    id: resource.id,
    properties: resolveBag(resource.properties, `${at}/resource/properties`),
  };
}

function resolveRequest(request: AuthZENRequest, at: string): AuthZENRequest {
  return {
    subject: resolveSubject(request.subject, at),
    action: resolveAction(request.action, at),
    resource: resolveResource(request.resource, at),
    context: resolveBag(request.context, `${at}/context`),
  };
}

/**
 * Return the envelope with every tri-state attribute resolved to the wire.
 *
 * Throws `AuthZENRefusal` with `refusedBy: 'client'` and the JSON Pointer of
 * the offending member when an attribute is UNKNOWN.
 *
 * The pointers match the server's own vocabulary — `/evaluation/...` for a
 * singular envelope, `/evaluations/evaluations/<i>/...` for a plural entry — so
 * a client-side refusal and a gateway refusal name the same member the same
 * way, and a caller does not have to learn two pointer dialects.
 */
export function resolveEnvelope(envelope: AuthZENEnvelope): AuthZENEnvelope {
  try {
    // BOTH members are resolved when both are present, rather than the first
    // one winning. Python's models refuse a two-member envelope at
    // construction; TypeScript has no such moment, so an early return here
    // would silently DROP the second member and send a request the caller did
    // not write — and the exactly-one-of rule, which lives in the generated
    // validator, would never see the violation it exists to refuse. One
    // implementation of that rule, not two.
    const out: AuthZENEnvelope = {};
    if (envelope.evaluation !== undefined && envelope.evaluation !== null) {
      out.evaluation = resolveRequest(envelope.evaluation, '/evaluation');
    }
    if (envelope.evaluations !== undefined && envelope.evaluations !== null) {
      const bulk = envelope.evaluations;
      out.evaluations = {
        subject: resolveSubject(bulk.subject, '/evaluations'),
        action: resolveAction(bulk.action, '/evaluations'),
        resource: resolveResource(bulk.resource, '/evaluations'),
        context: resolveBag(bulk.context, '/evaluations/context'),
        evaluations: (bulk.evaluations ?? []).map((entry, index) =>
          resolveRequest(entry, `/evaluations/evaluations/${index}`)
        ),
      };
    }
    if (out.evaluation !== undefined || out.evaluations !== undefined) {
      return out;
    }
  } catch (err) {
    if (!(err instanceof Unresolvable)) throw err;
    throw new AuthZENRefusal(
      AUTHZEN_ERROR_CODE_UNEVALUABLE_ATTRIBUTE,
      `the attribute at ${err.pointer} could not be established (${err.reason}), so this ` +
        `request was not sent. The gateway would have evaluated as though the attribute ` +
        `had no value, and the decision — and every audit of it — would record that it ` +
        `was considered when nothing read it. Establish the value, or send it as an ` +
        `explicitly ABSENT attribute if the source proved there is none.`,
      { refusedBy: 'client', pointer: err.pointer }
    );
  }
  throw new AuthZENRefusal(
    AUTHZEN_ERROR_CODE_MALFORMED_ENVELOPE,
    'the envelope names neither an evaluation nor an evaluations member',
    { refusedBy: 'client', pointer: '' }
  );
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * Check the one invariant the artifact says it cannot express.
 *
 * The artifact marks every member of `authzen_request` structurally optional,
 * because a plural entry inherits anything it omits from the shared base.
 * Whether the MERGED entry names a subject, an action and a resource is a
 * cross-object property no per-object schema can carry, and the platform's own
 * projection enforces it server-side.
 *
 * This is deliberately the ONLY thing checked here, and it is checked by
 * PRESENCE alone. Everything else the server refuses — which action names are
 * evaluable, which resource types exist, which correlation keys this deployment
 * records — is deployment state the SDK does not have. A client that guessed at
 * it would refuse requests a newer gateway accepts, and the caller would have
 * no way to tell an SDK that is out of date from a request that is wrong.
 */
function checkComplete(
  request: AuthZENRequest,
  base: AuthZENRequest | undefined,
  at: string
): void {
  const missing = (['subject', 'action', 'resource'] as const).filter(
    member => !request[member] && !(base && base[member])
  );
  if (missing.length > 0) {
    throw new AuthZENRefusal(
      AUTHZEN_ERROR_CODE_INCOMPLETE_EVALUATION,
      `after inheriting from the shared base this evaluation still has no ` +
        `${missing.join(', ')}; there is nothing to evaluate`,
      { refusedBy: 'client', pointer: at }
    );
  }
  const subject = request.subject ?? base?.subject;
  if (subject && subject.id.trim() === '') {
    throw new AuthZENRefusal(
      AUTHZEN_ERROR_CODE_INCOMPLETE_EVALUATION,
      'the subject id must not be blank; a decision has to name the caller it was made for',
      { refusedBy: 'client', pointer: `${at}/subject/id` }
    );
  }
}

/** Refuse an envelope that cannot produce a decision, before the round trip. */
export function checkEnvelopeComplete(envelope: AuthZENEnvelope): void {
  if (envelope.evaluation) {
    checkComplete(envelope.evaluation, undefined, '/evaluation');
    return;
  }
  if (envelope.evaluations) {
    const bulk = envelope.evaluations;
    const base: AuthZENRequest = {
      subject: bulk.subject,
      action: bulk.action,
      resource: bulk.resource,
      context: bulk.context,
    };
    (bulk.evaluations ?? []).forEach((entry, index) => {
      checkComplete(entry, base, `/evaluations/evaluations/${index}`);
    });
  }
}

// ---------------------------------------------------------------------------
// The response direction
// ---------------------------------------------------------------------------

/**
 * Refuse a 200 this build cannot act on.
 *
 * Every check here closes a way for an un-actionable body to be read as an
 * allow. A decoded response that is merely well-typed is not enough: the
 * boolean and the state are two renderings of one outcome, and a build that
 * trusts either alone will act on a decision the other contradicts.
 */
function validateDecision(response: AuthZENResponse, body: string): void {
  if (!response.context) {
    throw new AuthZENProtocolError(
      `the server answered without the profile context. This SDK negotiates ` +
        `${AUTHZEN_PROFILE_HEADER}: ${AUTHZEN_PROFILE_V1} on every request, so a response ` +
        `carrying only the boolean means the gateway did not honour the negotiation — an ` +
        `older build, or a proxy that dropped the header. The obligations and the approval ` +
        `challenge that CONSTRAIN an allow ride in that payload, so an allow without it is ` +
        `an allow whose mandatory conditions cannot be read. body=${body}`
    );
  }

  const context = response.context;
  if (context.profile !== AUTHZEN_PROFILE_V1) {
    throw new AuthZENProtocolError(
      `the server answered with AuthZEN profile '${context.profile}'; this build can only ` +
        `interpret '${AUTHZEN_PROFILE_V1}'. The obligations and approval challenge that ` +
        `constrain an allow are carried in that payload, so the decision cannot be acted ` +
        `on safely. Upgrade the SDK.`
    );
  }

  if (!AUTHZEN_OPERATIONAL_STATE_VALUES.includes(context.state)) {
    throw new AuthZENProtocolError(
      `the server reported the operational state '${context.state}', which this build does ` +
        `not know. Under profile ${AUTHZEN_PROFILE_V1} the state set is closed, so a new ` +
        `value means the response was produced by something this SDK cannot interpret — ` +
        `and a state whose meaning is unknown must not be resolved into permission. ` +
        `body=${body}`
    );
  }

  const executable = context.state === AUTHZEN_OPERATIONAL_STATE_ALLOW;
  if (response.decision !== executable) {
    throw new AuthZENProtocolError(
      `the decision boolean (${response.decision}) and the operational state ` +
        `(${context.state}) disagree; exactly one state permits execution, so one of the ` +
        `two renderings of this outcome is wrong and there is no safe way to choose ` +
        `between them. body=${body}`
    );
  }

  if (!executable && context.obligations && context.obligations.length > 0) {
    throw new AuthZENProtocolError(
      `the server attached obligations to a ${context.state} decision. Obligations ride ` +
        `only on an executable decision: instructions on a refusal invite an enforcement ` +
        `point to discharge them and proceed. body=${body}`
    );
  }

  // `schema_version` is deliberately NOT enforced. The PROFILE is the
  // negotiated contract and is checked above; schema_version is carried so a
  // support conversation can name the contract a deployment answered from.
  // Enforcing both would mean the two have to be bumped in lockstep, and this
  // SDK would start refusing decisions over a discrepancy that changes nothing
  // it reads.
}

/** Decode a structured refusal document, or undefined if the body is not one. */
function decodeRefusal(body: string): AuthZENError | undefined {
  try {
    return validateAuthZENError(JSON.parse(body), '');
  } catch {
    return undefined;
  }
}

/** What `evaluateEnvelope` needs from the SDK's own HTTP path. */
export type AuthZENTransport = (
  path: string,
  body: unknown,
  headers: Record<string, string>
) => Promise<{ status: number; body: string }>;

/**
 * Run one envelope through `send` and interpret the answer.
 *
 * `send` is the SDK's own transport — the same authenticated fetch wrapper,
 * headers and heartbeat gate every other method uses. It is passed in rather
 * than built here so this module owns the AuthZEN semantics and nothing else; a
 * second transport would be a second place for credentials, timeouts and proxy
 * configuration to drift out of step with the client the user configured.
 */
export async function evaluateEnvelope(
  send: AuthZENTransport,
  envelope: AuthZENEnvelope
): Promise<AuthZENDecision> {
  const resolved = resolveEnvelope(envelope);
  // Completeness runs FIRST, so a missing subject/action/resource is reported
  // as `incomplete_evaluation` for both envelope shapes. The generated
  // validator would otherwise reach the singular member's own required set
  // first and report the same mistake under a different code depending on
  // which shape the caller used.
  //
  // Except when the envelope names BOTH members: its fault is not that an
  // evaluation is incomplete, and answering "no action" for a request whose
  // real problem is that it asks two questions at once sends the caller to the
  // wrong member entirely.
  if (resolved.evaluation === undefined || resolved.evaluations === undefined) {
    checkEnvelopeComplete(resolved);
  }

  let wire: AuthZENEnvelope;
  try {
    wire = validateAuthZENEnvelope(stripUndefined(resolved), '');
  } catch (err) {
    if (!(err instanceof AuthZENSchemaError)) throw err;
    throw new AuthZENRefusal(AUTHZEN_ERROR_CODE_MALFORMED_ENVELOPE, err.message, {
      refusedBy: 'client',
      pointer: err.pointer,
    });
  }

  const { status, body } = await send(AUTHZEN_PATH, wire, {
    [AUTHZEN_PROFILE_HEADER]: AUTHZEN_PROFILE_V1,
  });

  if (status === 401) {
    // Authentication is answered by the gateway's own middleware, before the
    // route runs, so it never carries an AuthZEN refusal document. Surfacing it
    // as the SDK's existing AuthenticationError keeps one error for "your
    // credentials are wrong" across every method on this client, instead of a
    // second one only AuthZEN callers know to catch.
    throw new AuthenticationError(`Invalid credentials for ${AUTHZEN_PATH}: ${body}`);
  }

  if (status !== 200) {
    const refusal = decodeRefusal(body);
    if (refusal) throw AuthZENRefusal.fromBody(refusal);
    // A non-OK body that is not a refusal document still surfaces as an error —
    // never as a decision.
    throw new AxonFlowError(`HTTP ${status} from ${AUTHZEN_PATH}: ${body}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new AuthZENProtocolError(
      `the decision could not be decoded: ${(err as Error).message}. body=${body}`
    );
  }

  let response: AuthZENResponse;
  try {
    // Strict decoding on the success path. An unknown member in a decision is a
    // server speaking a profile this build does not understand, and quietly
    // dropping it would mean acting on a partial reading of an authorization
    // decision. A TypeScript cast would do none of this — the interface is
    // erased at runtime — which is why the validator is generated.
    response = validateAuthZENResponse(parsed, '');
  } catch (err) {
    throw new AuthZENProtocolError(
      `the decision could not be decoded: ${(err as Error).message}. body=${body}`
    );
  }

  validateDecision(response, body);
  return new AuthZENDecision(response);
}

/**
 * Drop `undefined` members so they are not serialised as `null`.
 *
 * `JSON.stringify` already omits an `undefined` property, but the generated
 * validator runs BEFORE serialisation and would otherwise see the key present
 * with an undefined value. Normalising here means the validator, the bytes on
 * the wire and `toWire` below all describe the same document.
 */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (item !== undefined) out[key] = stripUndefined(item);
    });
    return out;
  }
  return value;
}

/**
 * The exact document this SDK would send for `envelope`.
 *
 * Exported for tests and for support: "what did the SDK actually put on the
 * wire" is the first question of every integration problem, and answering it by
 * reading the client's source is how the answer ends up wrong.
 */
export function toWire(envelope: AuthZENEnvelope): AuthZENEnvelope {
  const resolved = resolveEnvelope(envelope);
  if (resolved.evaluation === undefined || resolved.evaluations === undefined) {
    checkEnvelopeComplete(resolved);
  }
  return validateAuthZENEnvelope(stripUndefined(resolved), '');
}
