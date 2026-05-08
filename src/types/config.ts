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
   * This specifies WHICH organization context.
   * Separate from authentication identity (clientId).
   *
   * @deprecated Using tenant without clientId is deprecated.
   * For authentication, use clientId/clientSecret instead.
   * Keep tenant only for multi-tenant routing context.
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
