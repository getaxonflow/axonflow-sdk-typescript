/**
 * Read-path per-user identity and the platform's read-scope contract.
 *
 * Since platform #2922 the role-scoped read routes (audit / decisions /
 * overrides) answer from the identity the CALLER presents, not from the tenant
 * credential alone. The tenant credential in `Authorization` says which
 * organization is asking; it does not say WHO. A caller that presents no
 * per-user identity to an enterprise stack is not "a caller who sees
 * everything" and is not "a caller who sees nothing by coincidence" — it is a
 * caller the platform cannot scope, and every scoped read it makes returns
 * zero rows by construction.
 *
 * This module carries the whole surface:
 *
 * - the per-user identity itself (`userToken` on the config for a client-wide
 *   identity, the per-call `{ userToken }` option on a read, and
 *   `client.asUser(token)` for a process acting on behalf of several people),
 *   stamped as the `X-User-Token` header from exactly ONE site — the client's
 *   `_fetch` wrapper, which every request goes through. There is no per-method
 *   header plumbing, deliberately: the platform reads the header once in its
 *   own proxy middleware (`platform/agent/proxy.go` `proxyAuthMiddleware`),
 *   not per route, so a per-method sprinkle here would be a second, drifting
 *   copy of a decision the platform makes in one place.
 *
 * - the response side of the same contract: `X-Axonflow-Read-Scope`, which the
 *   platform stamps on every scoped read (`platform/orchestrator/read_scope.go`
 *   `applyReadScopeHeader`) to say which of the three scopes the answer was
 *   computed under. Without it, a 404 from explain and an empty list from
 *   `listDecisions` are indistinguishable from "the row is not there", which is
 *   how a governed read comes to report a confident, vacuous nothing.
 */

/**
 * The request header carrying the per-user identity.
 *
 * This constant is the SDK's only spelling of it. The header is set in exactly
 * one place (`applyReadIdentity`, called from the client's `_fetch`); if you
 * find yourself setting it in a method, the method is the wrong altitude.
 */
export const HEADER_USER_TOKEN = 'X-User-Token';

/** The response header the platform stamps on scoped reads. */
export const HEADER_READ_SCOPE = 'X-Axonflow-Read-Scope';

/**
 * The scope the platform computed a role-scoped read under, taken from the
 * `X-Axonflow-Read-Scope` response header.
 *
 * A plain string union widened with `(string & {})` rather than a closed enum,
 * for one deliberate reason: a scope value a newer platform names and this
 * build does not recognise must round-trip verbatim instead of being narrowed
 * away or folded into a neighbour.
 *
 * Three named values are the platform's closed set. Two states are NOT in it
 * and are deliberately distinct from each other and from the three:
 *
 * - `''` (ReadScope.Absent) — the response carried no such header. That is
 *   what a pre-#2922 platform, a non-scoped route, or a proxy that dropped the
 *   header looks like. It means "not stated", never "none": treating an absent
 *   header as a scope of `none` would turn every older stack's perfectly good
 *   read into a refusal.
 *
 * - any other non-empty string — preserved verbatim so a caller can see what it
 *   was, and never a trigger for a refusal: this header is the platform's
 *   account of a decision it has ALREADY made and applied, so an unrecognised
 *   value is a reporting gap on our side, not a licence to invent an outcome.
 */
export type ReadScope = 'tenant' | 'own-rows' | 'none' | '' | (string & {});

