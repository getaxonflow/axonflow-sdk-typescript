/**
 * Unit tests for AxonFlow SDK Client
 * Tests client initialization, configuration, and core functionality
 */

import { AxonFlow } from '../src/client';
import { AxonFlowConfig } from '../src/types';
import {
  PolicyViolationError,
  AuthenticationError,
  APIError,
  ConfigurationError,
} from '../src/errors';

// Store original fetch
const originalFetch = global.fetch;

// Mock fetch
const mockFetch = jest.fn();

describe('AxonFlow Client Unit Tests', () => {
  // Restore original fetch after each describe block's tests
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Client Initialization', () => {
    it('should create client with minimal config', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create client with clientId/clientSecret (OAuth2-style)', () => {
      const client = new AxonFlow({
        clientId: 'my-client',
        clientSecret: 'my-secret',
        endpoint: 'http://localhost:8080',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create client with clientId only', () => {
      const client = new AxonFlow({
        clientId: 'my-client',
        endpoint: 'http://localhost:8080',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create client with clientId and clientSecret', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        endpoint: 'http://localhost:8080',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should throw ConfigurationError when clientSecret without clientId', () => {
      expect(() => {
        new AxonFlow({
          clientSecret: 'my-secret',
          endpoint: 'http://localhost:8080',
        });
      }).toThrow(ConfigurationError);

      expect(() => {
        new AxonFlow({
          clientSecret: 'my-secret',
        });
      }).toThrow('clientSecret requires clientId to be set');
    });

    it('should create client with full config', () => {
      const config: AxonFlowConfig = {
        clientId: 'my-client',
        clientSecret: 'my-secret',
        tenant: 'test-tenant',
        endpoint: 'https://custom.example.com',
        mode: 'production',
        debug: true,
        timeout: 30000,
        retry: {
          enabled: true,
          maxAttempts: 5,
          delay: 1000,
        },
        cache: {
          enabled: true,
          ttl: 60000,
        },
      };

      const client = new AxonFlow(config);
      expect(client).toBeDefined();
    });

    it('should use default values for optional config', () => {
      const client = new AxonFlow({
        clientId: 'my-client',
        clientSecret: 'my-secret',
      });

      expect(client).toBeDefined();
      // Default mode should be production
      // This is implementation-dependent, just verify it works
    });

    it('should accept sandbox mode', () => {
      const client = new AxonFlow({
        clientId: 'my-client',
        clientSecret: 'my-secret',
        mode: 'sandbox',
      });

      expect(client).toBeDefined();
    });

    it('should accept VPC endpoint', () => {
      const client = new AxonFlow({
        clientId: 'my-client',
        clientSecret: 'my-secret',
        endpoint: 'https://vpc-endpoint.example.com:8443',
      });

      expect(client).toBeDefined();
    });

    it('should create client without credentials (community mode)', () => {
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
      });

      expect(client).toBeDefined();
    });

    // Test community mode (no credentials)
    it('should allow creation without credentials for community mode', () => {
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create client with clientId and clientSecret', () => {
      const client = new AxonFlow({
        clientId: 'my-client',
        clientSecret: 'my-secret',
        endpoint: 'http://localhost:8080',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });
  });

  describe('Sandbox Factory Method', () => {
    it('should create sandbox client with credentials', () => {
      const client = AxonFlow.sandbox('test-client', 'test-secret');
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create sandbox client with default credentials', () => {
      const client = AxonFlow.sandbox();
      expect(client).toBeDefined();
    });

    it('should create sandbox client with custom credentials', () => {
      const client = AxonFlow.sandbox('my-client', 'my-secret');
      expect(client).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should allow client creation without credentials (community mode)', () => {
      expect(() => {
        new AxonFlow({
          endpoint: 'http://localhost:8080',
        });
      }).not.toThrow();
    });

    it('should accept clientId and clientSecret', () => {
      expect(() => {
        new AxonFlow({
          clientId: 'test-client',
          clientSecret: 'test-secret',
        });
      }).not.toThrow();
    });

    it('should allow clientId and clientSecret with tenant', () => {
      expect(() => {
        new AxonFlow({
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should handle empty tenant', () => {
      expect(() => {
        new AxonFlow({
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tenant: '',
        });
      }).not.toThrow();
    });

    it('should handle custom timeout', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        timeout: 60000,
      });

      expect(client).toBeDefined();
    });

    it('should handle custom retry config', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        retry: {
          enabled: true,
          maxAttempts: 10,
        },
      });

      expect(client).toBeDefined();
    });
  });

  describe('Protect Method', () => {
    it('should accept async function', async () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        mode: 'production', // Use production mode for fail-open
      });

      const mockAICall = async () => {
        return { message: 'Test response' };
      };

      // Will fail-open since endpoint can't be reached
      const result = await client.protect(mockAICall);
      expect(result).toBeDefined();
      expect(result.message).toBe('Test response');
    });

    it('should accept function returning promise', async () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        mode: 'production',
      });

      const mockAICall = () => {
        return Promise.resolve({ message: 'Test response' });
      };

      const result = await client.protect(mockAICall);
      expect(result).toBeDefined();
      expect(result.message).toBe('Test response');
    });

    it('should pass through return value', async () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        mode: 'production',
      });

      const expectedResult = { data: 'test', status: 'success' };
      const mockAICall = async () => expectedResult;

      const result = await client.protect(mockAICall);
      expect(result).toEqual(expectedResult);
    });

    it('should handle function that throws', async () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        mode: 'production',
      });

      const mockAICall = async () => {
        throw new Error('AI call failed');
      };

      await expect(client.protect(mockAICall)).rejects.toThrow('AI call failed');
    });
  });

  describe('Health Check', () => {
    it('should be able to call protect method', async () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        mode: 'production', // Fail-open mode
      });

      const mockAICall = async () => ({ status: 'ok' });

      // This will fail-open in production mode since endpoint doesn't exist
      const result = await client.protect(mockAICall);
      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
    });
  });

  describe('Connector Methods', () => {
    it('should have listConnectors method', () => {
      const client = AxonFlow.sandbox();
      expect(client.listConnectors).toBeDefined();
      expect(typeof client.listConnectors).toBe('function');
    });

    it('should have installConnector method', () => {
      const client = AxonFlow.sandbox();
      expect(client.installConnector).toBeDefined();
      expect(typeof client.installConnector).toBe('function');
    });

    it('should have queryConnector method', () => {
      const client = AxonFlow.sandbox();
      expect(client.queryConnector).toBeDefined();
      expect(typeof client.queryConnector).toBe('function');
    });
  });

  describe('Multi-Agent Planning Methods', () => {
    it('should have generatePlan method', () => {
      const client = AxonFlow.sandbox();
      expect(client.generatePlan).toBeDefined();
      expect(typeof client.generatePlan).toBe('function');
    });

    it('should have executePlan method', () => {
      const client = AxonFlow.sandbox();
      expect(client.executePlan).toBeDefined();
      expect(typeof client.executePlan).toBe('function');
    });

    it('should have getPlanStatus method', () => {
      const client = AxonFlow.sandbox();
      expect(client.getPlanStatus).toBeDefined();
      expect(typeof client.getPlanStatus).toBe('function');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle undefined config values', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        endpoint: undefined,
        mode: undefined,
        debug: undefined,
        timeout: undefined,
        retry: undefined,
      });

      expect(client).toBeDefined();
    });

    it('should handle very long timeout', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        timeout: 300000, // 5 minutes
      });

      expect(client).toBeDefined();
    });

    it('should handle disabled retries', () => {
      const client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        retry: {
          enabled: false,
        },
      });

      expect(client).toBeDefined();
    });

    it('should handle very long strings in config', () => {
      const longString = 'a'.repeat(1000);
      const client = new AxonFlow({
        clientId: longString,
        clientSecret: longString,
        tenant: longString,
      });

      expect(client).toBeDefined();
    });
  });

  describe('Multiple Client Instances', () => {
    it('should support multiple independent clients', () => {
      const client1 = new AxonFlow({
        clientId: 'client1',
        clientSecret: 'secret1',
        tenant: 'tenant1',
      });

      const client2 = new AxonFlow({
        clientId: 'client2',
        clientSecret: 'secret2',
        tenant: 'tenant2',
      });

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(client1).not.toBe(client2);
    });

    it('should support sandbox and production clients simultaneously', () => {
      const sandboxClient = AxonFlow.sandbox();
      const prodClient = new AxonFlow({
        clientId: 'prod-client',
        clientSecret: 'prod-secret',
        tenant: 'prod-tenant',
        mode: 'production',
      });

      expect(sandboxClient).toBeDefined();
      expect(prodClient).toBeDefined();
    });
  });

  describe('API Methods with Mocked Fetch', () => {
    let client: AxonFlow;

    beforeAll(() => {
      // Replace global fetch with mock for this describe block
      global.fetch = mockFetch;
    });

    afterAll(() => {
      // Restore original fetch
      global.fetch = originalFetch;
    });

    beforeEach(() => {
      mockFetch.mockClear();
      client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        endpoint: 'http://localhost:8080',
      });
    });

    describe('healthCheck', () => {
      it('should return healthy status on success', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'healthy',
              version: '1.0.0',
              uptime: '24h',
              components: { agent: { status: 'healthy' } },
            }),
        });

        const health = await client.healthCheck();
        expect(health.status).toBe('healthy');
        expect(health.version).toBe('1.0.0');
      });

      it('should return unhealthy on HTTP error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        const health = await client.healthCheck();
        expect(health.status).toBe('unhealthy');
        expect(health.components?.agent?.status).toBe('error');
      });

      it('should return unhealthy on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const health = await client.healthCheck();
        expect(health.status).toBe('unhealthy');
        expect(health.components?.agent?.message).toContain('Network error');
      });

      it('should return degraded for degraded status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'degraded',
              components: { agent: { status: 'degraded' } },
            }),
        });

        const health = await client.healthCheck();
        expect(health.status).toBe('degraded');
      });
    });

    describe('proxyLLMCall', () => {
      it('should execute query successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: { result: 'test result' },
              blocked: false,
              policy_info: {
                policies_evaluated: ['policy-1'],
                processing_time: '10ms',
                tenant_id: 'test-tenant',
              },
            }),
        });

        const result = await client.proxyLLMCall({
          userToken: 'user-123',
          query: 'Test query',
          requestType: 'chat',
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ result: 'test result' });
        expect(result.policyInfo?.policiesEvaluated).toContain('policy-1');
      });

      it('should throw PolicyViolationError when blocked', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              blocked: true,
              block_reason: 'Sensitive content',
            }),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Sensitive query',
            requestType: 'chat',
          })
        ).rejects.toThrow(PolicyViolationError);
      });

      it('should throw AuthenticationError on 401', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'bad-token',
            query: 'Test',
            requestType: 'chat',
          })
        ).rejects.toThrow(AuthenticationError);
      });

      it('should throw APIError on other errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Server error'),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test',
            requestType: 'chat',
          })
        ).rejects.toThrow(APIError);
      });

      it('should parse policy violation from 403 error body', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                blocked: true,
                block_reason: 'Policy violation in error',
                policy_info: { policies_evaluated: ['policy-x'] },
              })
            ),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Blocked query',
            requestType: 'chat',
          })
        ).rejects.toThrow(PolicyViolationError);
      });

      // BudgetInfo tests (Issue #1082)
      it('should handle HTTP 402 with budget_info and return blocked response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 402,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                success: false,
                blocked: true,
                block_reason: 'Budget exceeded',
                budget_info: {
                  budget_id: 'budget-123',
                  budget_name: 'Team Budget',
                  used_usd: 150.0,
                  limit_usd: 100.0,
                  percentage: 150,
                  exceeded: true,
                  action: 'block',
                },
              })
            ),
        });

        // Should NOT throw - returns blocked response with budgetInfo
        const result = await client.proxyLLMCall({
          userToken: 'user-123',
          query: 'Test query',
          requestType: 'chat',
        });

        expect(result.success).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.budgetInfo).toBeDefined();
        expect(result.budgetInfo?.budgetId).toBe('budget-123');
        expect(result.budgetInfo?.budgetName).toBe('Team Budget');
        expect(result.budgetInfo?.usedUsd).toBe(150.0);
        expect(result.budgetInfo?.limitUsd).toBe(100.0);
        expect(result.budgetInfo?.percentage).toBe(150);
        expect(result.budgetInfo?.exceeded).toBe(true);
        expect(result.budgetInfo?.action).toBe('block');
      });

      it('should throw APIError on HTTP 402 without budget_info', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 402,
          text: () => Promise.resolve('Payment Required'),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test query',
            requestType: 'chat',
          })
        ).rejects.toThrow(APIError);
      });

      it('should throw APIError on HTTP 402 with invalid JSON', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 402,
          text: () => Promise.resolve('{ invalid json'),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test query',
            requestType: 'chat',
          })
        ).rejects.toThrow(APIError);
      });

      it('should throw APIError on HTTP 402 with JSON but no budget_info', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 402,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                error: 'Payment required',
                message: 'Insufficient credits',
              })
            ),
        });

        await expect(
          client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test query',
            requestType: 'chat',
          })
        ).rejects.toThrow(APIError);
      });

      it('should parse budget_info in successful response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              blocked: false,
              data: { result: 'test result' },
              budget_info: {
                budget_id: 'budget-456',
                budget_name: 'Org Budget',
                used_usd: 45.0,
                limit_usd: 100.0,
                percentage: 45,
                exceeded: false,
                action: 'warn',
              },
            }),
        });

        const result = await client.proxyLLMCall({
          userToken: 'user-123',
          query: 'Test query',
          requestType: 'chat',
        });

        expect(result.success).toBe(true);
        expect(result.budgetInfo).toBeDefined();
        expect(result.budgetInfo?.budgetId).toBe('budget-456');
        expect(result.budgetInfo?.percentage).toBe(45);
        expect(result.budgetInfo?.exceeded).toBe(false);
      });

      it('should not throw PolicyViolationError when blocked due to budget', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              blocked: true,
              block_reason: 'Budget exceeded',
              budget_info: {
                budget_id: 'budget-789',
                used_usd: 200.0,
                limit_usd: 100.0,
                percentage: 200,
                exceeded: true,
                action: 'block',
              },
            }),
        });

        // Should NOT throw PolicyViolationError when budget_info is present
        const result = await client.proxyLLMCall({
          userToken: 'user-123',
          query: 'Test query',
          requestType: 'chat',
        });

        expect(result.blocked).toBe(true);
        expect(result.budgetInfo?.exceeded).toBe(true);
      });

      it('should handle budget_info with missing optional fields', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              blocked: false,
              data: { result: 'ok' },
              budget_info: {
                budget_id: 'budget-minimal',
                // No budget_name, uses defaults for missing numeric fields
              },
            }),
        });

        const result = await client.proxyLLMCall({
          userToken: 'user-123',
          query: 'Test query',
          requestType: 'chat',
        });

        expect(result.budgetInfo).toBeDefined();
        expect(result.budgetInfo?.budgetId).toBe('budget-minimal');
        expect(result.budgetInfo?.usedUsd).toBe(0);
        expect(result.budgetInfo?.limitUsd).toBe(0);
        expect(result.budgetInfo?.percentage).toBe(0);
        expect(result.budgetInfo?.exceeded).toBe(false);
      });
    });

    describe('wasRedacted', () => {
      it('should return true when response is redacted', () => {
        const { wasRedacted } = require('../src/types/connector');
        const response = { success: true, data: {}, redacted: true };
        expect(wasRedacted(response)).toBe(true);
      });

      it('should return false when response is not redacted', () => {
        const { wasRedacted } = require('../src/types/connector');
        const response = { success: true, data: {}, redacted: false };
        expect(wasRedacted(response)).toBe(false);
      });

      it('should return false when redacted field is undefined', () => {
        const { wasRedacted } = require('../src/types/connector');
        const response = { success: true, data: {} };
        expect(wasRedacted(response)).toBe(false);
      });
    });

    describe('getPolicyApprovedContext (preCheck)', () => {
      it('should return approved context', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              context_id: 'ctx-123',
              approved: true,
              approved_data: { field: 'value' },
              policies: ['policy-1', 'policy-2'],
              expires_at: '2025-12-31T23:59:59Z',
            }),
        });

        const result = await client.getPolicyApprovedContext({
          userToken: 'user-123',
          query: 'Test query',
        });

        expect(result.approved).toBe(true);
        expect(result.contextId).toBe('ctx-123');
        expect(result.policies).toHaveLength(2);
      });

      it('should return blocked context with reason', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              context_id: 'ctx-456',
              approved: false,
              block_reason: 'PII detected',
              policies: ['pii-protection'],
            }),
        });

        const result = await client.getPolicyApprovedContext({
          userToken: 'user-123',
          query: 'Query with PII',
        });

        expect(result.approved).toBe(false);
        expect(result.blockReason).toBe('PII detected');
      });

      it('should parse rate limit info', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              context_id: 'ctx-789',
              approved: true,
              approved_data: {},
              policies: [],
              rate_limit: {
                limit: 100,
                remaining: 50,
                reset_at: '2025-01-01T00:00:00Z',
              },
            }),
        });

        const result = await client.getPolicyApprovedContext({
          userToken: 'user-123',
          query: 'Test query',
        });

        expect(result.rateLimitInfo?.limit).toBe(100);
        expect(result.rateLimitInfo?.remaining).toBe(50);
      });

      it('should throw AuthenticationError on 401', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Invalid credentials'),
        });

        await expect(
          client.getPolicyApprovedContext({
            userToken: 'bad-token',
            query: 'Test',
          })
        ).rejects.toThrow(AuthenticationError);
      });

      it('preCheck should be alias for getPolicyApprovedContext', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              context_id: 'ctx-alias',
              approved: true,
              approved_data: {},
              policies: [],
            }),
        });

        const result = await client.preCheck({
          userToken: 'user-123',
          query: 'Test',
        });

        expect(result.contextId).toBe('ctx-alias');
      });
    });

    describe('auditLLMCall', () => {
      it('should audit LLM call successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              audit_id: 'audit-123',
            }),
        });

        const result = await client.auditLLMCall({
          contextId: 'ctx-123',
          responseSummary: 'Generated response',
          provider: 'openai',
          model: 'gpt-4',
          tokenUsage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
          latencyMs: 250,
        });

        expect(result.success).toBe(true);
        expect(result.auditId).toBe('audit-123');
      });

      it('should throw AuthenticationError on 401', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        await expect(
          client.auditLLMCall({
            contextId: 'ctx-123',
            responseSummary: 'Response',
            provider: 'openai',
            model: 'gpt-4',
            tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            latencyMs: 100,
          })
        ).rejects.toThrow(AuthenticationError);
      });

      it('should throw APIError on server error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          text: () => Promise.resolve('Internal error'),
        });

        await expect(
          client.auditLLMCall({
            contextId: 'ctx-123',
            responseSummary: 'Response',
            provider: 'openai',
            model: 'gpt-4',
            tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            latencyMs: 100,
          })
        ).rejects.toThrow(APIError);
      });
    });

    describe('listConnectors', () => {
      it('should list connectors successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { name: 'postgres', version: '1.0.0' },
              { name: 'mysql', version: '1.0.0' },
            ]),
        });

        const connectors = await client.listConnectors();
        expect(connectors).toHaveLength(2);
        expect(connectors[0].name).toBe('postgres');
      });

      it('should throw error on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          text: () => Promise.resolve('Internal server error'),
        });

        await expect(client.listConnectors()).rejects.toThrow('API error: 500 Server Error');
      });
    });

    describe('installConnector', () => {
      it('should install connector successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        await expect(
          client.installConnector({
            connector_id: 'pg-1',
            name: 'postgres',
            tenant_id: 'test-tenant',
            options: {},
            credentials: {},
          })
        ).resolves.toBeUndefined();
      });

      it('should throw error on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('Invalid config'),
        });

        await expect(
          client.installConnector({
            connector_id: 'invalid',
            name: 'invalid',
            tenant_id: 'test',
            options: {},
            credentials: {},
          })
        ).rejects.toThrow('API error: 400 Bad Request');
      });
    });

    describe('queryConnector', () => {
      it('should query connector successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: { results: [{ id: 1 }] },
              metadata: { count: 1 },
            }),
        });

        const result = await client.queryConnector('postgres', 'SELECT * FROM users');
        expect(result.success).toBe(true);
        expect(result.data.results).toHaveLength(1);
      });

      it('should throw error on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('Invalid query'),
        });

        await expect(client.queryConnector('postgres', 'INVALID SQL')).rejects.toThrow(
          'Connector query failed'
        );
      });
    });

    describe('generatePlan', () => {
      it('should generate plan successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              plan_id: 'plan-123',
              data: {
                steps: [{ name: 'step1', action: 'do something' }],
                domain: 'travel',
                complexity: 2,
                parallel: false,
              },
              metadata: { created_at: '2025-01-01' },
            }),
        });

        const plan = await client.generatePlan('Book a flight', 'travel');
        expect(plan.planId).toBe('plan-123');
        expect(plan.steps).toHaveLength(1);
        expect(plan.domain).toBe('travel');
      });

      it('should throw error when plan generation fails', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              error: 'Cannot generate plan',
            }),
        });

        await expect(client.generatePlan('Invalid task')).rejects.toThrow('Plan generation failed');
      });

      it('should throw error on HTTP failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          text: () => Promise.resolve('Internal error'),
        });

        await expect(client.generatePlan('Task')).rejects.toThrow('Plan generation failed');
      });
    });

    describe('executePlan', () => {
      it('should execute plan successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              result: 'Plan completed successfully',
              metadata: {
                step_results: [{ step: 1, status: 'done' }],
                duration: 1000,
              },
            }),
        });

        const result = await client.executePlan('plan-123');
        expect(result.status).toBe('completed');
        expect(result.result).toBe('Plan completed successfully');
      });

      it('should return failed status on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              error: 'Step 2 failed',
            }),
        });

        const result = await client.executePlan('plan-123');
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Step 2 failed');
      });

      it('should throw error on HTTP failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Plan not found'),
        });

        await expect(client.executePlan('invalid-plan')).rejects.toThrow('Plan execution failed');
      });
    });

    describe('getPlanStatus', () => {
      it('should get plan status successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'completed',
              result: { data: 'result' },
              step_results: [],
              duration: 500,
            }),
        });

        const status = await client.getPlanStatus('plan-123');
        expect(status.status).toBe('completed');
        expect(status.planId).toBe('plan-123');
      });

      it('should throw error on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Plan not found'),
        });

        await expect(client.getPlanStatus('invalid-plan')).rejects.toThrow(
          'Get plan status failed'
        );
      });
    });
  });

  describe('Community Mode (no credentials)', () => {
    it('should create client without credentials for any endpoint', () => {
      expect(() => {
        new AxonFlow({
          endpoint: 'http://localhost:8080',
          tenant: 'test',
        });
      }).not.toThrow();
    });

    it('should allow tenant without clientId in community mode', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      new AxonFlow({
        endpoint: 'http://localhost:8080',
        tenant: 'test',
        debug: true,
      });

      // No deprecation warnings - tenant alone is valid for community mode
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should NOT warn when using endpoint only (pure community mode)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      new AxonFlow({
        endpoint: 'http://localhost:8080',
        debug: true,
      });

      // No warnings expected - just endpoint in community mode
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should work with any endpoint without credentials', () => {
      expect(() => {
        new AxonFlow({
          endpoint: 'http://127.0.0.1:8080',
          tenant: 'test',
        });
      }).not.toThrow();

      expect(() => {
        new AxonFlow({
          endpoint: 'https://my-custom-host.local',
          tenant: 'test',
        });
      }).not.toThrow();
    });
  });

  describe('Debug Mode with Mocked Fetch', () => {
    beforeAll(() => {
      global.fetch = mockFetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('should log in debug mode on healthCheck error', async () => {
      const debugClient = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test',
        endpoint: 'http://localhost:8080',
        debug: true,
      });

      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await debugClient.healthCheck();

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('Execution Replay Methods', () => {
    let client: AxonFlow;

    beforeAll(() => {
      global.fetch = mockFetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    beforeEach(() => {
      mockFetch.mockClear();
      client = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        endpoint: 'http://localhost:8080',
      });
    });

    describe('listExecutions', () => {
      it('should list executions successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              executions: [
                {
                  request_id: 'exec-123',
                  workflow_name: 'test-workflow',
                  status: 'completed',
                  total_steps: 3,
                  completed_steps: 3,
                  started_at: '2025-01-01T00:00:00Z',
                  completed_at: '2025-01-01T00:01:00Z',
                  duration_ms: 60000,
                  total_tokens: 1000,
                  total_cost_usd: 0.05,
                },
              ],
              total: 1,
              limit: 10,
              offset: 0,
            }),
        });

        const result = await client.listExecutions();
        expect(result.executions).toHaveLength(1);
        expect(result.executions[0].requestId).toBe('exec-123');
        expect(result.executions[0].workflowName).toBe('test-workflow');
        expect(result.executions[0].status).toBe('completed');
        expect(result.total).toBe(1);
      });

      it('should pass filtering options', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              executions: [],
              total: 0,
              limit: 5,
              offset: 10,
            }),
        });

        await client.listExecutions({
          limit: 5,
          offset: 10,
          status: 'completed',
          workflowId: 'wf-123',
          startTime: '2025-01-01',
          endTime: '2025-01-31',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('limit=5'),
          expect.any(Object)
        );
      });

      it('should handle empty response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              executions: null,
              total: 0,
              limit: 10,
              offset: 0,
            }),
        });

        const result = await client.listExecutions();
        expect(result.executions).toEqual([]);
      });

      it('should throw AuthenticationError on 401', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        await expect(client.listExecutions()).rejects.toThrow(AuthenticationError);
      });
    });

    describe('getExecution', () => {
      it('should get execution details successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              summary: {
                request_id: 'exec-123',
                workflow_name: 'test-workflow',
                status: 'completed',
                total_steps: 2,
                completed_steps: 2,
                started_at: '2025-01-01T00:00:00Z',
                completed_at: '2025-01-01T00:01:00Z',
                duration_ms: 60000,
                total_tokens: 500,
                total_cost_usd: 0.025,
              },
              steps: [
                {
                  request_id: 'exec-123',
                  step_index: 0,
                  step_name: 'step-1',
                  status: 'completed',
                  started_at: '2025-01-01T00:00:00Z',
                  completed_at: '2025-01-01T00:00:30Z',
                  duration_ms: 30000,
                  provider: 'openai',
                  model: 'gpt-4',
                  tokens_in: 100,
                  tokens_out: 150,
                  cost_usd: 0.01,
                },
              ],
            }),
        });

        const result = await client.getExecution('exec-123');
        expect(result.summary.requestId).toBe('exec-123');
        expect(result.summary.status).toBe('completed');
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].stepName).toBe('step-1');
        expect(result.steps[0].provider).toBe('openai');
      });

      it('should throw APIError on 404', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Execution not found'),
        });

        await expect(client.getExecution('invalid-id')).rejects.toThrow(APIError);
      });
    });

    describe('getExecutionSteps', () => {
      it('should get execution steps successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                request_id: 'exec-123',
                step_index: 0,
                step_name: 'step-1',
                status: 'completed',
                started_at: '2025-01-01T00:00:00Z',
                tokens_in: 100,
                tokens_out: 150,
                cost_usd: 0.01,
                policies_checked: ['policy-1'],
                policies_triggered: [],
                approval_required: false,
              },
              {
                request_id: 'exec-123',
                step_index: 1,
                step_name: 'step-2',
                status: 'completed',
                started_at: '2025-01-01T00:00:30Z',
                tokens_in: 200,
                tokens_out: 250,
                cost_usd: 0.02,
                approval_required: true,
                approved_by: 'user-123',
                approved_at: '2025-01-01T00:00:35Z',
              },
            ]),
        });

        const steps = await client.getExecutionSteps('exec-123');
        expect(steps).toHaveLength(2);
        expect(steps[0].stepIndex).toBe(0);
        expect(steps[0].policiesChecked).toContain('policy-1');
        expect(steps[1].approvalRequired).toBe(true);
        expect(steps[1].approvedBy).toBe('user-123');
      });

      it('should throw AuthenticationError on 403', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

        await expect(client.getExecutionSteps('exec-123')).rejects.toThrow(AuthenticationError);
      });
    });

    describe('getExecutionTimeline', () => {
      it('should get execution timeline successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                step_index: 0,
                step_name: 'step-1',
                status: 'completed',
                started_at: '2025-01-01T00:00:00Z',
                completed_at: '2025-01-01T00:00:30Z',
                duration_ms: 30000,
                has_error: false,
                has_approval: false,
              },
              {
                step_index: 1,
                step_name: 'step-2',
                status: 'failed',
                started_at: '2025-01-01T00:00:30Z',
                completed_at: '2025-01-01T00:00:45Z',
                duration_ms: 15000,
                has_error: true,
                has_approval: true,
              },
            ]),
        });

        const timeline = await client.getExecutionTimeline('exec-123');
        expect(timeline).toHaveLength(2);
        expect(timeline[0].hasError).toBe(false);
        expect(timeline[1].hasError).toBe(true);
        expect(timeline[1].hasApproval).toBe(true);
      });

      it('should throw APIError on server error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Server error'),
        });

        await expect(client.getExecutionTimeline('exec-123')).rejects.toThrow(APIError);
      });
    });

    describe('exportExecution', () => {
      it('should export execution successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              execution_id: 'exec-123',
              workflow_name: 'test-workflow',
              exported_at: '2025-01-01T00:00:00Z',
              data: { summary: {}, steps: [] },
            }),
        });

        const result = await client.exportExecution('exec-123');
        expect(result.execution_id).toBe('exec-123');
      });

      it('should pass export options', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              execution_id: 'exec-123',
              data: {},
            }),
        });

        await client.exportExecution('exec-123', {
          format: 'json',
          includeInput: true,
          includeOutput: true,
          includePolicies: true,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('include_input=true'),
          expect.any(Object)
        );
      });

      it('should throw APIError on 404', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Execution not found'),
        });

        await expect(client.exportExecution('invalid-id')).rejects.toThrow(APIError);
      });
    });

    describe('deleteExecution', () => {
      it('should delete execution successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 204,
        });

        await expect(client.deleteExecution('exec-123')).resolves.toBeUndefined();
      });

      it('should throw AuthenticationError on 401', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        await expect(client.deleteExecution('exec-123')).rejects.toThrow(AuthenticationError);
      });

      it('should throw APIError on 404', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Execution not found'),
        });

        await expect(client.deleteExecution('invalid-id')).rejects.toThrow(APIError);
      });
    });

    // Note: orchestratorEndpoint and portalEndpoint tests removed in v2.0.0
    // All routes now go through a single endpoint (ADR-026 Single Entry Point)

    describe('debug mode logging', () => {
      it('should log in debug mode for execution methods', async () => {
        const debugClient = new AxonFlow({
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tenant: 'test',
          endpoint: 'http://localhost:8080',
          debug: true,
        });

        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              executions: [],
              total: 0,
              limit: 10,
              offset: 0,
            }),
        });

        await debugClient.listExecutions({ status: 'completed' });

        expect(logSpy).toHaveBeenCalled();
        logSpy.mockRestore();
      });
    });

    describe('Cost Controls - Budgets', () => {
      it('should create budget successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'budget-123',
              name: 'Test Budget',
              scope: 'organization',
              limit_usd: 1000,
              period: 'monthly',
              on_exceed: 'warn',
              alert_thresholds: [50, 80, 100],
              enabled: true,
            }),
        });

        const result = await client.createBudget({
          id: 'budget-123',
          name: 'Test Budget',
          scope: 'organization',
          limitUsd: 1000,
          period: 'monthly',
          onExceed: 'warn',
          alertThresholds: [50, 80, 100],
        });

        expect(result.id).toBe('budget-123');
        expect(result.name).toBe('Test Budget');
        expect(result.scope).toBe('organization');
        expect(result.limitUsd).toBe(1000);
        expect(result.period).toBe('monthly');
        expect(result.onExceed).toBe('warn');
        expect(result.alertThresholds).toEqual([50, 80, 100]);
      });

      it('should get budget successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'budget-123',
              name: 'Test Budget',
              scope: 'team',
              limit_usd: 500,
              period: 'weekly',
              on_exceed: 'block',
              alert_thresholds: [75, 90],
              enabled: true,
              scope_id: 'team-456',
            }),
        });

        const result = await client.getBudget('budget-123');

        expect(result.id).toBe('budget-123');
        expect(result.scope).toBe('team');
        expect(result.scopeId).toBe('team-456');
      });

      it('should list budgets successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              budgets: [
                {
                  id: 'budget-1',
                  name: 'Budget 1',
                  scope: 'organization',
                  limit_usd: 1000,
                  period: 'monthly',
                  on_exceed: 'warn',
                  alert_thresholds: [50],
                  enabled: true,
                },
                {
                  id: 'budget-2',
                  name: 'Budget 2',
                  scope: 'team',
                  limit_usd: 500,
                  period: 'weekly',
                  on_exceed: 'block',
                  alert_thresholds: [80],
                  enabled: true,
                },
              ],
              total: 2,
            }),
        });

        const result = await client.listBudgets();

        expect(result.budgets).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.budgets[0].id).toBe('budget-1');
        expect(result.budgets[1].id).toBe('budget-2');
      });

      it('should list budgets with options', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              budgets: [],
              total: 0,
            }),
        });

        await client.listBudgets({ scope: 'team', limit: 10, offset: 5 });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('scope=team'),
          expect.any(Object)
        );
      });

      it('should update budget successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'budget-123',
              name: 'Updated Budget',
              scope: 'organization',
              limit_usd: 2000,
              period: 'monthly',
              on_exceed: 'block',
              alert_thresholds: [50, 75, 100],
              enabled: true,
            }),
        });

        const result = await client.updateBudget('budget-123', {
          name: 'Updated Budget',
          limitUsd: 2000,
          onExceed: 'block',
          alertThresholds: [50, 75, 100],
        });

        expect(result.name).toBe('Updated Budget');
        expect(result.limitUsd).toBe(2000);
        expect(result.onExceed).toBe('block');
      });

      it('should delete budget successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await expect(client.deleteBudget('budget-123')).resolves.not.toThrow();
      });
    });

    describe('Cost Controls - Budget Status & Alerts', () => {
      it('should get budget status successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              budget: {
                id: 'budget-123',
                name: 'Test Budget',
                scope: 'organization',
                limit_usd: 1000,
                period: 'monthly',
                on_exceed: 'warn',
                alert_thresholds: [50, 80],
                enabled: true,
              },
              used_usd: 450,
              remaining_usd: 550,
              percentage: 45,
              is_exceeded: false,
              is_blocked: false,
              period_start: '2025-01-01T00:00:00Z',
              period_end: '2025-01-31T23:59:59Z',
            }),
        });

        const result = await client.getBudgetStatus('budget-123');

        expect(result.usedUsd).toBe(450);
        expect(result.remainingUsd).toBe(550);
        expect(result.percentage).toBe(45);
        expect(result.isExceeded).toBe(false);
        expect(result.isBlocked).toBe(false);
        expect(result.budget.id).toBe('budget-123');
      });

      it('should get budget alerts successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              alerts: [
                {
                  id: 'alert-1',
                  budget_id: 'budget-123',
                  alert_type: 'threshold',
                  threshold: 50,
                  percentage_reached: 52,
                  amount_usd: 520,
                  message: 'Budget reached 50% threshold',
                  created_at: '2025-01-15T10:30:00Z',
                },
              ],
              count: 1,
            }),
        });

        const result = await client.getBudgetAlerts('budget-123');

        expect(result.alerts).toHaveLength(1);
        expect(result.count).toBe(1);
        expect(result.alerts[0].alertType).toBe('threshold');
        expect(result.alerts[0].threshold).toBe(50);
      });

      it('should check budget successfully - allowed', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              allowed: true,
              action: 'allow',
              message: 'Budget check passed',
            }),
        });

        const result = await client.checkBudget({ orgId: 'org-123' });

        expect(result.allowed).toBe(true);
        expect(result.action).toBe('allow');
      });

      it('should check budget successfully - blocked', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              allowed: false,
              action: 'block',
              message: 'Budget exceeded',
              budgets: [
                {
                  id: 'budget-123',
                  name: 'Test Budget',
                  scope: 'organization',
                  limit_usd: 1000,
                  period: 'monthly',
                  on_exceed: 'block',
                  alert_thresholds: [],
                  enabled: true,
                },
              ],
            }),
        });

        const result = await client.checkBudget({
          orgId: 'org-123',
          teamId: 'team-456',
          agentId: 'agent-789',
        });

        expect(result.allowed).toBe(false);
        expect(result.action).toBe('block');
        expect(result.budgets).toBeDefined();
        expect(result.budgets).toHaveLength(1);
      });
    });

    describe('Cost Controls - Usage', () => {
      it('should get usage summary successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              total_cost_usd: 1234.56,
              total_requests: 5000,
              total_tokens_in: 1000000,
              total_tokens_out: 500000,
              average_cost_per_request: 0.247,
              period: 'monthly',
              period_start: '2025-01-01T00:00:00Z',
              period_end: '2025-01-31T23:59:59Z',
            }),
        });

        const result = await client.getUsageSummary('monthly');

        expect(result.totalCostUsd).toBe(1234.56);
        expect(result.totalRequests).toBe(5000);
        expect(result.totalTokensIn).toBe(1000000);
        expect(result.totalTokensOut).toBe(500000);
        expect(result.period).toBe('monthly');
      });

      it('should get usage summary without period', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              total_cost_usd: 100,
              total_requests: 100,
              total_tokens_in: 10000,
              total_tokens_out: 5000,
              average_cost_per_request: 1,
              period: 'daily',
              period_start: '2025-01-15T00:00:00Z',
              period_end: '2025-01-15T23:59:59Z',
            }),
        });

        await client.getUsageSummary();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/usage'),
          expect.any(Object)
        );
      });

      it('should get usage breakdown successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              group_by: 'provider',
              total_cost_usd: 1000,
              items: [
                {
                  group_value: 'openai',
                  cost_usd: 600,
                  percentage: 60,
                  request_count: 3000,
                  tokens_in: 600000,
                  tokens_out: 300000,
                },
                {
                  group_value: 'anthropic',
                  cost_usd: 400,
                  percentage: 40,
                  request_count: 2000,
                  tokens_in: 400000,
                  tokens_out: 200000,
                },
              ],
              period: 'monthly',
              period_start: '2025-01-01T00:00:00Z',
              period_end: '2025-01-31T23:59:59Z',
            }),
        });

        const result = await client.getUsageBreakdown('provider', 'monthly');

        expect(result.groupBy).toBe('provider');
        expect(result.totalCostUsd).toBe(1000);
        expect(result.items).toHaveLength(2);
        expect(result.items[0].groupValue).toBe('openai');
        expect(result.items[0].percentage).toBe(60);
      });

      it('should list usage records successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              records: [
                {
                  id: 'record-1',
                  provider: 'openai',
                  model: 'gpt-4',
                  tokens_in: 1000,
                  tokens_out: 500,
                  cost_usd: 0.05,
                  request_id: 'req-123',
                  org_id: 'org-456',
                  timestamp: '2025-01-15T10:30:00Z',
                },
              ],
              total: 1,
            }),
        });

        const result = await client.listUsageRecords();

        expect(result.records).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.records[0].provider).toBe('openai');
        expect(result.records[0].model).toBe('gpt-4');
        expect(result.records[0].costUsd).toBe(0.05);
      });

      it('should list usage records with options', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              records: [],
              total: 0,
            }),
        });

        await client.listUsageRecords({
          limit: 50,
          offset: 10,
          provider: 'anthropic',
          model: 'claude-3',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('provider=anthropic'),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('model=claude-3'),
          expect.any(Object)
        );
      });
    });

    describe('Cost Controls - Pricing', () => {
      it('should get pricing list successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              pricing: [
                {
                  provider: 'openai',
                  model: 'gpt-4',
                  pricing: {
                    input_per_1k: 0.03,
                    output_per_1k: 0.06,
                  },
                },
                {
                  provider: 'anthropic',
                  model: 'claude-3-opus',
                  pricing: {
                    input_per_1k: 0.015,
                    output_per_1k: 0.075,
                  },
                },
              ],
            }),
        });

        const result = await client.getPricing();

        expect(result.pricing).toHaveLength(2);
        expect(result.pricing[0].provider).toBe('openai');
        expect(result.pricing[0].pricing.inputPer1k).toBe(0.03);
        expect(result.pricing[1].provider).toBe('anthropic');
      });

      it('should get pricing with provider filter', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              pricing: [
                {
                  provider: 'openai',
                  model: 'gpt-4',
                  pricing: {
                    input_per_1k: 0.03,
                    output_per_1k: 0.06,
                  },
                },
              ],
            }),
        });

        await client.getPricing('openai');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('provider=openai'),
          expect.any(Object)
        );
      });

      it('should handle single pricing object response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              provider: 'openai',
              model: 'gpt-4',
              pricing: {
                input_per_1k: 0.03,
                output_per_1k: 0.06,
              },
            }),
        });

        const result = await client.getPricing('openai', 'gpt-4');

        expect(result.pricing).toHaveLength(1);
        expect(result.pricing[0].provider).toBe('openai');
        expect(result.pricing[0].model).toBe('gpt-4');
      });
    });

    describe('Additional Branch Coverage Tests', () => {
      describe('protect() method branches', () => {
        it('should handle sandbox mode errors without fail-open', async () => {
          const sandboxClient = new AxonFlow({
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tenant: 'test-tenant',
            mode: 'sandbox',
          });

          const mockAICall = async () => {
            return { result: 'success' };
          };

          // In sandbox mode with unreachable endpoint, should throw
          await expect(sandboxClient.protect(mockAICall)).rejects.toThrow();
        });

        it('should handle governance error in sandbox mode', async () => {
          mockFetch.mockRejectedValueOnce(new Error('governance service unavailable'));

          const sandboxClient = new AxonFlow({
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tenant: 'test-tenant',
            mode: 'sandbox',
            endpoint: 'http://localhost:8080',
          });

          const mockAICall = async () => ({ result: 'success' });

          // Sandbox mode should throw governance errors
          await expect(sandboxClient.protect(mockAICall)).rejects.toThrow('governance');
        });

        it('should log debug info in protect method on error', async () => {
          const logSpy = jest.spyOn(console, 'log').mockImplementation();
          mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

          const debugClient = new AxonFlow({
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tenant: 'test-tenant',
            mode: 'production',
            endpoint: 'http://localhost:8080',
            debug: true,
          });

          const mockAICall = async () => ({ result: 'success' });
          await debugClient.protect(mockAICall);

          expect(logSpy).toHaveBeenCalled();
          logSpy.mockRestore();
        });
      });

      describe('checkPolicies response branches', () => {
        it('should handle response with modified data', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                blocked: false,
                data: { modified: true, content: 'sanitized' },
                policy_info: {
                  policies_evaluated: ['pii-filter'],
                  processing_time: '5ms',
                },
              }),
          });

          const result = await client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test with PII',
            requestType: 'chat',
          });

          expect(result.success).toBe(true);
          expect(result.data).toEqual({ modified: true, content: 'sanitized' });
        });

        it('should handle response without policy_info', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                blocked: false,
                success: true,
                data: { result: 'ok' },
              }),
          });

          const result = await client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Simple query',
            requestType: 'chat',
          });

          expect(result.success).toBe(true);
        });

        it('should handle response with empty policies_evaluated', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                blocked: false,
                success: true,
                data: { result: 'ok' },
                policy_info: {
                  policies_evaluated: [],
                  processing_time: '1ms',
                },
              }),
          });

          const result = await client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test query',
            requestType: 'chat',
          });

          expect(result.policyInfo?.policiesEvaluated).toEqual([]);
        });
      });

      // Note: getOrchestratorUrl and getPortalUrl fallback tests removed in v2.0.0
      // All routes now go through a single endpoint (ADR-026 Single Entry Point)

      describe('proxyLLMCall additional branches', () => {
        it('should handle 403 error with non-policy violation body', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: () => Promise.resolve('Access denied'),
          });

          await expect(
            client.proxyLLMCall({
              userToken: 'user-123',
              query: 'Test',
              requestType: 'chat',
            })
          ).rejects.toThrow(AuthenticationError);
        });

        it('should handle 403 error with policy violation JSON body', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  blocked: true,
                  block_reason: 'PII detected',
                  policy_info: { policies_evaluated: ['pii-policy'] },
                })
              ),
          });

          await expect(
            client.proxyLLMCall({
              userToken: 'user-123',
              query: 'Test',
              requestType: 'chat',
            })
          ).rejects.toThrow(PolicyViolationError);
        });

        it('should handle proxyLLMCall with context parameter', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                data: { result: 'ok' },
                blocked: false,
              }),
          });

          const result = await client.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test',
            requestType: 'chat',
            context: { custom: 'data' },
          });

          expect(result.success).toBe(true);
        });
      });

      describe('getPolicyApprovedContext additional branches', () => {
        it('should handle response without expires_at', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                context_id: 'ctx-no-expiry',
                approved: true,
                approved_data: {},
                policies: [],
              }),
          });

          const result = await client.getPolicyApprovedContext({
            userToken: 'user-123',
            query: 'Test',
          });

          expect(result.contextId).toBe('ctx-no-expiry');
          expect(result.expiresAt).toBeInstanceOf(Date);
        });

        it('should handle preCheck with dataSources', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                context_id: 'ctx-with-ds',
                approved: true,
                approved_data: {},
                policies: [],
              }),
          });

          await client.getPolicyApprovedContext({
            userToken: 'user-123',
            query: 'Test',
            dataSources: ['source1'],
          });

          expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: expect.stringContaining('data_sources'),
            })
          );
        });

        it('should throw APIError on 403 for preCheck', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: () => Promise.resolve('Forbidden'),
          });

          await expect(
            client.getPolicyApprovedContext({
              userToken: 'bad-token',
              query: 'Test',
            })
          ).rejects.toThrow(AuthenticationError);
        });
      });

      describe('auditLLMCall additional branches', () => {
        it('should handle auditLLMCall with metadata', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                audit_id: 'audit-with-meta',
              }),
          });

          const result = await client.auditLLMCall({
            contextId: 'ctx-123',
            responseSummary: 'Response',
            provider: 'openai',
            model: 'gpt-4',
            tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            latencyMs: 100,
            metadata: { custom: 'field' },
          });

          expect(result.auditId).toBe('audit-with-meta');
        });

        it('should throw AuthenticationError on 403 for auditLLMCall', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: () => Promise.resolve('Forbidden'),
          });

          await expect(
            client.auditLLMCall({
              contextId: 'ctx-123',
              responseSummary: 'Response',
              provider: 'openai',
              model: 'gpt-4',
              tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
              latencyMs: 100,
            })
          ).rejects.toThrow(AuthenticationError);
        });
      });

      describe('Debug mode logging for various methods', () => {
        let debugClient: AxonFlow;
        let logSpy: jest.SpyInstance;

        beforeEach(() => {
          debugClient = new AxonFlow({
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tenant: 'test-tenant',
            endpoint: 'http://localhost:8080',
            debug: true,
          });
          logSpy = jest.spyOn(console, 'log').mockImplementation();
        });

        afterEach(() => {
          logSpy.mockRestore();
        });

        it('should log in debug mode for proxyLLMCall', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                blocked: false,
                data: {},
              }),
          });

          await debugClient.proxyLLMCall({
            userToken: 'user-123',
            query: 'Test',
            requestType: 'chat',
          });

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for getPolicyApprovedContext', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                context_id: 'ctx-123',
                approved: true,
                approved_data: {},
                policies: [],
              }),
          });

          await debugClient.getPolicyApprovedContext({
            userToken: 'user-123',
            query: 'Test',
          });

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for auditLLMCall', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                audit_id: 'audit-123',
              }),
          });

          await debugClient.auditLLMCall({
            contextId: 'ctx-123',
            responseSummary: 'Response',
            provider: 'openai',
            model: 'gpt-4',
            tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            latencyMs: 100,
          });

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for queryConnector', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                data: {},
              }),
          });

          await debugClient.queryConnector('postgres', 'SELECT 1');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for installConnector', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });

          await debugClient.installConnector({
            connector_id: 'conn-1',
            name: 'postgres',
            tenant_id: 'test-tenant',
            options: {},
            credentials: {},
          });

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for uninstallConnector', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });

          await debugClient.uninstallConnector('postgres');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for getConnector', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'conn-1',
                name: 'postgres',
                version: '1.0.0',
                description: 'PostgreSQL connector',
              }),
          });

          await debugClient.getConnector('conn-1');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for getConnectorHealth', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                healthy: true,
                last_check: '2025-01-01T00:00:00Z',
              }),
          });

          await debugClient.getConnectorHealth('conn-1');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for generatePlan', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                plan_id: 'plan-123',
                data: {
                  steps: [],
                  domain: 'test',
                  complexity: 1,
                  parallel: false,
                },
              }),
          });

          await debugClient.generatePlan('Test plan');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for executePlan', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                result: 'done',
              }),
          });

          await debugClient.executePlan('plan-123');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for getExecution', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                summary: {
                  request_id: 'exec-123',
                  workflow_name: 'test',
                  status: 'completed',
                  total_steps: 1,
                  completed_steps: 1,
                  started_at: '2025-01-01T00:00:00Z',
                  total_tokens: 100,
                  total_cost_usd: 0.01,
                },
                steps: [],
              }),
          });

          await debugClient.getExecution('exec-123');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for getExecutionSteps', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([]),
          });

          await debugClient.getExecutionSteps('exec-123');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for getExecutionTimeline', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([]),
          });

          await debugClient.getExecutionTimeline('exec-123');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for exportExecution', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ execution_id: 'exec-123' }),
          });

          await debugClient.exportExecution('exec-123');

          expect(logSpy).toHaveBeenCalled();
        });

        it('should log in debug mode for deleteExecution', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 204,
          });

          await debugClient.deleteExecution('exec-123');

          expect(logSpy).toHaveBeenCalled();
        });
      });

      describe('orchestratorRequest error handling', () => {
        it('should handle 404 error in orchestratorRequest', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: () => Promise.resolve('Resource not found'),
          });

          await expect(client.listConnectors()).rejects.toThrow(APIError);
        });

        it('should handle generic error in orchestratorRequest', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            text: () => Promise.resolve('Gateway error'),
          });

          await expect(client.listConnectors()).rejects.toThrow('API error: 502 Bad Gateway');
        });
      });

      describe('generatePlan with userToken', () => {
        it('should pass userToken to generatePlan', async () => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                plan_id: 'plan-123',
                data: {
                  steps: [],
                  domain: 'travel',
                  complexity: 1,
                  parallel: false,
                },
              }),
          });

          await client.generatePlan('Book flight', 'travel', 'user-token-123');

          expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: expect.stringContaining('user-token-123'),
            })
          );
        });
      });

      describe('queryConnector with credentials', () => {
        it('should use credentials in queryConnector', async () => {
          const clientWithCredentials = new AxonFlow({
            clientId: 'test-client',
            clientSecret: 'test-secret',
            tenant: 'test-tenant',
            endpoint: 'http://localhost:8080',
          });

          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                data: {},
              }),
          });

          await clientWithCredentials.queryConnector('postgres', 'SELECT 1');

          // OAuth2 Basic auth header should be present
          expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              headers: expect.objectContaining({
                Authorization: expect.stringMatching(/^Basic /),
              }),
            })
          );
        });
      });
    });
  });
});
