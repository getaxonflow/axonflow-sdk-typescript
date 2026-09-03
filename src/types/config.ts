/**
 * Configuration options for the AxonFlow SDK
 */
export interface AxonFlowConfig {
  /**
   * Client ID for OAuth2-style authentication
   * Used with clientSecret for enterprise deployments.
   * This is the authentication identity (WHO is calling).
   */
  clientId?: string;

  /**
   * Client secret for OAuth2-style authentication
   * Used with clientId for enterprise deployments.
   * This is the authentication credential.
   */
  clientSecret?: string;

  /**
   * Per-user identity for the READ path, sent as `X-User-Token` on every
   * request.
   *
   * `clientId`/`clientSecret` authenticate the ORGANIZATION; this
   * authenticates the PERSON. Since platform #2922 the role-scoped reads
   * (`explainDecision`, `listDecisions`, the audit reads) are answered from
   * this identity: an enterprise stack scopes a developer or viewer to their
   * own rows, gives a tenant-wide role (admin / owner / policy_admin) the whole
   * tenant, and returns ZERO rows to a caller that presents no identity at all.
   * Leaving it unset against an enterprise stack is therefore not a neutral
   * default — it is the configuration under which every scoped read answers
   * nothing, which the SDK now reports as a `ReadScopeError` rather than as an
   * empty result.
   *
   * SETTING THIS AFFECTS MORE THAN READS. The header rides every request and
   * the agent VALIDATES it on every route it proxies, so a stale or rotated
   * token turns `listConnectors`, `installConnector` and policy CRUD into 401s
   * rather than merely unscoping a read. Fail-closed is the right direction,
   * but it puts this value in the same rotation story as `clientSecret`.
   *
   * The value is a per-user JWT: minted by the customer portal's user-token
   * API, or for local testing by `scripts/generate-jwt.sh --kind user`. It is
   * NOT the tenant JWT and not `clientSecret`. Community deployments are
   * single-operator and ignore it.
   *
   * Override per call with `{ userToken }` on a read, or derive a client bound
   * to one person with `client.asUser(token)`.
   */
  userToken?: string;

  /**
   * AxonFlow API endpoint (optional)
   * All SDK methods route through this single endpoint.
   * The Agent proxies all routes (ADR-026 Single Entry Point Architecture).
   * Default: https://api.axonflow.com
   */
  endpoint?: string;

  /**
   * Deployment mode
   * - sandbox: For testing with non-production data
   * - production: For production use
   * Default: production
   */
  mode?: 'sandbox' | 'production';

  /**
   * Tenant identifier for multi-tenant deployments.
   *
   * @deprecated Since v8.1.0 (v9 identity cleanup, Epic
   * getaxonflow/axonflow-enterprise#2230). Use `clientId` for both
   * authentication identity and tenant routing — the platform now
   * derives tenant scope from the authenticated client_id rather than
   * a separate tenant field. The `tenant` field is preserved for
   * back-compat through the v8.x line and will be REMOVED in v10.
   *
   * Migration: replace `tenant: "your-tenant"` with
   * `clientId: "your-tenant"` (or, if you also have credentials,
   * `clientId: "your-tenant", clientSecret: "..."`). Wire-level
   * `tenant_id` JSON fields on request payloads remain unchanged.
   */
  tenant?: string;

  /**
   * Enable debug logging
   * Default: false
   */
  debug?: boolean;

  /**
   * Request timeout in milliseconds
   * Default: 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Timeout for Multi-Agent Planning (MAP) operations in milliseconds.
   * MAP operations can take longer as they involve multiple LLM calls.
   * Default: 120000 (2 minutes)
   */
  mapTimeout?: number;

  /**
   * @deprecated The SDK does not implement HTTP retries. This field is accepted
   * for backward compatibility and silently ignored. If you need retries for
   * transient infra errors (5xx, network), wrap the SDK call in your own retry
   * helper — but do NOT retry on `AuthenticationError`
   * (see [getaxonflow/axonflow-enterprise#2275](https://github.com/getaxonflow/axonflow-enterprise/issues/2275)).
   * This field will be removed in v10.
   */
  retry?: {
    enabled: boolean;
    maxAttempts?: number;
    delay?: number;
  };

  /**
   * @deprecated NOT SUPPORTED, and passing it now throws a
   * `ConfigurationError` at construction.
   *
   * This option was accepted, normalised, and read by no request path — so
   * responses were never cached, while the default resolved to
   * `enabled: true` and every client reported caching ON. It is refused rather
   * than silently ignored so the mistaken assumption is corrected at the call
   * site instead of at runtime. See sdk-typescript#267.
   *
   * If you need caching, cache at your own call site, where you control the
   * key. Any cache in front of this SDK **must** include the effective user
   * identity in its key: without it, a client derived with `asUser()` can be
   * served another identity's governed response.
   */
  cache?: {
    enabled: boolean;
    ttl?: number; // Time to live in milliseconds
  };
}

/**
 * @deprecated The SDK does not implement HTTP retries. This type is exported
 * for backward compatibility with code that imports it; configuring it on
 * `AxonFlowConfig.retry` has no effect at runtime. If you need retries for
 * transient infra errors (5xx, network), wrap the SDK call in your own retry
 * helper — but do NOT retry on `AuthenticationError`
 * (see [getaxonflow/axonflow-enterprise#2275](https://github.com/getaxonflow/axonflow-enterprise/issues/2275)).
 * This type will be removed in v10.
 */
export interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  delay: number;
  backoff: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
}
