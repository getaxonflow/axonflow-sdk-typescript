/**
 * AxonFlow SDK Error Classes
 *
 * Custom error types for better error handling and type safety.
 * Aligned with Python and Java SDKs for cross-language consistency.
 */

/**
 * Base error class for all AxonFlow errors.
 * All AxonFlow-specific exceptions extend this class.
 */
export class AxonFlowError extends Error {
  public readonly details: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AxonFlowError';
    this.details = details ?? {};
    Object.setPrototypeOf(this, AxonFlowError.prototype);
  }
}

/**
 * Error thrown for invalid SDK configuration.
 * Thrown when configuration validation fails (e.g., missing required fields,
 * invalid combinations, malformed values).
 *
 * @example
 * ```typescript
 * throw new ConfigurationError('clientSecret requires clientId to be set');
 * ```
 */
export class ConfigurationError extends AxonFlowError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Error thrown when connection to AxonFlow Agent fails.
 * This includes network failures, DNS resolution errors, and connection refused.
 *
 * @example
 * ```typescript
 * throw new ConnectionError('Failed to connect to AxonFlow Agent');
 * ```
 */
export class ConnectionError extends AxonFlowError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, cause ? { cause: cause.message } : undefined);
    this.name = 'ConnectionError';
    this.cause = cause;
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Error thrown for MCP connector operations.
 * Includes connector name and operation type for debugging.
 *
 * @example
 * ```typescript
 * throw new ConnectorError('Query failed', 'amadeus', 'search');
 * ```
 */
export class ConnectorError extends AxonFlowError {
  public readonly connector?: string;
  public readonly operation?: string;

  constructor(message: string, connector?: string, operation?: string) {
    super(message, { connector, operation });
    this.name = 'ConnectorError';
    this.connector = connector;
    this.operation = operation;
    Object.setPrototypeOf(this, ConnectorError.prototype);
  }
}

/**
 * Error thrown when Multi-Agent Planning (MAP) execution fails.
 * Includes plan ID and failing step for debugging.
 *
 * @example
 * ```typescript
 * throw new PlanExecutionError('Step 3 failed', 'plan-123', 'data-aggregation');
 * ```
 */
export class PlanExecutionError extends AxonFlowError {
  public readonly planId?: string;
  public readonly step?: string;

  constructor(message: string, planId?: string, step?: string) {
    super(message, { planId, step });
    this.name = 'PlanExecutionError';
    this.planId = planId;
    this.step = step;
    Object.setPrototypeOf(this, PlanExecutionError.prototype);
  }
}

/**
 * Error thrown when a request is blocked by policy.
 * Contains the block reason and list of violated policies.
 *
 * @example
 * ```typescript
 * throw new PolicyViolationError('PII detected in prompt', ['pii-detection']);
 * ```
 */
export class PolicyViolationError extends AxonFlowError {
  public readonly blockReason: string;
  public readonly policies?: string[];

  constructor(blockReason: string, policies?: string[]) {
    super(`Request blocked by policy: ${blockReason}`, {
      blockReason,
      policies,
    });
    this.name = 'PolicyViolationError';
    this.blockReason = blockReason;
    this.policies = policies;
    Object.setPrototypeOf(this, PolicyViolationError.prototype);
  }
}

/**
 * Error thrown when authentication fails.
 * This includes invalid credentials, expired tokens, and missing auth headers.
 *
 * @example
 * ```typescript
 * throw new AuthenticationError('Invalid license key');
 * ```
 */
export class AuthenticationError extends AxonFlowError {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when rate limit is exceeded.
 * Includes limit, remaining count, and reset time.
 *
 * @example
 * ```typescript
 * throw new RateLimitError(100, 0, new Date('2024-01-01T12:00:00Z'));
 * ```
 */
/**
 * Pricing-tier upgrade context emitted in a V1 429 envelope.
 * Mirrors the platform-side
 * feedback_429_no_upgrade_hint_is_conversion_gap.md contract.
 *
 * Cross-SDK parity:
 *   Go:     axonflow-sdk-go/decisions.go (UpgradeInfo)
 *   Python: axonflow-sdk-python/axonflow/exceptions.py (UpgradeInfo)
 *   Java:   .../sdk/types/UpgradeInfo.java
 *   Rust:   axonflow-sdk-rust/src/types/decisions.rs (UpgradeInfo)
 */
export interface UpgradeInfo {
  tier: string;
  wording: string;
  compareUrl: string;
  buyUrl: string;
}

export class RateLimitError extends AxonFlowError {
  public readonly limit: number;
  public readonly remaining: number;
  public readonly resetAt: Date;
  /** Tier-cap context — populated when the 429 came from a V1 envelope
   *  (e.g. `list_decisions` page-size cap). `undefined` for legacy 429s. */
  public readonly limitType?: string;
  public readonly tier?: string;
  public readonly upgrade?: UpgradeInfo;

