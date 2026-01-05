/**
 * Tests for Audit Log Read Methods
 * Part of Issue #878 - Add audit log read capabilities to SDK
 */

import { AxonFlow } from '../src/client';
import type {
  AuditSearchRequest,
  AuditQueryOptions,
  AuditLogEntry,
  AuditSearchResponse,
} from '../src/types/gateway';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Audit Log Read Methods', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      orchestratorEndpoint: 'http://localhost:8081',
      licenseKey: 'test-license-key',
      tenant: 'test-tenant',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper to create mock responses
  const mockResponse = (data: unknown, status = 200) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // Sample audit log entries
  const sampleAuditEntries = [
    {
      id: 'audit-1',
      request_id: 'req-1',
      timestamp: '2026-01-05T10:00:00Z',
      user_email: 'user@example.com',
      client_id: 'client-1',
      tenant_id: 'tenant-1',
      request_type: 'llm_chat',
      query_summary: 'Test query',
      success: true,
      blocked: false,
      risk_score: 0.1,
      provider: 'openai',
      model: 'gpt-4',
      tokens_used: 150,
      latency_ms: 250,
      policy_violations: [],
      metadata: {},
    },
    {
      id: 'audit-2',
      request_id: 'req-2',
      timestamp: '2026-01-05T11:00:00Z',
      user_email: 'user@example.com',
      client_id: 'client-1',
      tenant_id: 'tenant-1',
      request_type: 'llm_chat',
      query_summary: 'Blocked query',
      success: false,
      blocked: true,
      risk_score: 0.9,
      provider: 'openai',
      model: 'gpt-4',
      tokens_used: 0,
      latency_ms: 50,
      policy_violations: ['policy-1'],
      metadata: { reason: 'pii_detected' },
    },
  ];

  // ========================================================================
  // searchAuditLogs Tests
  // ========================================================================

  describe('searchAuditLogs', () => {
    it('should search audit logs with all filters', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const request: AuditSearchRequest = {
        userEmail: 'user@example.com',
        clientId: 'client-1',
        startTime: new Date('2026-01-01'),
        endTime: new Date('2026-01-05'),
        requestType: 'llm_chat',
        limit: 50,
        offset: 10,
      };

      const result = await client.searchAuditLogs(request);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe('audit-1');
      expect(result.entries[1].blocked).toBe(true);

      // Verify request
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8081/api/v1/audit/search',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"user_email":"user@example.com"'),
        })
      );
    });

    it('should use default limit when not specified', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const result = await client.searchAuditLogs();

      expect(result.limit).toBe(100);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"limit":100'),
        })
      );
    });

    it('should cap limit at 1000', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      await client.searchAuditLogs({ limit: 5000 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"limit":1000'),
        })
      );
    });

    it('should handle empty results', async () => {
      mockFetch.mockReturnValueOnce(mockResponse([]));

      const result = await client.searchAuditLogs();

      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle wrapped response format', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          entries: sampleAuditEntries,
          total: 100,
          limit: 10,
          offset: 0,
        })
      );

      const result = await client.searchAuditLogs();

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(result.limit).toBe(10);
    });

    it('should handle 400 error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'invalid request' }, 400));

      await expect(client.searchAuditLogs()).rejects.toThrow();
    });

    it('should handle 401 error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));

      await expect(client.searchAuditLogs()).rejects.toThrow();
    });

    it('should handle 500 error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'server error' }, 500));

      await expect(client.searchAuditLogs()).rejects.toThrow();
    });

    it('should parse dates correctly', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const result = await client.searchAuditLogs();

      expect(result.entries[0].timestamp).toBeInstanceOf(Date);
      expect(result.entries[0].timestamp.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    });

    it('should include offset in request when > 0', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      await client.searchAuditLogs({ offset: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"offset":50'),
        })
      );
    });

    it('should parse policy violations correctly', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const result = await client.searchAuditLogs();

      expect(result.entries[1].policyViolations).toEqual(['policy-1']);
    });
  });

  // ========================================================================
  // getAuditLogsByTenant Tests
  // ========================================================================

  describe('getAuditLogsByTenant', () => {
    it('should get audit logs for a tenant with defaults', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const result = await client.getAuditLogsByTenant('tenant-abc');

      expect(result.entries).toHaveLength(2);
      expect(result.limit).toBe(50);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8081/api/v1/audit/tenant/tenant-abc?limit=50&offset=0',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should get audit logs with custom options', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const options: AuditQueryOptions = { limit: 100, offset: 25 };
      const result = await client.getAuditLogsByTenant('tenant-abc', options);

      expect(result.limit).toBe(100);
      expect(result.offset).toBe(25);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8081/api/v1/audit/tenant/tenant-abc?limit=100&offset=25',
        expect.any(Object)
      );
    });

    it('should throw error for empty tenant ID', async () => {
      await expect(client.getAuditLogsByTenant('')).rejects.toThrow('tenantId is required');
    });

    it('should cap limit at 1000', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      await client.getAuditLogsByTenant('tenant-abc', { limit: 5000 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=1000'),
        expect.any(Object)
      );
    });

    it('should handle empty results', async () => {
      mockFetch.mockReturnValueOnce(mockResponse([]));

      const result = await client.getAuditLogsByTenant('tenant-abc');

      expect(result.entries).toHaveLength(0);
    });

    it('should handle wrapped response format', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          entries: sampleAuditEntries,
          total: 50,
          limit: 50,
          offset: 0,
        })
      );

      const result = await client.getAuditLogsByTenant('tenant-abc');

      expect(result.total).toBe(50);
    });

    it('should handle 404 error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'tenant not found' }, 404));

      await expect(client.getAuditLogsByTenant('nonexistent')).rejects.toThrow();
    });

    it('should handle 403 error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'forbidden' }, 403));

      await expect(client.getAuditLogsByTenant('other-tenant')).rejects.toThrow();
    });

    it('should URL encode tenant ID', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      await client.getAuditLogsByTenant('tenant/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tenant%2Fwith%2Fslashes'),
        expect.any(Object)
      );
    });
  });

  // ========================================================================
  // Debug Mode Tests
  // ========================================================================

  describe('debug mode', () => {
    it('should log debug info for searchAuditLogs when debug enabled', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        orchestratorEndpoint: 'http://localhost:8081',
        debug: true,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      await debugClient.searchAuditLogs();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AxonFlow]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });

    it('should log debug info for getAuditLogsByTenant when debug enabled', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        orchestratorEndpoint: 'http://localhost:8081',
        debug: true,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      await debugClient.getAuditLogsByTenant('tenant-abc');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AxonFlow]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });

  // ========================================================================
  // Type Tests
  // ========================================================================

  describe('type validation', () => {
    it('should parse all AuditLogEntry fields correctly', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(sampleAuditEntries));

      const result = await client.searchAuditLogs();
      const entry = result.entries[0];

      expect(entry.id).toBe('audit-1');
      expect(entry.requestId).toBe('req-1');
      expect(entry.userEmail).toBe('user@example.com');
      expect(entry.clientId).toBe('client-1');
      expect(entry.tenantId).toBe('tenant-1');
      expect(entry.requestType).toBe('llm_chat');
      expect(entry.querySummary).toBe('Test query');
      expect(entry.success).toBe(true);
      expect(entry.blocked).toBe(false);
      expect(entry.riskScore).toBe(0.1);
      expect(entry.provider).toBe('openai');
      expect(entry.model).toBe('gpt-4');
      expect(entry.tokensUsed).toBe(150);
      expect(entry.latencyMs).toBe(250);
      expect(entry.policyViolations).toEqual([]);
      expect(entry.metadata).toEqual({});
    });

    it('should handle missing optional fields with defaults', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse([
          {
            id: 'audit-minimal',
            timestamp: '2026-01-05T10:00:00Z',
          },
        ])
      );

      const result = await client.searchAuditLogs();
      const entry = result.entries[0];

      expect(entry.id).toBe('audit-minimal');
      expect(entry.requestId).toBe('');
      expect(entry.userEmail).toBe('');
      expect(entry.success).toBe(true);
      expect(entry.blocked).toBe(false);
      expect(entry.riskScore).toBe(0);
      expect(entry.tokensUsed).toBe(0);
      expect(entry.policyViolations).toEqual([]);
      expect(entry.metadata).toEqual({});
    });
  });
});
