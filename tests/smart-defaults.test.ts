/**
 * Smart Defaults Unit Tests for Gateway Mode
 *
 * Tests that verify the "community" smart default is used for clientId
 * when no clientId is configured. This enables zero-config for self-hosted
 * and community deployments.
 *
 * Key behavior:
 * - When clientId is configured, it should be used in requests
 * - When clientId is NOT configured, "community" should be used as the default
 * - This applies to Gateway Mode methods: getPolicyApprovedContext, auditLLMCall
 */

import { AxonFlow } from '../src/client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Smart Defaults for Gateway Mode', () => {
  afterEach(() => {
    jest.clearAllMocks();
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

  // ============================================================
  // getPolicyApprovedContext - Smart Defaults Tests
  // ============================================================
  describe('getPolicyApprovedContext smart defaults', () => {
    it('should use "community" as default clientId when no clientId configured', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          context_id: 'ctx_smart_default',
          approved: true,
          policies: [],
          expires_at: '2025-12-20T12:00:00Z',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        // No clientId - should use "community" smart default
      });

      await client.getPolicyApprovedContext({
        userToken: 'test-user',
        query: 'Test query',
      });

      // Verify request was made with smart default clientId
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8080/api/policy/pre-check');

      const body = JSON.parse(options.body);
      expect(body.client_id).toBe('community');

      console.log('✅ getPolicyApprovedContext uses "community" smart default');
    });

    it('should use configured clientId when provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          context_id: 'ctx_configured',
          approved: true,
          policies: [],
          expires_at: '2025-12-20T12:00:00Z',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'my-configured-client',
      });

      await client.getPolicyApprovedContext({
        userToken: 'test-user',
        query: 'Test query',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('my-configured-client');

      console.log('✅ getPolicyApprovedContext uses configured clientId');
    });

    it('should fall back to tenant when clientId is empty but tenant is set', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          context_id: 'ctx_tenant',
          approved: true,
          policies: [],
          expires_at: '2025-12-20T12:00:00Z',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: '', // Empty clientId
        tenant: 'my-tenant',
      });

      await client.getPolicyApprovedContext({
        userToken: 'test-user',
        query: 'Test query',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('my-tenant');

      console.log('✅ getPolicyApprovedContext falls back to tenant when clientId empty');
    });

    it('should use "community" when both clientId and tenant are empty', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          context_id: 'ctx_community',
          approved: true,
          policies: [],
          expires_at: '2025-12-20T12:00:00Z',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: '',
        tenant: '',
      });

      await client.getPolicyApprovedContext({
        userToken: 'test-user',
        query: 'Test query',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('community');

      console.log(
        '✅ getPolicyApprovedContext uses "community" when both clientId and tenant empty'
      );
    });
  });

  // ============================================================
  // auditLLMCall - Smart Defaults Tests
  // ============================================================
  describe('auditLLMCall smart defaults', () => {
    it('should use "community" as default clientId when no clientId configured', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          audit_id: 'audit_smart_default',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        // No clientId - should use "community" smart default
      });

      await client.auditLLMCall({
        contextId: 'ctx_123',
        responseSummary: 'Test response',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        latencyMs: 250,
      });

      // Verify request was made with smart default clientId
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8080/api/audit/llm-call');

      const body = JSON.parse(options.body);
      expect(body.client_id).toBe('community');

      console.log('✅ auditLLMCall uses "community" smart default');
    });

    it('should use configured clientId when provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          audit_id: 'audit_configured',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'my-configured-client',
      });

      await client.auditLLMCall({
        contextId: 'ctx_123',
        responseSummary: 'Test response',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        latencyMs: 250,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('my-configured-client');

      console.log('✅ auditLLMCall uses configured clientId');
    });

    it('should fall back to tenant when clientId is empty but tenant is set', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          audit_id: 'audit_tenant',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: '', // Empty clientId
        tenant: 'my-tenant',
      });

      await client.auditLLMCall({
        contextId: 'ctx_123',
        responseSummary: 'Test response',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        latencyMs: 250,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('my-tenant');

      console.log('✅ auditLLMCall falls back to tenant when clientId empty');
    });

    it('should use "community" when both clientId and tenant are empty', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          success: true,
          audit_id: 'audit_community',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: '',
        tenant: '',
      });

      await client.auditLLMCall({
        contextId: 'ctx_123',
        responseSummary: 'Test response',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        latencyMs: 250,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('community');

      console.log('✅ auditLLMCall uses "community" when both clientId and tenant empty');
    });
  });

  // ============================================================
  // preCheck alias - Smart Defaults Tests
  // ============================================================
  describe('preCheck (alias) smart defaults', () => {
    it('should use "community" as default clientId (same as getPolicyApprovedContext)', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          context_id: 'ctx_precheck',
          approved: true,
          policies: [],
          expires_at: '2025-12-20T12:00:00Z',
        })
      );

      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        // No clientId
      });

      await client.preCheck({
        userToken: 'test-user',
        query: 'Test query',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.client_id).toBe('community');

      console.log('✅ preCheck alias uses "community" smart default');
    });
  });
});