  constructor(
    limit: number,
    remaining: number,
    resetAt: Date,
    extras?: { limitType?: string; tier?: string; upgrade?: UpgradeInfo }
  ) {
    super(
      `Rate limit exceeded: ${remaining}/${limit} remaining, resets at ${resetAt.toISOString()}`,
      { limit, remaining, resetAt: resetAt.toISOString() }
    );
    this.name = 'RateLimitError';
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt;
    this.limitType = extras?.limitType;
    this.tier = extras?.tier;
    this.upgrade = extras?.upgrade;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  /**
   * Build a RateLimitError from a parsed V1 429 envelope.
   * Mirrors the platform-side response shape:
   *   { error, limit_type, tier, limit, remaining, upgrade: {...} }
   * Forward-only — pre-V1 429s land via the legacy positional constructor.
   */
  static fromTierEnvelope(envelope: {
    error?: string;
    limit_type?: string;
    tier?: string;
    limit?: number;
    remaining?: number;
    upgrade?: {
      tier?: string;
      wording?: string;
      compare_url?: string;
      buy_url?: string;
    };
  }): RateLimitError {
    const upgrade: UpgradeInfo | undefined = envelope.upgrade
      ? {
          tier: envelope.upgrade.tier ?? '',
          wording: envelope.upgrade.wording ?? '',
          compareUrl: envelope.upgrade.compare_url ?? '',
          buyUrl: envelope.upgrade.buy_url ?? '',
        }
      : undefined;
    const err = new RateLimitError(envelope.limit ?? 0, envelope.remaining ?? 0, new Date(), {
      limitType: envelope.limit_type,
      tier: envelope.tier,
      upgrade,
    });
    if (envelope.error) {
      // Override the auto-generated message with the platform's
      // human-readable wording so callers see the same string the
      // platform returned.
      (err as { message: string }).message = envelope.error;
    }
    return err;
  }
}

/**
 * Error thrown when a request times out.
 * Includes the timeout duration in milliseconds.
 *
 * @example
 * ```typescript
 * throw new TimeoutError(30000);
 * ```
 */
export class TimeoutError extends AxonFlowError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, { timeoutMs });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error thrown when a plan update has a version conflict (HTTP 409).
 * Indicates optimistic concurrency failure — the plan was modified
 * by another request between read and update.
 *
 * @example
 * ```typescript
 * try {
 *   await client.updatePlan(planId, { version: 1, executionMode: 'parallel' });
 * } catch (err) {
 *   if (err instanceof VersionConflictError) {
 *     console.log(`Conflict: expected v${err.expectedVersion}, current v${err.currentVersion}`);
 *   }
 * }
 * ```
 */
export class VersionConflictError extends AxonFlowError {
  public readonly planId: string;
  public readonly expectedVersion: number;
  public readonly currentVersion?: number;

  constructor(planId: string, expectedVersion: number, currentVersion?: number) {
    super(`Version conflict for plan ${planId}: expected version ${expectedVersion}`, {
      planId,
      expectedVersion,
      currentVersion,
    });
    this.name = 'VersionConflictError';
    this.planId = planId;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
    Object.setPrototypeOf(this, VersionConflictError.prototype);
  }
}

/**
 * Error thrown when an `idempotency_key` on a gate or complete request conflicts with
 * the key recorded on an earlier gate call for the same (workflow_id, step_id).
 * Maps to HTTP 409 with `error.code === "IDEMPOTENCY_KEY_MISMATCH"`.
 *
 * `expectedIdempotencyKey` is the empty string `""` when the gate call had no key but
 * complete did; conversely `receivedIdempotencyKey` is `""` when complete omitted a key
 * that gate had set.
 *
 * @example
 * ```typescript
 * try {
 *   await client.markStepCompleted(workflowId, stepId, { idempotency_key: 'k2' });
 * } catch (err) {
 *   if (err instanceof IdempotencyKeyMismatchError) {
 *     console.log(`expected=${err.expectedIdempotencyKey} received=${err.receivedIdempotencyKey}`);
 *   }
 * }
 * ```
 */
export class IdempotencyKeyMismatchError extends AxonFlowError {
  public readonly workflowId: string;
  public readonly stepId: string;
  public readonly expectedIdempotencyKey: string;
  public readonly receivedIdempotencyKey: string;

  constructor(
    message: string,
    workflowId: string,
    stepId: string,
    expectedIdempotencyKey: string,
    receivedIdempotencyKey: string
  ) {
    super(message, {
      workflowId,
      stepId,
      expectedIdempotencyKey,
      receivedIdempotencyKey,
    });
    this.name = 'IdempotencyKeyMismatchError';
    this.workflowId = workflowId;
    this.stepId = stepId;
    this.expectedIdempotencyKey = expectedIdempotencyKey;
    this.receivedIdempotencyKey = receivedIdempotencyKey;
    Object.setPrototypeOf(this, IdempotencyKeyMismatchError.prototype);
  }
}

/**
 * Error thrown for API errors (non-2xx responses).
 * Includes HTTP status code, status text, and response body.
 *
 * @example
 * ```typescript
 * throw new APIError(404, 'Not Found', '{"error": "Resource not found"}');
 * ```
 */
export class APIError extends AxonFlowError {
  public readonly statusCode: number;
  public readonly statusText: string;
  public readonly body: string;

  constructor(statusCode: number, statusText: string, body: string) {
    super(`API error: ${statusCode} ${statusText} - ${body}`, {
      statusCode,
      statusText,
      body,
    });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.body = body;
    Object.setPrototypeOf(this, APIError.prototype);
  }
}
