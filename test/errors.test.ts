/**
 * Unit tests for AxonFlow Error Classes
 */

import {
  AxonFlowError,
  PolicyViolationError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  APIError,
} from '../src/errors';

describe('AxonFlow Error Classes', () => {
  describe('AxonFlowError', () => {
    it('should create base error with message', () => {
      const error = new AxonFlowError('Test error message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AxonFlowError);
      expect(error.name).toBe('AxonFlowError');
      expect(error.message).toBe('Test error message');
    });

    it('should have proper prototype chain', () => {
      const error = new AxonFlowError('Test');
      expect(Object.getPrototypeOf(error)).toBe(AxonFlowError.prototype);
    });
  });

  describe('PolicyViolationError', () => {
    it('should create error with block reason', () => {
      const error = new PolicyViolationError('Sensitive content detected');
      expect(error).toBeInstanceOf(AxonFlowError);
      expect(error).toBeInstanceOf(PolicyViolationError);
      expect(error.name).toBe('PolicyViolationError');
      expect(error.blockReason).toBe('Sensitive content detected');
      expect(error.message).toContain('Sensitive content detected');
    });

    it('should include policies when provided', () => {
      const policies = ['pii-protection', 'data-classification'];
      const error = new PolicyViolationError('PII detected', policies);
      expect(error.policies).toEqual(policies);
    });

    it('should handle undefined policies', () => {
      const error = new PolicyViolationError('Blocked');
      expect(error.policies).toBeUndefined();
    });

    it('should have proper prototype chain', () => {
      const error = new PolicyViolationError('Test');
      expect(Object.getPrototypeOf(error)).toBe(PolicyViolationError.prototype);
    });
  });

  describe('AuthenticationError', () => {
    it('should create error with default message', () => {
      const error = new AuthenticationError();
      expect(error).toBeInstanceOf(AxonFlowError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Authentication failed');
    });

    it('should create error with custom message', () => {
      const error = new AuthenticationError('Invalid API key');
      expect(error.message).toBe('Invalid API key');
    });

    it('should have proper prototype chain', () => {
      const error = new AuthenticationError();
      expect(Object.getPrototypeOf(error)).toBe(AuthenticationError.prototype);
    });
  });

  describe('RateLimitError', () => {
    it('should create error with rate limit info', () => {
      const resetAt = new Date('2025-01-01T00:00:00Z');
      const error = new RateLimitError(100, 0, resetAt);
      expect(error).toBeInstanceOf(AxonFlowError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.name).toBe('RateLimitError');
      expect(error.limit).toBe(100);
      expect(error.remaining).toBe(0);
      expect(error.resetAt).toBe(resetAt);
    });

    it('should format message with limit info', () => {
      const resetAt = new Date('2025-01-01T12:00:00Z');
      const error = new RateLimitError(50, 10, resetAt);
      expect(error.message).toContain('10/50');
      expect(error.message).toContain('resets at');
    });

    it('should have proper prototype chain', () => {
      const error = new RateLimitError(100, 0, new Date());
      expect(Object.getPrototypeOf(error)).toBe(RateLimitError.prototype);
    });
  });

  describe('TimeoutError', () => {
    it('should create error with timeout value', () => {
      const error = new TimeoutError(30000);
      expect(error).toBeInstanceOf(AxonFlowError);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe('TimeoutError');
      expect(error.timeoutMs).toBe(30000);
      expect(error.message).toContain('30000ms');
    });

    it('should format message correctly', () => {
      const error = new TimeoutError(5000);
      expect(error.message).toBe('Request timed out after 5000ms');
    });

    it('should have proper prototype chain', () => {
      const error = new TimeoutError(1000);
      expect(Object.getPrototypeOf(error)).toBe(TimeoutError.prototype);
    });
  });

  describe('APIError', () => {
    it('should create error with API response info', () => {
      const error = new APIError(500, 'Internal Server Error', 'Server crashed');
      expect(error).toBeInstanceOf(AxonFlowError);
      expect(error).toBeInstanceOf(APIError);
      expect(error.name).toBe('APIError');
      expect(error.statusCode).toBe(500);
      expect(error.statusText).toBe('Internal Server Error');
      expect(error.body).toBe('Server crashed');
    });

    it('should format message correctly', () => {
      const error = new APIError(404, 'Not Found', 'Resource not found');
      expect(error.message).toBe('API error: 404 Not Found - Resource not found');
    });

    it('should handle empty body', () => {
      const error = new APIError(502, 'Bad Gateway', '');
      expect(error.body).toBe('');
      expect(error.message).toBe('API error: 502 Bad Gateway - ');
    });

    it('should have proper prototype chain', () => {
      const error = new APIError(400, 'Bad Request', 'Invalid JSON');
      expect(Object.getPrototypeOf(error)).toBe(APIError.prototype);
    });
  });

  describe('Error Catching', () => {
    it('should be catchable as Error', () => {
      const throwError = () => {
        throw new PolicyViolationError('Test');
      };

      expect(throwError).toThrow(Error);
    });

    it('should be catchable as AxonFlowError', () => {
      const throwError = () => {
        throw new AuthenticationError('Test');
      };

      expect(throwError).toThrow(AxonFlowError);
    });

    it('should allow type narrowing', () => {
      try {
        throw new PolicyViolationError('PII detected', ['policy-1']);
      } catch (e) {
        if (e instanceof PolicyViolationError) {
          expect(e.blockReason).toBe('PII detected');
          expect(e.policies).toEqual(['policy-1']);
        }
      }
    });
  });
});
