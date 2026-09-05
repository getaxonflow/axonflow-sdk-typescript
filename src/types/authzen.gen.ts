/**
 * AuthZEN wire types and validators. GENERATED FILE — DO NOT EDIT.
 *
 * Source: tests/fixtures/authzen-surface.json
 *   artifact:        axonflow-authzen-surface v1
 *   profile:         axonflow-authzen-profile-2026-08-29
 *   contract schema: 2026-08-29
 *   schema digest:   sha256:04f63f4d97215faa9fbf2b6a5152630f7310edbe47440b975d0f66ad63df811f
 *
 * Regenerate with:
 *
 *   node scripts/gen-authzen-types/generate.js
 *
 * Editing this file by hand is pointless: tests/authzen-generator.test.ts
 * regenerates it in memory and compares bytes, so a hand edit fails CI on the
 * next run.
 */

// The profile a Policy Enforcement Point negotiates to receive anything beyond the
// boolean decision. AuthZEN 1.0's response is a bare boolean; the four-valued state,
// the obligations, the approval challenge and the safe reason code all ride in the
// response context and are returned ONLY to a caller that asked for them by version.
export const AUTHZEN_PROFILE_V1 = 'axonflow-authzen-profile-2026-08-29';

// The contract version these types were generated from. It is the value the server
// echoes in AuthZENResponseContext.schema_version.
export const AUTHZEN_CONTRACT_SCHEMA_VERSION = '2026-08-29';

// The one route the AuthZEN surface is served on, and the request header the profile
// is negotiated with. Both are generated from the platform's contract through the
// artifact, not written here: a rename on the platform is a regenerate-and-diff
// failure in this SDK, not a 404 in production (axonflow-enterprise#3603).
export const AUTHZEN_PATH = '/api/v1/access/evaluation';
export const AUTHZEN_PROFILE_HEADER = 'X-Axonflow-AuthZEN-Profile';

// The digest of the JSON Schema the artifact was reduced from. It is carried so a
// support conversation can establish which contract a deployed SDK was built against
// without reading its dependency tree.
export const AUTHZEN_SOURCE_SCHEMA_SHA256 =
  'sha256:04f63f4d97215faa9fbf2b6a5152630f7310edbe47440b975d0f66ad63df811f';

/**
 * Raised when a value does not match the AuthZEN contract. The message always
 * names a JSON Pointer, because on this surface the pointer IS the diagnosis:
 * "unsupported_subject" without the offending member is a puzzle.
 */
export class AuthZENSchemaError extends Error {
  public readonly pointer: string;

  constructor(pointer: string, detail: string) {
    super(`${pointer || '/'} ${detail}`);
    this.name = 'AuthZENSchemaError';
    this.pointer = pointer;
    Object.setPrototypeOf(this, AuthZENSchemaError.prototype);
  }
}

export function authzenFail(pointer: string, detail: string): never {
  throw new AuthZENSchemaError(pointer, detail);
}

export function authzenObject(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    authzenFail(at, 'must be an object');
  }
  return { ...(value as Record<string, unknown>) };
}

export function authzenString(value: unknown, at: string): string {
  if (typeof value !== 'string') {
    authzenFail(at, 'must be a string');
  }
  return value as string;
}

export function authzenBoolean(value: unknown, at: string): boolean {
  if (typeof value !== 'boolean') {
    authzenFail(at, 'must be a boolean');
  }
  return value as boolean;
}

// An integer, not merely a number. The artifact distinguishes them, and a
// fractional schema_version is not a schema_version.
export function authzenInteger(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    authzenFail(at, 'must be an integer');
  }
  return value as number;
}

export function authzenArray(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) {
    authzenFail(at, 'must be an array');
  }
  return value as unknown[];
}

/**
 * Refuse a member the contract does not declare.
 *
 * On the RESPONSE path this is the whole strictness argument: a member this
 * build has never heard of means the server is speaking a profile it cannot
 * fully read, and dropping it silently would mean acting on a partial reading
 * of an authorization decision. On the REQUEST path it catches a member the
 * caller invented before it becomes a 422.
 */
export function authzenNoExtraMembers(
  obj: Record<string, unknown>,
  at: string,
  known: readonly string[]
): void {
  const extra = Object.keys(obj)
    .filter(key => !known.includes(key))
    .sort();
  if (extra.length > 0) {
    authzenFail(at, `carries members this build does not understand: ${extra.join(', ')}`);
  }
}

/**
 * AuthZENErrorCode is a closed set of values the server may send. The trailing
 * `(string & {})` keeps an unrecognised value from a newer server assignable instead
 * of a compile error, while the named members still autocomplete. Use
 * AUTHZEN_ERROR_CODE_VALUES to tell a value this build knows from one it does not.
 */
export type AuthZENErrorCode =
  | 'malformed_envelope'
  | 'incomplete_evaluation'
  | 'unsupported_subject'
  | 'unsupported_action'
  | 'unsupported_resource'
  | 'unevaluable_attribute'
  | 'missing_evaluable_content'
  | 'evaluation_unavailable'
  | (string & {});

