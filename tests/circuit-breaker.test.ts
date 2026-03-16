/**
 * Tests for circuit breaker observability methods
 * Part of Issue #1176 - Circuit breaker Phase 2
 */

import { AxonFlow } from '../src/client';
import type { CircuitBreakerConfigUpdate } from '../src/types/gateway';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Circuit Breaker Observability', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tenant: 'test-tenant',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockResponse = (data: unknown, status = 200) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // ==========================================================================
  // getCircuitBreakerStatus
  // ==========================================================================

  describe('getCircuitBreakerStatus', () => {
    it('should return active circuits and emergency stop status', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            active_circuits: [
              {
                id: 'cb-001',
                scope: 'provider',
                scope_id: 'openai',
                org_id: 'org-123',
                state: 'open',
                trip_reason: 'error_threshold_exceeded',
                tripped_by: 'system',
                tripped_at: '2026-03-16T10:00:00Z',
                expires_at: '2026-03-16T10:05:00Z',
                error_count: 15,
                violation_count: 3,
              },
            ],
            count: 1,
            emergency_stop_active: false,
          },
        })
      );

      const result = await client.getCircuitBreakerStatus();

      expect(result.count).toBe(1);
      expect(result.emergencyStopActive).toBe(false);
      expect(result.activeCircuits).toHaveLength(1);

      const circuit = result.activeCircuits[0];
      expect(circuit.id).toBe('cb-001');
      expect(circuit.scope).toBe('provider');
      expect(circuit.scopeId).toBe('openai');
      expect(circuit.orgId).toBe('org-123');
      expect(circuit.state).toBe('open');
      expect(circuit.tripReason).toBe('error_threshold_exceeded');
      expect(circuit.trippedBy).toBe('system');
      expect(circuit.trippedAt).toBe('2026-03-16T10:00:00Z');
      expect(circuit.expiresAt).toBe('2026-03-16T10:05:00Z');
      expect(circuit.errorCount).toBe(15);
      expect(circuit.violationCount).toBe(3);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/circuit-breaker/status',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle empty active circuits', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            active_circuits: [],
            count: 0,
            emergency_stop_active: false,
          },
        })
      );

      const result = await client.getCircuitBreakerStatus();

      expect(result.count).toBe(0);
      expect(result.activeCircuits).toHaveLength(0);
      expect(result.emergencyStopActive).toBe(false);
    });

    it('should handle null active_circuits gracefully', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            active_circuits: null,
            count: 0,
            emergency_stop_active: true,
          },
        })
      );

      const result = await client.getCircuitBreakerStatus();

      expect(result.activeCircuits).toHaveLength(0);
      expect(result.emergencyStopActive).toBe(true);
    });

    it('should handle authentication error (401)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));

      await expect(client.getCircuitBreakerStatus()).rejects.toThrow();
    });
  });

  // ==========================================================================
  // getCircuitBreakerHistory
  // ==========================================================================

  describe('getCircuitBreakerHistory', () => {
    it('should return circuit breaker history', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            history: [
              {
                id: 'cbh-001',
                org_id: 'org-123',
                scope: 'provider',
                scope_id: 'openai',
                state: 'open',
                trip_reason: 'error_threshold_exceeded',
                tripped_by: 'admin-user',
                tripped_by_email: 'admin@company.com',
                trip_comment: 'Manual trip for maintenance',
                tripped_at: '2026-03-16T09:00:00Z',
                expires_at: '2026-03-16T09:30:00Z',
                reset_by: 'admin-user',
                reset_at: '2026-03-16T09:15:00Z',
                error_count: 10,
                violation_count: 2,
              },
            ],
            count: 1,
          },
        })
      );

      const result = await client.getCircuitBreakerHistory();

      expect(result.count).toBe(1);
      expect(result.history).toHaveLength(1);

      const entry = result.history[0];
      expect(entry.id).toBe('cbh-001');
      expect(entry.orgId).toBe('org-123');
      expect(entry.scope).toBe('provider');
      expect(entry.scopeId).toBe('openai');
      expect(entry.state).toBe('open');
      expect(entry.tripReason).toBe('error_threshold_exceeded');
      expect(entry.trippedBy).toBe('admin-user');
      expect(entry.trippedByEmail).toBe('admin@company.com');
      expect(entry.tripComment).toBe('Manual trip for maintenance');
      expect(entry.trippedAt).toBe('2026-03-16T09:00:00Z');
      expect(entry.expiresAt).toBe('2026-03-16T09:30:00Z');
      expect(entry.resetBy).toBe('admin-user');
      expect(entry.resetAt).toBe('2026-03-16T09:15:00Z');
      expect(entry.errorCount).toBe(10);
      expect(entry.violationCount).toBe(2);

      // No limit param should mean no query string
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/circuit-breaker/history',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should pass limit parameter in query string', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            history: [],
            count: 0,
          },
        })
      );

      await client.getCircuitBreakerHistory(25);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/circuit-breaker/history?limit=25',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle null history gracefully', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            history: null,
            count: 0,
          },
        })
      );

      const result = await client.getCircuitBreakerHistory();

      expect(result.history).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should handle server error (500)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'internal error' }, 500));

      await expect(client.getCircuitBreakerHistory()).rejects.toThrow();
    });
  });

  // ==========================================================================
  // getCircuitBreakerConfig
  // ==========================================================================

  describe('getCircuitBreakerConfig', () => {
    it('should return global config when no tenantId provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            source: 'global',
            error_threshold: 5,
            violation_threshold: 3,
            window_seconds: 60,
            default_timeout_seconds: 300,
            max_timeout_seconds: 3600,
            enable_auto_recovery: true,
          },
        })
      );

      const result = await client.getCircuitBreakerConfig();

      expect(result.source).toBe('global');
      expect(result.errorThreshold).toBe(5);
      expect(result.violationThreshold).toBe(3);
      expect(result.windowSeconds).toBe(60);
      expect(result.defaultTimeoutSeconds).toBe(300);
      expect(result.maxTimeoutSeconds).toBe(3600);
      expect(result.enableAutoRecovery).toBe(true);
      expect(result.tenantId).toBeUndefined();
      expect(result.overrides).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/circuit-breaker/config',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should pass tenant_id in query string', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            source: 'tenant_override',
            error_threshold: 10,
            violation_threshold: 5,
            window_seconds: 120,
            default_timeout_seconds: 600,
            max_timeout_seconds: 7200,
            enable_auto_recovery: false,
            tenant_id: 'tenant-456',
            overrides: { error_threshold: 10 },
          },
        })
      );

      const result = await client.getCircuitBreakerConfig('tenant-456');

      expect(result.source).toBe('tenant_override');
      expect(result.tenantId).toBe('tenant-456');
      expect(result.overrides).toEqual({ error_threshold: 10 });
      expect(result.enableAutoRecovery).toBe(false);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/circuit-breaker/config?tenant_id=tenant-456',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle authentication error (403)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'forbidden' }, 403));

      await expect(client.getCircuitBreakerConfig()).rejects.toThrow();
    });
  });

  // ==========================================================================
  // updateCircuitBreakerConfig
  // ==========================================================================

  describe('updateCircuitBreakerConfig', () => {
    it('should update config with all fields', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            tenant_id: 'tenant-789',
            message: 'config updated',
          },
        })
      );

      const config: CircuitBreakerConfigUpdate = {
        tenantId: 'tenant-789',
        errorThreshold: 10,
        violationThreshold: 5,
        windowSeconds: 120,
        defaultTimeoutSeconds: 600,
        maxTimeoutSeconds: 7200,
        enableAutoRecovery: false,
      };

      const result = await client.updateCircuitBreakerConfig(config);

      expect(result.tenantId).toBe('tenant-789');
      expect(result.message).toBe('config updated');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/circuit-breaker/config',
        expect.objectContaining({ method: 'PUT' })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tenant_id).toBe('tenant-789');
      expect(callBody.error_threshold).toBe(10);
      expect(callBody.violation_threshold).toBe(5);
      expect(callBody.window_seconds).toBe(120);
      expect(callBody.default_timeout_seconds).toBe(600);
      expect(callBody.max_timeout_seconds).toBe(7200);
      expect(callBody.enable_auto_recovery).toBe(false);
    });

    it('should update config with partial fields', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          data: {
            tenant_id: 'tenant-789',
            message: 'config updated',
          },
        })
      );

      await client.updateCircuitBreakerConfig({
        tenantId: 'tenant-789',
        errorThreshold: 20,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tenant_id).toBe('tenant-789');
      expect(callBody.error_threshold).toBe(20);
      // Other fields should not be present
      expect(callBody.violation_threshold).toBeUndefined();
      expect(callBody.window_seconds).toBeUndefined();
      expect(callBody.default_timeout_seconds).toBeUndefined();
      expect(callBody.max_timeout_seconds).toBeUndefined();
      expect(callBody.enable_auto_recovery).toBeUndefined();
    });

    it('should throw ConfigurationError for empty tenantId', async () => {
      await expect(client.updateCircuitBreakerConfig({ tenantId: '' })).rejects.toThrow(
        'tenantId is required'
      );
    });

    it('should handle server error (500)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'internal error' }, 500));

      await expect(
        client.updateCircuitBreakerConfig({ tenantId: 'tenant-789', errorThreshold: 10 })
      ).rejects.toThrow();
    });

    it('should handle authentication error (401)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));

      await expect(client.updateCircuitBreakerConfig({ tenantId: 'tenant-789' })).rejects.toThrow();
    });
  });
});
