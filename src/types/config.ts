/**
 * Configuration options for the AxonFlow SDK
 */
export interface AxonFlowConfig {
  /**
   * Your AxonFlow API key
   * @deprecated Use licenseKey instead for license-based authentication
   */
  apiKey?: string;

  /**
   * Your AxonFlow license key (recommended)
   * Replaces the deprecated apiKey for license-based authentication
   */
  licenseKey?: string;

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
   * Tenant identifier for multi-tenant deployments
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