export const AUTHZEN_ERROR_CODE_MALFORMED_ENVELOPE: AuthZENErrorCode = 'malformed_envelope';
export const AUTHZEN_ERROR_CODE_INCOMPLETE_EVALUATION: AuthZENErrorCode = 'incomplete_evaluation';
export const AUTHZEN_ERROR_CODE_UNSUPPORTED_SUBJECT: AuthZENErrorCode = 'unsupported_subject';
export const AUTHZEN_ERROR_CODE_UNSUPPORTED_ACTION: AuthZENErrorCode = 'unsupported_action';
export const AUTHZEN_ERROR_CODE_UNSUPPORTED_RESOURCE: AuthZENErrorCode = 'unsupported_resource';
export const AUTHZEN_ERROR_CODE_UNEVALUABLE_ATTRIBUTE: AuthZENErrorCode = 'unevaluable_attribute';
export const AUTHZEN_ERROR_CODE_MISSING_EVALUABLE_CONTENT: AuthZENErrorCode =
  'missing_evaluable_content';
export const AUTHZEN_ERROR_CODE_EVALUATION_UNAVAILABLE: AuthZENErrorCode = 'evaluation_unavailable';

// Every value of authzen_error_code this build knows, in the artifact's order.
export const AUTHZEN_ERROR_CODE_VALUES: readonly AuthZENErrorCode[] = [
  AUTHZEN_ERROR_CODE_MALFORMED_ENVELOPE,
  AUTHZEN_ERROR_CODE_INCOMPLETE_EVALUATION,
  AUTHZEN_ERROR_CODE_UNSUPPORTED_SUBJECT,
  AUTHZEN_ERROR_CODE_UNSUPPORTED_ACTION,
  AUTHZEN_ERROR_CODE_UNSUPPORTED_RESOURCE,
  AUTHZEN_ERROR_CODE_UNEVALUABLE_ATTRIBUTE,
  AUTHZEN_ERROR_CODE_MISSING_EVALUABLE_CONTENT,
  AUTHZEN_ERROR_CODE_EVALUATION_UNAVAILABLE,
];

/**
 * AuthZENCategory is a closed set of values the server may send. The trailing `(string
 * & {})` keeps an unrecognised value from a newer server assignable instead of a
 * compile error, while the named members still autocomplete. Use
 * AUTHZEN_CATEGORY_VALUES to tell a value this build knows from one it does not.
 */
export type AuthZENCategory =
  | 'allowed'
  | 'not_permitted'
  | 'approval_required'
  | 'temporarily_unavailable'
  | 'invalid_request'
  | (string & {});

export const AUTHZEN_CATEGORY_ALLOWED: AuthZENCategory = 'allowed';
export const AUTHZEN_CATEGORY_NOT_PERMITTED: AuthZENCategory = 'not_permitted';
export const AUTHZEN_CATEGORY_APPROVAL_REQUIRED: AuthZENCategory = 'approval_required';
export const AUTHZEN_CATEGORY_TEMPORARILY_UNAVAILABLE: AuthZENCategory = 'temporarily_unavailable';
export const AUTHZEN_CATEGORY_INVALID_REQUEST: AuthZENCategory = 'invalid_request';

// Every value of category this build knows, in the artifact's order.
export const AUTHZEN_CATEGORY_VALUES: readonly AuthZENCategory[] = [
  AUTHZEN_CATEGORY_ALLOWED,
  AUTHZEN_CATEGORY_NOT_PERMITTED,
  AUTHZEN_CATEGORY_APPROVAL_REQUIRED,
  AUTHZEN_CATEGORY_TEMPORARILY_UNAVAILABLE,
  AUTHZEN_CATEGORY_INVALID_REQUEST,
];

/**
 * AuthZENIdentifierKind is a closed set of values the server may send. The trailing
 * `(string & {})` keeps an unrecognised value from a newer server assignable instead
 * of a compile error, while the named members still autocomplete. Use
 * AUTHZEN_IDENTIFIER_KIND_VALUES to tell a value this build knows from one it does
 * not.
 */
export type AuthZENIdentifierKind =
  | 'organization'
  | 'principal'
  | 'group'
  | 'resource'
  | 'action'
  | 'tool'
  | 'client'
  | 'session'
  | (string & {});

export const AUTHZEN_IDENTIFIER_KIND_ORGANIZATION: AuthZENIdentifierKind = 'organization';
export const AUTHZEN_IDENTIFIER_KIND_PRINCIPAL: AuthZENIdentifierKind = 'principal';
export const AUTHZEN_IDENTIFIER_KIND_GROUP: AuthZENIdentifierKind = 'group';
export const AUTHZEN_IDENTIFIER_KIND_RESOURCE: AuthZENIdentifierKind = 'resource';
export const AUTHZEN_IDENTIFIER_KIND_ACTION: AuthZENIdentifierKind = 'action';
export const AUTHZEN_IDENTIFIER_KIND_TOOL: AuthZENIdentifierKind = 'tool';
export const AUTHZEN_IDENTIFIER_KIND_CLIENT: AuthZENIdentifierKind = 'client';
export const AUTHZEN_IDENTIFIER_KIND_SESSION: AuthZENIdentifierKind = 'session';

// Every value of identifier_kind this build knows, in the artifact's order.
export const AUTHZEN_IDENTIFIER_KIND_VALUES: readonly AuthZENIdentifierKind[] = [
  AUTHZEN_IDENTIFIER_KIND_ORGANIZATION,
  AUTHZEN_IDENTIFIER_KIND_PRINCIPAL,
  AUTHZEN_IDENTIFIER_KIND_GROUP,
  AUTHZEN_IDENTIFIER_KIND_RESOURCE,
  AUTHZEN_IDENTIFIER_KIND_ACTION,
  AUTHZEN_IDENTIFIER_KIND_TOOL,
  AUTHZEN_IDENTIFIER_KIND_CLIENT,
  AUTHZEN_IDENTIFIER_KIND_SESSION,
];

