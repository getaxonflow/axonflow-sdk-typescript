/**
 * AxonFlow SDK Error Classes
 *
 * Custom error types for better error handling and type safety.
 */

/**
 * Base error class for all AxonFlow errors
 */
export class AxonFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AxonFlowError';
    Object.setPrototypeOf(this, AxonFlowError.prototype);
  }
}

/**
 * Error thrown when a request is blocked by policy
 */
export class PolicyViolationError extends AxonFlowError {
  public readonly blockReason: string;
  public readonly policies?: string[];

  constructor(blockReason: string, policies?: string[]) {
    super(`Request blocked by policy: ${blockReason}`);
    this.name = 'PolicyViolationError';
    this.blockReason = blockReason;
    this.policies = policies;
    Object.setPrototypeOf(this, PolicyViolationError.prototype);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends AxonFlowError {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends AxonFlowError {
  public readonly limit: number;
  public readonly remaining: number;
  public readonly resetAt: Date;

  constructor(limit: number, remaining: number, resetAt: Date) {
    super(`Rate limit exceeded: ${remaining}/${limit} remaining, resets at ${resetAt.toISOString()}`);
    this.name = 'RateLimitError';
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends AxonFlowError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error thrown for API errors (non-2xx responses)
 */
export class APIError extends AxonFlowError {
  public readonly statusCode: number;
  public readonly statusText: string;
  public readonly body: string;

  constructor(statusCode: number, statusText: string, body: string) {
    super(`API error: ${statusCode} ${statusText} - ${body}`);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.body = body;
    Object.setPrototypeOf(this, APIError.prototype);
  }
}
