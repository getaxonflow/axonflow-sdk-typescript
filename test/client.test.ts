/**
 * Unit tests for AxonFlow SDK Client
 * Tests client initialization, configuration, and core functionality
 */

import { AxonFlow } from '../src/client';
import { AxonFlowConfig } from '../src/types';
import { PolicyViolationError, AuthenticationError, APIError } from '../src/errors';

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
        apiKey: 'test-key',
        tenant: 'test-tenant',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create client with full config', () => {
      const config: AxonFlowConfig = {
        apiKey: 'test-key',
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
        apiKey: 'test-key',
        tenant: 'test-tenant',
      });

      expect(client).toBeDefined();
      // Default mode should be production
      // This is implementation-dependent, just verify it works
    });

    it('should accept sandbox mode', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'sandbox',
      });

      expect(client).toBeDefined();
    });

    it('should accept VPC endpoint', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        endpoint: 'https://vpc-endpoint.example.com:8443',
      });

      expect(client).toBeDefined();
    });
  });

  describe('Sandbox Factory Method', () => {
    it('should create sandbox client with API key', () => {
      const client = AxonFlow.sandbox('test-key');
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create sandbox client with default key', () => {
      const client = AxonFlow.sandbox();
      expect(client).toBeDefined();
    });

    it('should create sandbox client with custom key', () => {
      const client = AxonFlow.sandbox('my-custom-key');
      expect(client).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should allow client creation without credentials (community mode)', () => {
      expect(() => {
        new AxonFlow({
          tenant: 'test-tenant',
        } as AxonFlowConfig);
      }).not.toThrow();
    });

    it('should accept licenseKey without apiKey', () => {
      expect(() => {
        new AxonFlow({
          licenseKey: 'test-license-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should accept apiKey without licenseKey (backward compatibility)', () => {
      expect(() => {
        new AxonFlow({
          apiKey: 'test-api-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should accept both licenseKey and apiKey', () => {
      expect(() => {
        new AxonFlow({
          apiKey: 'test-api-key',
          licenseKey: 'test-license-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should handle empty tenant', () => {
      expect(() => {
        new AxonFlow({
          apiKey: 'test-key',
          tenant: '',
        });
      }).not.toThrow();
    });

    it('should handle custom timeout', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        timeout: 60000,
      });

      expect(client).toBeDefined();
    });

    it('should handle custom retry config', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
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
        apiKey: 'test-key',
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
        apiKey: 'test-key',
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
        apiKey: 'test-key',
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
        apiKey: 'test-key',
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
        apiKey: 'test-key',
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
        apiKey: 'test-key',
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
        apiKey: 'test-key',
        tenant: 'test-tenant',
        timeout: 300000, // 5 minutes
      });

      expect(client).toBeDefined();
    });

    it('should handle disabled retries', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
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
        apiKey: longString,
        tenant: longString,
      });

      expect(client).toBeDefined();
    });
  });

  describe('Multiple Client Instances', () => {
    it('should support multiple independent clients', () => {
      const client1 = new AxonFlow({
        apiKey: 'key1',
        tenant: 'tenant1',
      });

      const client2 = new AxonFlow({
        apiKey: 'key2',
        tenant: 'tenant2',
      });

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(client1).not.toBe(client2);
    });

    it('should support sandbox and production clients simultaneously', () => {
      const sandboxClient = AxonFlow.sandbox();
      const prodClient = new AxonFlow({
        apiKey: 'prod-key',
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
        apiKey: 'test-key',
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

    describe('executeQuery', () => {
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

        const result = await client.executeQuery({
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
          client.executeQuery({
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
          client.executeQuery({
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
          client.executeQuery({
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
          client.executeQuery({
            userToken: 'user-123',
            query: 'Blocked query',
            requestType: 'chat',
          })
        ).rejects.toThrow(PolicyViolationError);
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
        });

        await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors');
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
        ).rejects.toThrow('Failed to install connector');
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

    it('should not warn in debug mode without credentials (community mode)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      new AxonFlow({
        endpoint: 'http://localhost:8080',
        tenant: 'test',
        debug: true,
      });

      // No warning should be produced - credentials are optional
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
        apiKey: 'test-key',
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
});