/**
 * AuthZENObligationType is a closed set of values the server may send. The trailing
 * `(string & {})` keeps an unrecognised value from a newer server assignable instead
 * of a compile error, while the named members still autocomplete. Use
 * AUTHZEN_OBLIGATION_TYPE_VALUES to tell a value this build knows from one it does
 * not.
 */
export type AuthZENObligationType =
  | 'approval_challenge'
  | 'field_remove'
  | 'field_redact'
  | 'field_hash'
  | 'field_mask'
  | 'field_annotate'
  | 'field_tokenize'
  | 'schema_transform'
  | 'response_filter'
  | 'route_restriction'
  | 'step_up_authentication'
  | 'quota_reservation'
  | 'immutable_audit'
  | 'notification'
  | (string & {});

export const AUTHZEN_OBLIGATION_TYPE_APPROVAL_CHALLENGE: AuthZENObligationType =
  'approval_challenge';
export const AUTHZEN_OBLIGATION_TYPE_FIELD_REMOVE: AuthZENObligationType = 'field_remove';
export const AUTHZEN_OBLIGATION_TYPE_FIELD_REDACT: AuthZENObligationType = 'field_redact';
export const AUTHZEN_OBLIGATION_TYPE_FIELD_HASH: AuthZENObligationType = 'field_hash';
export const AUTHZEN_OBLIGATION_TYPE_FIELD_MASK: AuthZENObligationType = 'field_mask';
export const AUTHZEN_OBLIGATION_TYPE_FIELD_ANNOTATE: AuthZENObligationType = 'field_annotate';
export const AUTHZEN_OBLIGATION_TYPE_FIELD_TOKENIZE: AuthZENObligationType = 'field_tokenize';
export const AUTHZEN_OBLIGATION_TYPE_SCHEMA_TRANSFORM: AuthZENObligationType = 'schema_transform';
export const AUTHZEN_OBLIGATION_TYPE_RESPONSE_FILTER: AuthZENObligationType = 'response_filter';
export const AUTHZEN_OBLIGATION_TYPE_ROUTE_RESTRICTION: AuthZENObligationType = 'route_restriction';
export const AUTHZEN_OBLIGATION_TYPE_STEP_UP_AUTHENTICATION: AuthZENObligationType =
  'step_up_authentication';
export const AUTHZEN_OBLIGATION_TYPE_QUOTA_RESERVATION: AuthZENObligationType = 'quota_reservation';
export const AUTHZEN_OBLIGATION_TYPE_IMMUTABLE_AUDIT: AuthZENObligationType = 'immutable_audit';
export const AUTHZEN_OBLIGATION_TYPE_NOTIFICATION: AuthZENObligationType = 'notification';

// Every value of obligation_type this build knows, in the artifact's order.
export const AUTHZEN_OBLIGATION_TYPE_VALUES: readonly AuthZENObligationType[] = [
  AUTHZEN_OBLIGATION_TYPE_APPROVAL_CHALLENGE,
  AUTHZEN_OBLIGATION_TYPE_FIELD_REMOVE,
  AUTHZEN_OBLIGATION_TYPE_FIELD_REDACT,
  AUTHZEN_OBLIGATION_TYPE_FIELD_HASH,
  AUTHZEN_OBLIGATION_TYPE_FIELD_MASK,
  AUTHZEN_OBLIGATION_TYPE_FIELD_ANNOTATE,
  AUTHZEN_OBLIGATION_TYPE_FIELD_TOKENIZE,
  AUTHZEN_OBLIGATION_TYPE_SCHEMA_TRANSFORM,
  AUTHZEN_OBLIGATION_TYPE_RESPONSE_FILTER,
  AUTHZEN_OBLIGATION_TYPE_ROUTE_RESTRICTION,
  AUTHZEN_OBLIGATION_TYPE_STEP_UP_AUTHENTICATION,
  AUTHZEN_OBLIGATION_TYPE_QUOTA_RESERVATION,
  AUTHZEN_OBLIGATION_TYPE_IMMUTABLE_AUDIT,
  AUTHZEN_OBLIGATION_TYPE_NOTIFICATION,
];

/**
 * AuthZENOperationalState is a closed set of values the server may send. The trailing
 * `(string & {})` keeps an unrecognised value from a newer server assignable instead
 * of a compile error, while the named members still autocomplete. Use
 * AUTHZEN_OPERATIONAL_STATE_VALUES to tell a value this build knows from one it does
 * not.
 */
export type AuthZENOperationalState = 'ALLOW' | 'DENY' | 'CHALLENGE' | 'ERROR' | (string & {});

export const AUTHZEN_OPERATIONAL_STATE_ALLOW: AuthZENOperationalState = 'ALLOW';
export const AUTHZEN_OPERATIONAL_STATE_DENY: AuthZENOperationalState = 'DENY';
export const AUTHZEN_OPERATIONAL_STATE_CHALLENGE: AuthZENOperationalState = 'CHALLENGE';
export const AUTHZEN_OPERATIONAL_STATE_ERROR: AuthZENOperationalState = 'ERROR';

// Every value of operational_state this build knows, in the artifact's order.
export const AUTHZEN_OPERATIONAL_STATE_VALUES: readonly AuthZENOperationalState[] = [
  AUTHZEN_OPERATIONAL_STATE_ALLOW,
  AUTHZEN_OPERATIONAL_STATE_DENY,
  AUTHZEN_OPERATIONAL_STATE_CHALLENGE,
  AUTHZEN_OPERATIONAL_STATE_ERROR,
];

