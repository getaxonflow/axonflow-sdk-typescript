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
   * Retry configuration
   */
  retry?: {
    enabled: boolean;
    maxAttempts?: number;
    delay?: number;
  };

  /**
   * Cache configuration for policy decisions
   */
  cache?: {
    enabled: boolean;
    ttl?: number; // Time to live in milliseconds
  };
}

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