export const ReadScope = {
  /** No `X-Axonflow-Read-Scope` header at all. Distinct from `None`. */
  Absent: '' as ReadScope,
  /**
   * Tenant-wide: a tenant-wide role (admin / owner / policy_admin), or a
   * Community / Community-SaaS deployment where the whole tenant is the one
   * operator.
   */
  Tenant: 'tenant' as ReadScope,
  /**
   * Narrowed to the rows attributed to the identity presented. A miss under
   * this scope means "not among yours", which is NOT the same statement as
   * "not there" — see `ReadScopeError`.
   */
  OwnRows: 'own-rows' as ReadScope,
  /**
   * The platform RESOLVED no per-user identity and the caller holds no
   * tenant-wide authority, so it returned zero rows by construction. Under this
   * scope a read CANNOT have returned data, so its empty answer says nothing
   * about what exists.
   *
   * "Resolved none" is wider than "presented none", and the difference is worth
   * knowing before you go looking in the wrong place. A token that validates
   * perfectly still resolves to no identity when its address is one the
   * platform reserves for SHARED, non-personal identities — the whole of
   * `@axonflow.local` and `@axonflow.internal`, plus the community and
   * evaluator addresses. Those name a pool of callers rather than a person, and
   * scoping a read to one would return the pool, so the platform deliberately
   * censuses them to nothing. A per-user token minted with an address in one of
   * those domains therefore reads exactly like no token at all. (Easy to hit:
   * the platform's own `generate-jwt.sh` defaults to
   * `demo-user@axonflow.local`.)
   */
  None: 'none' as ReadScope,
} as const;

/**
 * The scope the platform reported on `response`.
 *
 * Trimmed and lower-cased, for the same reason the platform's own header
 * helpers are: a proxy that normalises header casing or appends whitespace must
 * not silently change the answer. The cost of getting that wrong is one-sided
 * and quiet — a scope spelled `None` would fall to the unrecognised branch and
 * the vacuous empty page it describes would come back as data again. An
 * unrecognised value is otherwise unchanged, so it still round-trips.
 */
export function readScopeOf(response: Response | null | undefined): ReadScope {
  // A response with no readable header bag states no scope. That is the same
  // answer as a pre-#2922 platform's, and it is the SAFE one: the alternative
  // is throwing from inside a read, or — worse — inventing `none` and refusing
  // a page that was perfectly good.
  const headers = response?.headers;
  if (!headers || typeof headers.get !== 'function') return ReadScope.Absent;
  return (headers.get(HEADER_READ_SCOPE) ?? '').trim().toLowerCase();
}

/**
 * A role-scoped read whose answer was decided by the caller's identity scope
 * rather than by the data.
 *
 * It exists because "no rows" and "no identity" are the same bytes on the wire.
 * The platform distinguishes them in the `X-Axonflow-Read-Scope` header; this
 * error is that distinction made visible, so a read that could not have
 * succeeded reports a cause instead of a confident nothing.
 *
 * Two shapes, told apart by `identityMissing`:
 *
 * - `ReadScope.None` — no identity was RESOLVED; the read returned zero rows by
 *   construction and says nothing about what exists. Remedy: present an
 *   identity whose address is a real person's — see `ReadScope.None` for why a
 *   valid token can still resolve to nothing.
 * - `ReadScope.OwnRows` — an identity WAS resolved, and the row is not among
 *   the ones attributed to it. That does NOT mean the row exists and belongs to
 *   somebody else: the platform answers "not attributed to you" and "not there
 *   at all" with the identical 404, deliberately, so that a miss cannot be used
 *   to probe for another user's rows. This error therefore reports the scope,
 *   not a claim about what exists.
 *
 * The presented token is never included in the message: it is safe to log,
 * which is the point of putting the diagnosis in a type rather than in a string
 * the caller assembles from the credential.
 */
export class ReadScopeError extends Error {
  readonly scope: ReadScope;
  readonly statusCode: number;
  readonly resource: string;
  readonly identifier?: string;