/**
 * AuthZENReasonCode is a closed set of values the server may send. The trailing
 * `(string & {})` keeps an unrecognised value from a newer server assignable instead
 * of a compile error, while the named members still autocomplete. Use
 * AUTHZEN_REASON_CODE_VALUES to tell a value this build knows from one it does not.
 */
export type AuthZENReasonCode =
  | 'permitted'
  | 'approval_required'
  | 'explicit_constraint'
  | 'no_matching_permission'
  | 'unknown_constraint'
  | 'unknown_permission'
  | 'unknown_requirement'
  | 'invalid_input'
  | 'evaluation_error'
  | 'unsupported_obligation'
  | 'obligation_conflict'
  | 'unknown_action'
  | 'unknown_realm'
  | 'schema_violation'
  | 'delegation_depth_exceeded'
  | 'budget_exhausted'
  | 'binding_mismatch'
  | 'approval_unsatisfiable'
  | 'approval_expired'
  | 'authoring_rejected'
  | (string & {});

export const AUTHZEN_REASON_CODE_PERMITTED: AuthZENReasonCode = 'permitted';
export const AUTHZEN_REASON_CODE_APPROVAL_REQUIRED: AuthZENReasonCode = 'approval_required';
export const AUTHZEN_REASON_CODE_EXPLICIT_CONSTRAINT: AuthZENReasonCode = 'explicit_constraint';
export const AUTHZEN_REASON_CODE_NO_MATCHING_PERMISSION: AuthZENReasonCode =
  'no_matching_permission';
export const AUTHZEN_REASON_CODE_UNKNOWN_CONSTRAINT: AuthZENReasonCode = 'unknown_constraint';
export const AUTHZEN_REASON_CODE_UNKNOWN_PERMISSION: AuthZENReasonCode = 'unknown_permission';
export const AUTHZEN_REASON_CODE_UNKNOWN_REQUIREMENT: AuthZENReasonCode = 'unknown_requirement';
export const AUTHZEN_REASON_CODE_INVALID_INPUT: AuthZENReasonCode = 'invalid_input';
export const AUTHZEN_REASON_CODE_EVALUATION_ERROR: AuthZENReasonCode = 'evaluation_error';
export const AUTHZEN_REASON_CODE_UNSUPPORTED_OBLIGATION: AuthZENReasonCode =
  'unsupported_obligation';
export const AUTHZEN_REASON_CODE_OBLIGATION_CONFLICT: AuthZENReasonCode = 'obligation_conflict';
export const AUTHZEN_REASON_CODE_UNKNOWN_ACTION: AuthZENReasonCode = 'unknown_action';
export const AUTHZEN_REASON_CODE_UNKNOWN_REALM: AuthZENReasonCode = 'unknown_realm';
export const AUTHZEN_REASON_CODE_SCHEMA_VIOLATION: AuthZENReasonCode = 'schema_violation';
export const AUTHZEN_REASON_CODE_DELEGATION_DEPTH_EXCEEDED: AuthZENReasonCode =
  'delegation_depth_exceeded';
export const AUTHZEN_REASON_CODE_BUDGET_EXHAUSTED: AuthZENReasonCode = 'budget_exhausted';
export const AUTHZEN_REASON_CODE_BINDING_MISMATCH: AuthZENReasonCode = 'binding_mismatch';
export const AUTHZEN_REASON_CODE_APPROVAL_UNSATISFIABLE: AuthZENReasonCode =
  'approval_unsatisfiable';
export const AUTHZEN_REASON_CODE_APPROVAL_EXPIRED: AuthZENReasonCode = 'approval_expired';
export const AUTHZEN_REASON_CODE_AUTHORING_REJECTED: AuthZENReasonCode = 'authoring_rejected';

// Every value of reason_code this build knows, in the artifact's order.
export const AUTHZEN_REASON_CODE_VALUES: readonly AuthZENReasonCode[] = [
  AUTHZEN_REASON_CODE_PERMITTED,
  AUTHZEN_REASON_CODE_APPROVAL_REQUIRED,
  AUTHZEN_REASON_CODE_EXPLICIT_CONSTRAINT,
  AUTHZEN_REASON_CODE_NO_MATCHING_PERMISSION,
  AUTHZEN_REASON_CODE_UNKNOWN_CONSTRAINT,
  AUTHZEN_REASON_CODE_UNKNOWN_PERMISSION,
  AUTHZEN_REASON_CODE_UNKNOWN_REQUIREMENT,
  AUTHZEN_REASON_CODE_INVALID_INPUT,
  AUTHZEN_REASON_CODE_EVALUATION_ERROR,
  AUTHZEN_REASON_CODE_UNSUPPORTED_OBLIGATION,
  AUTHZEN_REASON_CODE_OBLIGATION_CONFLICT,
  AUTHZEN_REASON_CODE_UNKNOWN_ACTION,
  AUTHZEN_REASON_CODE_UNKNOWN_REALM,
  AUTHZEN_REASON_CODE_SCHEMA_VIOLATION,
  AUTHZEN_REASON_CODE_DELEGATION_DEPTH_EXCEEDED,
  AUTHZEN_REASON_CODE_BUDGET_EXHAUSTED,
  AUTHZEN_REASON_CODE_BINDING_MISMATCH,
  AUTHZEN_REASON_CODE_APPROVAL_UNSATISFIABLE,
  AUTHZEN_REASON_CODE_APPROVAL_EXPIRED,
  AUTHZEN_REASON_CODE_AUTHORING_REJECTED,
];

