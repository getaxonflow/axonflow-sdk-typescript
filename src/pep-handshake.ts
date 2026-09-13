/**
 * The PEP capability handshake: what this enforcement point can discharge.
 *
 * A v11 platform lets an enforcement point (a PEP) declare, on each governed
 * call, the exact obligation types and schema versions it can carry out. The
 * declaration rides the `X-Axonflow-PEP-Handshake` header as the unpadded
 * base64url encoding of a JSON document:
 *
 *     {"profile_version":1,"pep_id":"...","audience":"...",
 *      "capabilities":[{"type":"field_redact","version":1}]}
 *
 * On an Enterprise deployment, an allow verdict carrying a mandatory obligation
 * the declared set cannot discharge becomes a deny, so the enforcement point is
 * never handed an instruction it would drop. A Community deployment records the
 * declaration and does not deny on it. A capability in a family the
 * deployment's edition does not issue is dropped from the declaration, counted
 * and logged; the request proceeds.
 *
 * WHERE IT IS SENT. Four request planes read the header: `decide`
 * (`/api/v1/decide`), the AuthZEN evaluation route (`evaluate` and
 * `evaluateAll`), the MCP check routes (`mcpCheckInput`, `mcpCheckOutput`,
 * their `checkTool*` aliases, and the fulfilment helpers that use them) and the
 * gateway pre-check (`getPolicyApprovedContext` and `preCheck`). `proxyLLMCall`
 * (`/api/request`) and the OpenAI-compatible route do not read it, and the
 * client never sends it there.
 *
 * ABSENT IS NOT EMPTY. A client with no declaration sends no header, and the
 * platform behaves exactly as it did before the handshake existed. There is no
 * default declaration: only the caller knows what its enforcement point can
 * discharge. `capabilities: []` declares that it discharges nothing, which on
 * Enterprise turns every allow that carries a mandatory obligation into a deny.
 * Omitting `capabilities` is refused.
 *
 * The rules below are the platform's own. A declaration this module accepts is
 * one the platform's decoder accepts, and one it would refuse fails here, at
 * construction, naming the member, instead of as a 400 on the first governed
 * call.
 */

import { PEPHandshakeError } from './errors';
import { AUTHZEN_OBLIGATION_TYPE_VALUES } from './types/authzen.gen';

export const PEP_HANDSHAKE_HEADER = 'X-Axonflow-PEP-Handshake';
/** The only handshake profile the platform reads. Matched exactly, never as a floor. */
export const PEP_HANDSHAKE_PROFILE_V1 = 1;
/** The longest header value the platform reads, in bytes of base64. */
export const MAX_PEP_HANDSHAKE_BYTES = 4096;
/** The most capabilities one declaration may carry. A surplus is refused, not truncated. */
export const MAX_PEP_HANDSHAKE_CAPABILITIES = 64;
const MAX_IDENTIFIER_BYTES = 128;

// A regular expression's `$` (without the `m` flag) matches only at the end of
// the input, as the platform's does, so a trailing newline is refused on both
// sides. Both patterns are ASCII-only, so once one matches, `length` is the
// byte length the platform bounds.
//
// The pep_id excludes ':' because the platform builds the enforcement point's
// identifier as "client:<authenticated credential>:<pep_id>"; the audience is
// composed into nothing, and admits ':' and '/' so a URI is usable as one.
const PEP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const AUDIENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

// The obligation types this build can name, from the vendored AuthZEN surface.
// A capability naming anything else is refused, as the platform refuses it: a
// capability neither side can identify is one neither side can match.
const OBLIGATION_TYPES: ReadonlySet<string> = new Set(AUTHZEN_OBLIGATION_TYPE_VALUES);

/** One obligation type, at one schema version, that the enforcement point can discharge. */
export interface PEPCapability {
  readonly type: string;
  readonly version: number;
}

/** What a {@link PEPHandshake} is built from. */
export interface PEPHandshakeInit {
  /**
   * Names this enforcement point within the client's credential: lower-case
   * letters, digits, `.`, `_` and `-`, starting with a letter or digit, at most
   * 128 bytes. The platform prefixes it with the authenticated credential, so
   * it cannot name another client's enforcement point.
   */
  pepId: string;
  /**
   * The audience this enforcement point expects a decision proof to be bound
   * to, at most 128 bytes; a URI is the usual form. It is recorded and bound,
   * and authorises nothing.
   */
  audience: string;
  /**
   * The exact set this enforcement point can discharge, each entry exactly
   * `{ type, version }`. Required; an empty array declares that it discharges
   * nothing.
   */
  capabilities: readonly PEPCapability[];
}

/** The per-call option on a method whose request reaches a plane that reads the declaration. */
export interface PEPHandshakeCallOptions {
  /** Declares for this call only, in place of the client's `pepHandshake`. */
  pepHandshake?: PEPHandshake;
}