  constructor(args: {
    scope: ReadScope;
    statusCode: number;
    resource?: string;
    identifier?: string;
  }) {
    const resource = args.resource ?? 'read';
    const subject = args.identifier ? `${resource} "${args.identifier}"` : resource;
    const identityMissing = args.scope === ReadScope.None;
    super(
      identityMissing
        ? `HTTP ${args.statusCode}: ${subject}: the platform resolved no per-user identity for ` +
            `this read (${HEADER_READ_SCOPE}: ${args.scope}), so it returned zero rows by ` +
            `construction and the empty answer says nothing about what exists. Either no ` +
            `identity was presented — set userToken on the client, pass it to this call, or use ` +
            `client.asUser(...) — or the one presented carries an address the platform reserves ` +
            `for shared identities (@axonflow.local, @axonflow.internal), which resolves to ` +
            `nobody. (platform #2922)`
        : `HTTP ${args.statusCode}: ${subject} was not found among the rows this identity can ` +
            `see: the platform reports ${HEADER_READ_SCOPE}: ${args.scope}, so the read was ` +
            `narrowed to the identity's own rows. It is either not attributed to this identity ` +
            `or not there at all — the platform answers both the same way ON PURPOSE, so that a ` +
            `miss cannot be used to probe for the existence of another user's rows, and this SDK ` +
            `cannot tell them apart either. A tenant-wide role (admin, owner or policy_admin) ` +
            `reads the whole tenant. (platform #2922)`
    );
    this.name = 'ReadScopeError';
    this.scope = args.scope;
    this.statusCode = args.statusCode;
    this.resource = resource;
    this.identifier = args.identifier;
    Object.setPrototypeOf(this, ReadScopeError.prototype);
  }

  /**
   * Whether the read failed because no per-user identity was resolved, as
   * opposed to one being resolved and not matching.
   */
  get identityMissing(): boolean {
    return this.scope === ReadScope.None;
  }
}

/**
 * The typed refusal for a scoped read that came back with nothing, or
 * `undefined` when the scope does not explain the result.
 *
 * `undefined` for `ReadScope.Tenant` (the caller could see the whole tenant and
 * it still was not there — a genuine miss), for `ReadScope.Absent` (the
 * platform did not state a scope; see `ReadScope` for why absent is not none),
 * and for any scope value this build does not recognise (a newer platform's;
 * reporting a cause we cannot actually read would be a confident wrong
 * diagnosis).
 */
export function readScopeErrorFor(args: {
  resource: string;
  identifier?: string;
  scope: ReadScope;
  statusCode: number;
}): ReadScopeError | undefined {
  if (args.scope === ReadScope.None || args.scope === ReadScope.OwnRows) {
    return new ReadScopeError(args);
  }
  return undefined;
}

/**
 * The typed refusal for a scoped read that came back EMPTY under a scope that
 * could not have returned a row; `undefined` in every other case.
 *
 * One helper rather than a check at each read, because "the page is empty and
 * the scope is none" is one rule and the reads that need it decode their body
 * on more than one path each. A rule copied per return site is a rule that ends
 * up applied on some of them.
 *
 * The emptiness guard is as load-bearing as the scope guard: a non-empty page
 * is never turned into an error, whatever the header says. And only
 * `ReadScope.None` refuses — an own-rows or tenant-wide read that legitimately
 * found nothing is a real answer, and replacing it with an error would swap one
 * wrong report for another.
 */
export function refuseVacuousScopedPage(
  response: Response | null | undefined,
  resource: string,
  rows: number
): ReadScopeError | undefined {
  if (rows > 0) return undefined;
  if (readScopeOf(response) !== ReadScope.None) return undefined;
  return new ReadScopeError({
    scope: ReadScope.None,
    statusCode: response?.status ?? 0,
    resource,
  });
}

/** Options every read method accepts on top of its own. */
export interface ReadIdentityOptions {
  /**
   * Per-user identity for THIS call only, overriding the client-wide
   * `userToken`.
   *
   * Use it when one process acts on behalf of several people. An empty string
   * is not an identity: it makes this read explicitly unidentified rather than
   * falling back to the client-wide one. That distinction has to exist, because
   * "unidentified" is a state the platform treats as different from every other
   * (see `ReadScope.None`).
   *
   * For a process acting for several people across MANY methods, prefer
   * `client.asUser(token)`: this option is only accepted by the read methods,
   * while a derived client reaches every method with no carve-out.
   */
  userToken?: string;
}

/** Whether two URLs are the same origin: scheme, host AND port. */
function sameOrigin(a: URL, b: URL): boolean {
  return a.origin === b.origin;
}