/**
 * One immutable threshold clause: a quorum of distinct approvers drawn from a named
 * eligible set. It is named here rather than inlined under approval_requirement so it
 * corresponds one-to-one with the Go ApprovalClause, which is what lets the drift
 * guard compare it and every SDK generate it as a type rather than an anonymous shape.
 */
export interface AuthZENApprovalClause {
  quorum: number;

  eligible: AuthZENIdentifier[];
}

/**
 * A conjunction of immutable threshold clauses. Clauses are never collapsed by pool
 * intersection or union.
 */
export interface AuthZENApprovalRequirement {
  all_of: AuthZENApprovalClause[];

  separation_of_duties: boolean;

  expires_at: string;
}

/**
 * The AuthZEN action object.
 */
export interface AuthZENAction {
  name: string;

  properties?: Record<string, unknown>;
}

/**
 * The plural envelope: a shared subject, action, resource and context at the top
 * level, with one entry per decision. The number of decisions is fixed by the MAPPING,
 * never by argument data, so an empty evaluations array is malformed rather than a
 * request for zero decisions.
 */
export interface AuthZENBulk {
  subject?: AuthZENSubject;

  action?: AuthZENAction;

  resource?: AuthZENResource;

  context?: Record<string, unknown>;

  evaluations: AuthZENRequest[];
}

/**
 * The top level. Exactly two members are defined and exactly one may be PRESENT.
 * Presence is decided on the KEY SET, not on a decoded pointer, so {"evaluation":
 * {...}, "evaluations": null} carries both declared members and is malformed.
 */
export interface AuthZENEnvelope {
  /**
   * The singular member. Unlike a plural entry it has no shared base to inherit from,
   * so it must carry its own subject, action and resource.
   */
  evaluation?: AuthZENRequest;

  evaluations?: AuthZENBulk;
}

/**
 * The structured refusal body, returned when a request could not be EVALUATED. It is a
 * separate shape from the response rather than an extra member on it, because a
 * refusal is not a decision: a response carrying decision=false says the request was
 * evaluated and denied, and returning that for a request that was never evaluated
 * would make 'denied' and 'unevaluable' the same event in every audit and every client
 * branch.
 */
export interface AuthZENError {
  code: AuthZENErrorCode;

  pointer?: string;

  message: string;

  supported?: string[];

  request_id?: string;
}

/**
 * One subject-action-resource-context evaluation. Every member is structurally
 * OPTIONAL here because a plural-envelope entry inherits any member it omits from the
 * envelope's shared base. The completeness invariant - that the MERGED entry carries a
 * subject, an action and a resource - is a cross-object property this document cannot
 * express, and AuthZENEnvelope.Project enforces it. A validator that passes this
 * schema has therefore NOT established completeness, which is why the singular member
 * below carries its own required list.
 */
export interface AuthZENRequest {
  subject?: AuthZENSubject;

  action?: AuthZENAction;

  resource?: AuthZENResource;

  context?: Record<string, unknown>;
}

/**
 * The AuthZEN resource object.
 */
export interface AuthZENResource {
  type: string;

  id: string;

  properties?: Record<string, unknown>;
}

/**
 * The AuthZEN reply. `decision` is the collapsed boolean: ALLOW is true and every
 * other state is false. It is the only member an un-negotiated enforcement point
 * receives.
 */
export interface AuthZENResponse {
  decision: boolean;

  context?: AuthZENResponseContext;
}

/**
 * The versioned AxonFlow profile payload. It is present only for a Policy Enforcement
 * Point that NEGOTIATED the profile; one that did not receives the boolean alone,
 * because handing a partial interpretation to a plane that cannot act on it is the
 * failure ADR-065 invariant 12 forbids.
 */
export interface AuthZENResponseContext {
  // The only value the server sends is 'axonflow-authzen-profile-2026-08-29'.
  profile: string;

  state: AuthZENOperationalState;

  category: AuthZENCategory;

  reason?: AuthZENReasonCode;

  obligations?: AuthZENObligation[];

  approval?: AuthZENApprovalRequirement;

  decision_id: string;

  schema_version: string;
}

/**
 * The AuthZEN subject object. type and id are canonical identifier components; a
 * display name, an email or a token claim is never one of them.
 */
export interface AuthZENSubject {
  type: string;

  id: string;

  properties?: Record<string, unknown>;
}

/**
 * A canonical identifier. Display names, emails, token claims, connector names and
 * aliases are never identifiers.
 */
export interface AuthZENIdentifier {
  kind: AuthZENIdentifierKind;

  type: string;

  qualifier?: string;

  local: string;
}

/**
 * One typed instruction owned by a named enforcement component.
 */
export interface AuthZENObligation {
  type: AuthZENObligationType;

  target?: string;

  params?: Record<string, string>;

  mandatory: boolean;

  source_policy: string;

  schema_version: number;
}