/**
 * A capability declaration, validated and encoded once.
 *
 * Pass one to the client as `pepHandshake` to declare it on every call to a
 * plane that reads it, or to one of those methods as `pepHandshake` to declare
 * it on that call only. One process can be two enforcement points (a request
 * path and a response path discharging different obligations), and the
 * per-call form is how each presents its own.
 *
 * @throws PEPHandshakeError for a member the platform would refuse. `pointer`
 *   names it (`/pep_id`, `/audience` or `/capabilities`), or is empty when the
 *   whole document encodes past the header's size limit.
 */
export class PEPHandshake {
  readonly pepId: string;
  readonly audience: string;
  /** The declared set, in the platform's canonical (type, version) order. */
  readonly capabilities: readonly PEPCapability[];
  /**
   * The `X-Axonflow-PEP-Handshake` value this declaration is sent as. Two
   * declarations of the same set in a different order encode to the same bytes.
   */
  readonly headerValue: string;

  constructor(init: PEPHandshakeInit) {
    requireIdentifier(init?.pepId, PEP_ID_PATTERN, '/pep_id');
    requireIdentifier(init.audience, AUDIENCE_PATTERN, '/audience');
    this.pepId = init.pepId;
    this.audience = init.audience;
    this.capabilities = canonicalCapabilities(init.capabilities);
    this.headerValue = encode(this.pepId, this.audience, this.capabilities);
    Object.freeze(this);
  }
}

function refuse(pointer: string, detail: string): PEPHandshakeError {
  const where = pointer ? `${pointer}: ` : '';
  return new PEPHandshakeError(`${PEP_HANDSHAKE_HEADER}: ${where}${detail}`, pointer);
}

function requireIdentifier(value: unknown, pattern: RegExp, pointer: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_IDENTIFIER_BYTES ||
    !pattern.test(value)
  ) {
    throw refuse(
      pointer,
      `${JSON.stringify(value) ?? String(value)} is not of the form ${pattern.source} ` +
        `with at most ${MAX_IDENTIFIER_BYTES} bytes`
    );
  }
}

function canonicalCapabilities(value: unknown): readonly PEPCapability[] {
  if (!Array.isArray(value)) {
    throw refuse(
      '/capabilities',
      'is absent or not an array; a handshake exists to declare capabilities, ' +
        'and an enforcement point that discharges nothing declares an empty one'
    );
  }
  if (value.length > MAX_PEP_HANDSHAKE_CAPABILITIES) {
    throw refuse(
      '/capabilities',
      `declares ${value.length} capabilities; the platform reads at most ${MAX_PEP_HANDSHAKE_CAPABILITIES}`
    );
  }
  const seen = new Set<string>();
  const out: PEPCapability[] = [];
  for (const entry of value as unknown[]) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw refuse(
        '/capabilities',
        `holds ${String(entry)}; every entry is a { type, version } object`
      );
    }
    // The platform refuses an unknown member at every depth. Dropping one here
    // would send a declaration other than the one the caller wrote.
    const extra = Object.keys(entry).filter(key => key !== 'type' && key !== 'version');
    if (extra.length > 0) {
      throw refuse(
        '/capabilities',
        `declares ${JSON.stringify(extra)}, which the platform does not read; an entry is exactly { type, version }`
      );
    }
    const { type, version } = entry as { type: unknown; version: unknown };
    if (typeof type !== 'string' || !OBLIGATION_TYPES.has(type)) {
      throw refuse(
        '/capabilities',
        `names obligation type ${JSON.stringify(type) ?? String(type)}, which is not one of ` +
          [...OBLIGATION_TYPES].sort().join(', ')
      );
    }
    // A version of 0 would match only an obligation whose version was never set.
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0) {
      throw refuse(
        '/capabilities',
        `declares ${JSON.stringify(type)} at version ${String(version)}; a version is a positive integer`
      );
    }
    const key = `${type}@${version}`;
    if (seen.has(key)) {
      throw refuse(
        '/capabilities',
        `declares ${JSON.stringify(type)} at version ${version} more than once; ` +
          'the platform refuses a repeated capability'
      );
    }
    seen.add(key);
    out.push(Object.freeze({ type, version }));
  }
  // Code-unit order on the type, as the platform sorts, never locale order.
  out.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.version - b.version));
  return Object.freeze(out);
}

function encode(pepId: string, audience: string, capabilities: readonly PEPCapability[]): string {
  const document = {
    profile_version: PEP_HANDSHAKE_PROFILE_V1,
    pep_id: pepId,
    audience,
    capabilities: capabilities.map(c => ({ type: c.type, version: c.version })),
  };
  const encoded = Buffer.from(JSON.stringify(document), 'utf8').toString('base64url');
  if (encoded.length > MAX_PEP_HANDSHAKE_BYTES) {
    throw refuse(
      '',
      `encodes to ${encoded.length} bytes; the header carries at most ${MAX_PEP_HANDSHAKE_BYTES}`
    );
  }
  return encoded;
}