/**
 * Stamp the per-user identity on `headers`, if there is one, for a request to
 * `target` from a client configured for `endpoint`.
 *
 * Called from the client's `_fetch` — the one site every request goes through —
 * so the identity travels on every request without any method knowing about it.
 * That is on purpose and mirrors the platform: the agent reads `X-User-Token`
 * once, in the middleware in front of every proxied route, and the routes
 * themselves never look at it.
 *
 * **The header is NOT inert on the routes that are not reads.** It is validated
 * on every route the agent proxies: `proxyAuthMiddleware` resolves it before
 * dispatch and answers `401 invalid user token` for a present-but-INVALID one —
 * on `/api/v1/plans`, `/api/v1/policies`, `/api/v1/connectors`,
 * `/api/v1/process`, `/api/v1/budgets`, `/api/v1/cost`, `/api/v1/executions`
 * and the rest. So a stale or rotated token does not degrade to "unscoped
 * reads"; it turns `listConnectors`, `installConnector` and policy CRUD into
 * 401s. Fail-closed is the right direction, but it puts the value in the same
 * rotation story as `clientSecret`.
 *
 * Genuinely inert only on the routes the agent SERVES ITSELF — only `proxy.go`
 * and `mcp_identity.go` read the header at all: `/api/request`,
 * `/api/v1/decide` (whose identity comes from the request BODY's `user_token`,
 * which is the whole reason the read path needed a surface of its own),
 * `/api/v1/access/evaluation`, `/api/v1/static-policies/*`,
 * `/api/v1/circuit-breaker/*`, `/api/v1/hitl/*`, `/api/v1/mcp/check-input`,
 * `/api/v1/mcp/check-output`, `/api/v1/register`, `/api/policy/pre-check`,
 * `/api/audit/llm-call` and `/health`.
 *
 * **It is never sent anywhere but the configured endpoint.** `target` is
 * compared against `endpoint` and the header is removed when they differ. That
 * guard exists because of redirects: the fetch spec strips `Authorization` on a
 * cross-origin redirect, but its list is fixed and `X-User-Token` is not on it.
 * Measured on Node 25: the redirect target received `authorization: undefined`
 * and `x-user-token: SENTINEL`. The client follows redirects manually while an
 * identity is attached, re-entering this function on each hop, so the identity
 * is dropped the moment the origin changes.
 *
 * The token is a CREDENTIAL. It is written to the header and nowhere else: it
 * is never logged, never carried in an error message, and never reaches
 * telemetry — the heartbeat uses raw `fetch`, deliberately not the wrapper this
 * is called from.
 */
/**
 * @param headers the request's header bag, MUTATED in place.
 *
 * A plain record rather than a `Headers` instance, deliberately: this SDK
 * builds its requests with plain objects, and converting them here would change
 * the shape every existing caller and test observes on `fetch`. Widening the
 * blast radius of an identity fix to "every request's header representation"
 * is how a small change acquires a long tail of unrelated failures.
 */
export function applyReadIdentity(
  headers: Record<string, string>,
  target: URL,
  endpoint: string | undefined,
  token: string | undefined
): void {
  // Case-insensitively, because a caller may have spelled it differently and
  // two spellings of one header is two identities.
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === HEADER_USER_TOKEN.toLowerCase()) delete headers[key];
  }

  const trimmed = (token ?? '').trim();
  if (!trimmed) {
    // Never send an empty header. To the platform a present-but-empty
    // X-User-Token is still an absent one, but sending it advertises an
    // identity mechanism the caller is not using, and it is one refactor away
    // from a present-but-invalid token, which is a hard 401. The delete above
    // also makes an explicit per-call clearing actually clear.
    return;
  }
  if (endpoint) {
    try {
      if (!sameOrigin(target, new URL(endpoint))) return;
    } catch {
      // An unparseable configured endpoint is not a licence to send the
      // credential anyway.
      return;
    }
  }
  headers[HEADER_USER_TOKEN] = trimmed;
}