/**
 * Validate an unknown value as AuthZENApprovalClause, or throw naming the member at
 * fault. Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENApprovalClause(value: unknown, at: string): AuthZENApprovalClause {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['quorum', 'eligible']);
  if (obj['quorum'] === undefined || obj['quorum'] === null) {
    authzenFail(`${at}/quorum`, 'is required');
  } else {
    authzenInteger(obj['quorum'], `${at}/quorum`);
  }
  if (obj['eligible'] === undefined || obj['eligible'] === null) {
    authzenFail(`${at}/eligible`, 'is required');
  } else {
    const items = authzenArray(obj['eligible'], `${at}/eligible`);
    if (items.length < 1) {
      authzenFail(`${at}/eligible`, 'needs at least 1 entry');
    }
    obj['eligible'] = items.map((item, index) =>
      validateAuthZENIdentifier(item, `${`${at}/eligible`}/${index}`)
    );
  }
  return obj as unknown as AuthZENApprovalClause;
}

/**
 * Validate an unknown value as AuthZENApprovalRequirement, or throw naming the member
 * at fault. Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENApprovalRequirement(
  value: unknown,
  at: string
): AuthZENApprovalRequirement {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['all_of', 'separation_of_duties', 'expires_at']);
  if (obj['all_of'] === undefined || obj['all_of'] === null) {
    authzenFail(`${at}/all_of`, 'is required');
  } else {
    const items = authzenArray(obj['all_of'], `${at}/all_of`);
    if (items.length < 1) {
      authzenFail(`${at}/all_of`, 'needs at least 1 entry');
    }
    obj['all_of'] = items.map((item, index) =>
      validateAuthZENApprovalClause(item, `${`${at}/all_of`}/${index}`)
    );
  }
  if (obj['separation_of_duties'] === undefined || obj['separation_of_duties'] === null) {
    authzenFail(`${at}/separation_of_duties`, 'is required');
  } else {
    authzenBoolean(obj['separation_of_duties'], `${at}/separation_of_duties`);
  }
  if (obj['expires_at'] === undefined || obj['expires_at'] === null) {
    authzenFail(`${at}/expires_at`, 'is required');
  } else {
    authzenString(obj['expires_at'], `${at}/expires_at`);
  }
  return obj as unknown as AuthZENApprovalRequirement;
}

/**
 * Validate an unknown value as AuthZENAction, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENAction(value: unknown, at: string): AuthZENAction {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['name', 'properties']);
  if (obj['name'] === undefined || obj['name'] === null) {
    authzenFail(`${at}/name`, 'is required');
  } else {
    const raw = authzenString(obj['name'], `${at}/name`);
    if (raw.length < 1) {
      authzenFail(`${at}/name`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['properties'] === undefined || obj['properties'] === null) {
    delete obj['properties'];
  } else {
    authzenObject(obj['properties'], `${at}/properties`);
  }
  return obj as unknown as AuthZENAction;
}

/**
 * Validate an unknown value as AuthZENBulk, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENBulk(value: unknown, at: string): AuthZENBulk {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['subject', 'action', 'resource', 'context', 'evaluations']);
  if (obj['subject'] === undefined || obj['subject'] === null) {
    delete obj['subject'];
  } else {
    obj['subject'] = validateAuthZENSubject(obj['subject'], `${at}/subject`);
  }
  if (obj['action'] === undefined || obj['action'] === null) {
    delete obj['action'];
  } else {
    obj['action'] = validateAuthZENAction(obj['action'], `${at}/action`);
  }
  if (obj['resource'] === undefined || obj['resource'] === null) {
    delete obj['resource'];
  } else {
    obj['resource'] = validateAuthZENResource(obj['resource'], `${at}/resource`);
  }
  if (obj['context'] === undefined || obj['context'] === null) {
    delete obj['context'];
  } else {
    authzenObject(obj['context'], `${at}/context`);
  }
  if (obj['evaluations'] === undefined || obj['evaluations'] === null) {
    authzenFail(`${at}/evaluations`, 'is required');
  } else {
    const items = authzenArray(obj['evaluations'], `${at}/evaluations`);
    if (items.length < 1) {
      authzenFail(`${at}/evaluations`, 'needs at least 1 entry');
    }
    obj['evaluations'] = items.map((item, index) =>
      validateAuthZENRequest(item, `${`${at}/evaluations`}/${index}`)
    );
  }
  return obj as unknown as AuthZENBulk;
}

/**
 * Validate an unknown value as AuthZENEnvelope, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENEnvelope(value: unknown, at: string): AuthZENEnvelope {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['evaluation', 'evaluations']);
  if (obj['evaluation'] === undefined || obj['evaluation'] === null) {
    delete obj['evaluation'];
  } else {
    obj['evaluation'] = validateAuthZENRequest(obj['evaluation'], `${at}/evaluation`);
  }
  if (obj['evaluations'] === undefined || obj['evaluations'] === null) {
    delete obj['evaluations'];
  } else {
    obj['evaluations'] = validateAuthZENBulk(obj['evaluations'], `${at}/evaluations`);
  }
  {
    const set = [obj['evaluation'] !== undefined, obj['evaluations'] !== undefined].filter(
      Boolean
    ).length;
    if (set !== 1) {
      authzenFail(at, `exactly one of evaluation or evaluations must be set, ${set} are`);
    }
  }
  if (obj['evaluation'] !== undefined) {
    const nested = obj['evaluation'] as Record<string, unknown>;
    if (nested['action'] === undefined || nested['action'] === null) {
      authzenFail(`${at}/evaluation`, 'has no action; it has no shared base to inherit one from');
    }
  }
  if (obj['evaluation'] !== undefined) {
    const nested = obj['evaluation'] as Record<string, unknown>;
    if (nested['resource'] === undefined || nested['resource'] === null) {
      authzenFail(`${at}/evaluation`, 'has no resource; it has no shared base to inherit one from');
    }
  }
  if (obj['evaluation'] !== undefined) {
    const nested = obj['evaluation'] as Record<string, unknown>;
    if (nested['subject'] === undefined || nested['subject'] === null) {
      authzenFail(`${at}/evaluation`, 'has no subject; it has no shared base to inherit one from');
    }
  }
  return obj as unknown as AuthZENEnvelope;
}

/**
 * Validate an unknown value as AuthZENError, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENError(value: unknown, at: string): AuthZENError {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['code', 'pointer', 'message', 'supported', 'request_id']);
  if (obj['code'] === undefined || obj['code'] === null) {
    authzenFail(`${at}/code`, 'is required');
  } else {
    authzenString(obj['code'], `${at}/code`);
  }
  if (obj['pointer'] === undefined || obj['pointer'] === null) {
    delete obj['pointer'];
  } else {
    authzenString(obj['pointer'], `${at}/pointer`);
  }
  if (obj['message'] === undefined || obj['message'] === null) {
    authzenFail(`${at}/message`, 'is required');
  } else {
    const raw = authzenString(obj['message'], `${at}/message`);
    if (raw.length < 1) {
      authzenFail(`${at}/message`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['supported'] === undefined || obj['supported'] === null) {
    delete obj['supported'];
  } else {
    const items = authzenArray(obj['supported'], `${at}/supported`);
    items.forEach((item, index) => {
      authzenString(item, `${`${at}/supported`}/${index}`);
    });
  }
  if (obj['request_id'] === undefined || obj['request_id'] === null) {
    delete obj['request_id'];
  } else {
    authzenString(obj['request_id'], `${at}/request_id`);
  }
  return obj as unknown as AuthZENError;
}

/**
 * Validate an unknown value as AuthZENRequest, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENRequest(value: unknown, at: string): AuthZENRequest {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['subject', 'action', 'resource', 'context']);
  if (obj['subject'] === undefined || obj['subject'] === null) {
    delete obj['subject'];
  } else {
    obj['subject'] = validateAuthZENSubject(obj['subject'], `${at}/subject`);
  }
  if (obj['action'] === undefined || obj['action'] === null) {
    delete obj['action'];
  } else {
    obj['action'] = validateAuthZENAction(obj['action'], `${at}/action`);
  }
  if (obj['resource'] === undefined || obj['resource'] === null) {
    delete obj['resource'];
  } else {
    obj['resource'] = validateAuthZENResource(obj['resource'], `${at}/resource`);
  }
  if (obj['context'] === undefined || obj['context'] === null) {
    delete obj['context'];
  } else {
    authzenObject(obj['context'], `${at}/context`);
  }
  return obj as unknown as AuthZENRequest;
}

/**
 * Validate an unknown value as AuthZENResource, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENResource(value: unknown, at: string): AuthZENResource {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['type', 'id', 'properties']);
  if (obj['type'] === undefined || obj['type'] === null) {
    authzenFail(`${at}/type`, 'is required');
  } else {
    const raw = authzenString(obj['type'], `${at}/type`);
    if (raw.length < 1) {
      authzenFail(`${at}/type`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['id'] === undefined || obj['id'] === null) {
    authzenFail(`${at}/id`, 'is required');
  } else {
    const raw = authzenString(obj['id'], `${at}/id`);
    if (raw.length < 1) {
      authzenFail(`${at}/id`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['properties'] === undefined || obj['properties'] === null) {
    delete obj['properties'];
  } else {
    authzenObject(obj['properties'], `${at}/properties`);
  }
  return obj as unknown as AuthZENResource;
}

/**
 * Validate an unknown value as AuthZENResponse, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENResponse(value: unknown, at: string): AuthZENResponse {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['decision', 'context']);
  if (obj['decision'] === undefined || obj['decision'] === null) {
    authzenFail(`${at}/decision`, 'is required');
  } else {
    authzenBoolean(obj['decision'], `${at}/decision`);
  }
  if (obj['context'] === undefined || obj['context'] === null) {
    delete obj['context'];
  } else {
    obj['context'] = validateAuthZENResponseContext(obj['context'], `${at}/context`);
  }
  return obj as unknown as AuthZENResponse;
}

/**
 * Validate an unknown value as AuthZENResponseContext, or throw naming the member at
 * fault. Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENResponseContext(value: unknown, at: string): AuthZENResponseContext {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, [
    'profile',
    'state',
    'category',
    'reason',
    'obligations',
    'approval',
    'decision_id',
    'schema_version',
  ]);
  if (obj['profile'] === undefined || obj['profile'] === null) {
    authzenFail(`${at}/profile`, 'is required');
  } else {
    authzenString(obj['profile'], `${at}/profile`);
  }
  if (obj['state'] === undefined || obj['state'] === null) {
    authzenFail(`${at}/state`, 'is required');
  } else {
    authzenString(obj['state'], `${at}/state`);
  }
  if (obj['category'] === undefined || obj['category'] === null) {
    authzenFail(`${at}/category`, 'is required');
  } else {
    authzenString(obj['category'], `${at}/category`);
  }
  if (obj['reason'] === undefined || obj['reason'] === null) {
    delete obj['reason'];
  } else {
    authzenString(obj['reason'], `${at}/reason`);
  }
  if (obj['obligations'] === undefined || obj['obligations'] === null) {
    delete obj['obligations'];
  } else {
    const items = authzenArray(obj['obligations'], `${at}/obligations`);
    obj['obligations'] = items.map((item, index) =>
      validateAuthZENObligation(item, `${`${at}/obligations`}/${index}`)
    );
  }
  if (obj['approval'] === undefined || obj['approval'] === null) {
    delete obj['approval'];
  } else {
    obj['approval'] = validateAuthZENApprovalRequirement(obj['approval'], `${at}/approval`);
  }
  if (obj['decision_id'] === undefined || obj['decision_id'] === null) {
    authzenFail(`${at}/decision_id`, 'is required');
  } else {
    const raw = authzenString(obj['decision_id'], `${at}/decision_id`);
    if (raw.length < 1) {
      authzenFail(
        `${at}/decision_id`,
        'must be at least 1 character(s); it is present but too short'
      );
    }
  }
  if (obj['schema_version'] === undefined || obj['schema_version'] === null) {
    authzenFail(`${at}/schema_version`, 'is required');
  } else {
    const raw = authzenString(obj['schema_version'], `${at}/schema_version`);
    if (raw.length < 1) {
      authzenFail(
        `${at}/schema_version`,
        'must be at least 1 character(s); it is present but too short'
      );
    }
  }
  return obj as unknown as AuthZENResponseContext;
}

/**
 * Validate an unknown value as AuthZENSubject, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENSubject(value: unknown, at: string): AuthZENSubject {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['type', 'id', 'properties']);
  if (obj['type'] === undefined || obj['type'] === null) {
    authzenFail(`${at}/type`, 'is required');
  } else {
    const raw = authzenString(obj['type'], `${at}/type`);
    if (raw.length < 1) {
      authzenFail(`${at}/type`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['id'] === undefined || obj['id'] === null) {
    authzenFail(`${at}/id`, 'is required');
  } else {
    const raw = authzenString(obj['id'], `${at}/id`);
    if (raw.length < 1) {
      authzenFail(`${at}/id`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['properties'] === undefined || obj['properties'] === null) {
    delete obj['properties'];
  } else {
    authzenObject(obj['properties'], `${at}/properties`);
  }
  return obj as unknown as AuthZENSubject;
}

/**
 * Validate an unknown value as AuthZENIdentifier, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENIdentifier(value: unknown, at: string): AuthZENIdentifier {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, ['kind', 'type', 'qualifier', 'local']);
  if (obj['kind'] === undefined || obj['kind'] === null) {
    authzenFail(`${at}/kind`, 'is required');
  } else {
    authzenString(obj['kind'], `${at}/kind`);
  }
  if (obj['type'] === undefined || obj['type'] === null) {
    authzenFail(`${at}/type`, 'is required');
  } else {
    authzenString(obj['type'], `${at}/type`);
  }
  if (obj['qualifier'] === undefined || obj['qualifier'] === null) {
    delete obj['qualifier'];
  } else {
    authzenString(obj['qualifier'], `${at}/qualifier`);
  }
  if (obj['local'] === undefined || obj['local'] === null) {
    authzenFail(`${at}/local`, 'is required');
  } else {
    const raw = authzenString(obj['local'], `${at}/local`);
    if (raw.length < 1) {
      authzenFail(`${at}/local`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  return obj as unknown as AuthZENIdentifier;
}

/**
 * Validate an unknown value as AuthZENObligation, or throw naming the member at fault.
 * Unknown members are REFUSED rather than dropped: on the response path an
 * unrecognised member is a server speaking a profile this build does not understand,
 * and quietly ignoring it would mean acting on a partial reading of an authorization
 * decision.
 */
export function validateAuthZENObligation(value: unknown, at: string): AuthZENObligation {
  const obj = authzenObject(value, at);
  authzenNoExtraMembers(obj, at, [
    'type',
    'target',
    'params',
    'mandatory',
    'source_policy',
    'schema_version',
  ]);
  if (obj['type'] === undefined || obj['type'] === null) {
    authzenFail(`${at}/type`, 'is required');
  } else {
    authzenString(obj['type'], `${at}/type`);
  }
  if (obj['target'] === undefined || obj['target'] === null) {
    delete obj['target'];
  } else {
    const raw = authzenString(obj['target'], `${at}/target`);
    if (raw.length < 1) {
      authzenFail(`${at}/target`, 'must be at least 1 character(s); it is present but too short');
    }
  }
  if (obj['params'] === undefined || obj['params'] === null) {
    delete obj['params'];
  } else {
    const entries = authzenObject(obj['params'], `${at}/params`);
    Object.keys(entries).forEach(key => {
      authzenString(entries[key], `${`${at}/params`}/${key}`);
    });
  }
  if (obj['mandatory'] === undefined || obj['mandatory'] === null) {
    authzenFail(`${at}/mandatory`, 'is required');
  } else {
    authzenBoolean(obj['mandatory'], `${at}/mandatory`);
  }
  if (obj['source_policy'] === undefined || obj['source_policy'] === null) {
    authzenFail(`${at}/source_policy`, 'is required');
  } else {
    const raw = authzenString(obj['source_policy'], `${at}/source_policy`);
    if (raw.length < 1) {
      authzenFail(
        `${at}/source_policy`,
        'must be at least 1 character(s); it is present but too short'
      );
    }
  }
  if (obj['schema_version'] === undefined || obj['schema_version'] === null) {
    authzenFail(`${at}/schema_version`, 'is required');
  } else {
    authzenInteger(obj['schema_version'], `${at}/schema_version`);
  }
  return obj as unknown as AuthZENObligation;
}
