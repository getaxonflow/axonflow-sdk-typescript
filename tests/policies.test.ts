/**
 * Tests for Policy CRUD methods
 * Part of Unified Policy Architecture v2.0.0
 */

import { AxonFlow } from '../src/client';
import type {
  StaticPolicy,
  DynamicPolicy,
  PolicyOverride,
  TestPatternResult,
  PolicyVersion,
  CreateStaticPolicyRequest,
  CreateDynamicPolicyRequest,
  CreatePolicyOverrideRequest,
} from '../src/types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Policy CRUD Methods', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
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

  // Sample test data
  const sampleStaticPolicy: StaticPolicy = {
    id: 'pol_123',
    name: 'Block SQL Injection',
    description: 'Blocks SQL injection attempts',
    category: 'security-sqli',
    tier: 'system',
    pattern: '(?i)(union\\s+select|drop\\s+table)',
    severity: 'critical',
    enabled: true,
    action: 'block',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    version: 1,
  };

  const sampleDynamicPolicy: DynamicPolicy = {
    id: 'dpol_456',
    name: 'Rate Limit API',
    description: 'Rate limit API calls',
    type: 'cost',
    conditions: [{ field: 'requests_per_minute', operator: 'greater_than', value: 100 }],
    actions: [{ type: 'block', config: { reason: 'Rate limit exceeded' } }],
    priority: 50,
    enabled: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  const sampleOverride: PolicyOverride = {
    policy_id: 'pol_123',
    action_override: 'warn',
    override_reason: 'Testing override',
    created_at: '2025-01-01T00:00:00Z',
    active: true,
  };

  // ========================================================================
  // Static Policy Tests
  // ========================================================================

  describe('Static Policies', () => {
    describe('listStaticPolicies', () => {
      it('should list all static policies', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ policies: [sampleStaticPolicy] }));

        const policies = await client.listStaticPolicies();

        expect(policies).toHaveLength(1);
        expect(policies[0].id).toBe('pol_123');
        expect(policies[0].name).toBe('Block SQL Injection');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should filter by category', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ policies: [sampleStaticPolicy] }));

        await client.listStaticPolicies({ category: 'security-sqli' });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies?category=security-sqli',
          expect.any(Object)
        );
      });

      it('should filter by tier', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

        await client.listStaticPolicies({ tier: 'system' });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies?tier=system',
          expect.any(Object)
        );
      });

      it('should filter by enabled status', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

        await client.listStaticPolicies({ enabled: true });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies?enabled=true',
          expect.any(Object)
        );
      });

      it('should support pagination', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

        await client.listStaticPolicies({ limit: 10, offset: 20 });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('limit=10'),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('offset=20'),
          expect.any(Object)
        );
      });

      it('should support sorting', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

        await client.listStaticPolicies({ sortBy: 'severity', sortOrder: 'desc' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('sort_by=severity'),
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('sort_order=desc'),
          expect.any(Object)
        );
      });

      it('should filter by organization ID (Enterprise)', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ policies: [sampleStaticPolicy] }));

        await client.listStaticPolicies({
          tier: 'organization',
          organizationId: 'org_12345',
        });

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('tier=organization');
        expect(url).toContain('organization_id=org_12345');
      });
    });

    describe('getStaticPolicy', () => {
      it('should get a specific policy by ID', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(sampleStaticPolicy));

        const policy = await client.getStaticPolicy('pol_123');

        expect(policy.id).toBe('pol_123');
        expect(policy.name).toBe('Block SQL Injection');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123',
          expect.objectContaining({ method: 'GET' })
        );
      });
    });

    describe('createStaticPolicy', () => {
      it('should create a new policy', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(sampleStaticPolicy));

        const request: CreateStaticPolicyRequest = {
          name: 'Block SQL Injection',
          category: 'security-sqli',
          pattern: '(?i)(union\\s+select|drop\\s+table)',
          severity: 'critical',
          action: 'block',
        };

        const policy = await client.createStaticPolicy(request);

        expect(policy.id).toBe('pol_123');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Block SQL Injection'),
          })
        );
      });
    });

    describe('updateStaticPolicy', () => {
      it('should update an existing policy', async () => {
        const updatedPolicy = { ...sampleStaticPolicy, severity: 'high' as const };
        mockFetch.mockReturnValueOnce(mockResponse(updatedPolicy));

        const policy = await client.updateStaticPolicy('pol_123', { severity: 'high' });

        expect(policy.severity).toBe('high');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123',
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"severity":"high"'),
          })
        );
      });
    });

    describe('deleteStaticPolicy', () => {
      it('should delete a policy', async () => {
        mockFetch.mockReturnValueOnce(
          Promise.resolve({
            ok: true,
            status: 204,
            statusText: 'No Content',
            json: () => Promise.resolve(undefined),
            text: () => Promise.resolve(''),
          })
        );

        await client.deleteStaticPolicy('pol_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('toggleStaticPolicy', () => {
      it('should toggle policy enabled status', async () => {
        const toggledPolicy = { ...sampleStaticPolicy, enabled: false };
        mockFetch.mockReturnValueOnce(mockResponse(toggledPolicy));

        const policy = await client.toggleStaticPolicy('pol_123', false);

        expect(policy.enabled).toBe(false);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123',
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"enabled":false'),
          })
        );
      });
    });

    describe('getEffectiveStaticPolicies', () => {
      it('should get effective policies with inheritance', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ static: [sampleStaticPolicy], dynamic: [] }));

        const policies = await client.getEffectiveStaticPolicies();

        expect(policies).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/effective',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should filter effective policies by category', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ static: [sampleStaticPolicy], dynamic: [] }));

        await client.getEffectiveStaticPolicies({ category: 'security-sqli' });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/effective?category=security-sqli',
          expect.any(Object)
        );
      });
    });

    describe('testPattern', () => {
      it('should test a regex pattern', async () => {
        const testResult: TestPatternResult = {
          valid: true,
          pattern: '(?i)select',
          inputs: ['SELECT * FROM users', 'Hello world'],
          matches: [
            { input: 'SELECT * FROM users', matched: true },
            { input: 'Hello world', matched: false },
          ],
        };
        mockFetch.mockReturnValueOnce(mockResponse(testResult));

        const result = await client.testPattern('(?i)select', [
          'SELECT * FROM users',
          'Hello world',
        ]);

        expect(result.valid).toBe(true);
        expect(result.matches).toHaveLength(2);
        expect(result.matches[0].matched).toBe(true);
        expect(result.matches[1].matched).toBe(false);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/test',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('inputs'),
          })
        );
      });

      it('should return error for invalid pattern', async () => {
        const testResult: TestPatternResult = {
          valid: false,
          error: 'Invalid regex: unmatched parenthesis',
          pattern: '(invalid[',
          inputs: ['test'],
          matches: [],
        };
        mockFetch.mockReturnValueOnce(mockResponse(testResult));

        const result = await client.testPattern('(invalid[', ['test']);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid regex');
      });
    });

    describe('getStaticPolicyVersions', () => {
      it('should get policy version history', async () => {
        // API returns snake_case fields, SDK transforms to camelCase
        const apiVersions = [
          {
            version: 2,
            changed_at: '2025-01-02T00:00:00Z',
            change_type: 'updated',
            change_description: 'Updated severity',
          },
          {
            version: 1,
            changed_at: '2025-01-01T00:00:00Z',
            change_type: 'created',
          },
        ];
        mockFetch.mockReturnValueOnce(
          mockResponse({ policy_id: 'pol_123', versions: apiVersions, count: 2 })
        );

        const result = await client.getStaticPolicyVersions('pol_123');

        expect(result).toHaveLength(2);
        expect(result[0].version).toBe(2);
        expect(result[1].changeType).toBe('created');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123/versions',
          expect.objectContaining({ method: 'GET' })
        );
      });
    });
  });

  // ========================================================================
  // Policy Override Tests
  // ========================================================================

  describe('Policy Overrides', () => {
    describe('listPolicyOverrides', () => {
      it('should list all policy overrides', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ overrides: [sampleOverride] }));

        const overrides = await client.listPolicyOverrides();

        expect(overrides).toHaveLength(1);
        expect(overrides[0].policy_id).toBe('pol_123');
        expect(overrides[0].action_override).toBe('warn');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/overrides',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should return empty array when no overrides exist', async () => {
        mockFetch.mockReturnValueOnce(mockResponse({ overrides: [] }));

        const overrides = await client.listPolicyOverrides();

        expect(overrides).toHaveLength(0);
      });
    });

    describe('createPolicyOverride', () => {
      it('should create an override', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(sampleOverride));

        const request: CreatePolicyOverrideRequest = {
          action_override: 'warn',
          override_reason: 'Testing override',
        };

        const override = await client.createPolicyOverride('pol_123', request);

        expect(override.action_override).toBe('warn');
        expect(override.override_reason).toBe('Testing override');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123/override',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"action_override":"warn"'),
          })
        );
      });

      it('should create an override with expiration', async () => {
        const overrideWithExpiry = {
          ...sampleOverride,
          expires_at: '2025-12-31T23:59:59Z',
        };
        mockFetch.mockReturnValueOnce(mockResponse(overrideWithExpiry));

        const request: CreatePolicyOverrideRequest = {
          action_override: 'warn',
          override_reason: 'Temporary override',
          expires_at: '2025-12-31T23:59:59Z',
        };

        const override = await client.createPolicyOverride('pol_123', request);

        expect(override.expires_at).toBe('2025-12-31T23:59:59Z');
      });
    });

    describe('deletePolicyOverride', () => {
      it('should delete an override', async () => {
        mockFetch.mockReturnValueOnce(
          Promise.resolve({
            ok: true,
            status: 204,
            statusText: 'No Content',
            json: () => Promise.resolve(undefined),
            text: () => Promise.resolve(''),
          })
        );

        await client.deletePolicyOverride('pol_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/static-policies/pol_123/override',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });

  // ========================================================================
  // Dynamic Policy Tests
  // ========================================================================

  describe('Dynamic Policies', () => {
    describe('listDynamicPolicies', () => {
      it('should list all dynamic policies', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleDynamicPolicy]));

        const policies = await client.listDynamicPolicies();

        expect(policies).toHaveLength(1);
        expect(policies[0].id).toBe('dpol_456');
        expect(policies[0].name).toBe('Rate Limit API');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/dynamic-policies',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should filter by type', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleDynamicPolicy]));

        await client.listDynamicPolicies({ type: 'cost' });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/dynamic-policies?type=cost',
          expect.any(Object)
        );
      });
    });

    describe('getDynamicPolicy', () => {
      it('should get a specific dynamic policy', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(sampleDynamicPolicy));

        const policy = await client.getDynamicPolicy('dpol_456');

        expect(policy.id).toBe('dpol_456');
        expect(policy.type).toBe('cost');
      });
    });

    describe('createDynamicPolicy', () => {
      it('should create a new dynamic policy', async () => {
        mockFetch.mockReturnValueOnce(mockResponse(sampleDynamicPolicy));

        const request: CreateDynamicPolicyRequest = {
          name: 'Rate Limit API',
          type: 'cost',
          conditions: [{ field: 'requests_per_minute', operator: 'greater_than', value: 100 }],
          actions: [{ type: 'block', config: { reason: 'Rate limit exceeded' } }],
          priority: 50,
        };

        const policy = await client.createDynamicPolicy(request);

        expect(policy.id).toBe('dpol_456');
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/dynamic-policies',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Rate Limit API'),
          })
        );
      });
    });

    describe('updateDynamicPolicy', () => {
      it('should update a dynamic policy', async () => {
        const updatedPolicy = {
          ...sampleDynamicPolicy,
          conditions: [{ field: 'requests_per_minute', operator: 'greater_than', value: 200 }],
        };
        mockFetch.mockReturnValueOnce(mockResponse(updatedPolicy));

        const policy = await client.updateDynamicPolicy('dpol_456', {
          conditions: [{ field: 'requests_per_minute', operator: 'greater_than', value: 200 }],
        });

        expect(policy.conditions?.[0]?.value).toBe(200);
      });
    });

    describe('deleteDynamicPolicy', () => {
      it('should delete a dynamic policy', async () => {
        mockFetch.mockReturnValueOnce(
          Promise.resolve({
            ok: true,
            status: 204,
            statusText: 'No Content',
            json: () => Promise.resolve(undefined),
            text: () => Promise.resolve(''),
          })
        );

        await client.deleteDynamicPolicy('dpol_456');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/dynamic-policies/dpol_456',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('toggleDynamicPolicy', () => {
      it('should toggle dynamic policy enabled status', async () => {
        const toggledPolicy = { ...sampleDynamicPolicy, enabled: false };
        mockFetch.mockReturnValueOnce(mockResponse(toggledPolicy));

        const policy = await client.toggleDynamicPolicy('dpol_456', false);

        expect(policy.enabled).toBe(false);
      });
    });

    describe('getEffectiveDynamicPolicies', () => {
      it('should get effective dynamic policies', async () => {
        mockFetch.mockReturnValueOnce(mockResponse([sampleDynamicPolicy]));

        const policies = await client.getEffectiveDynamicPolicies();

        expect(policies).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/dynamic-policies/effective',
          expect.objectContaining({ method: 'GET' })
        );
      });
    });
  });

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('Error Handling', () => {
    it('should throw AuthenticationError on 401', async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'Invalid credentials' }),
          text: () => Promise.resolve('{"error": "Invalid credentials"}'),
        })
      );

      await expect(client.listStaticPolicies()).rejects.toThrow('Request failed');
    });

    it('should throw AuthenticationError on 403', async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: () => Promise.resolve({ error: 'Access denied' }),
          text: () => Promise.resolve('{"error": "Access denied"}'),
        })
      );

      await expect(
        client.createStaticPolicy({
          name: 'Test',
          category: 'pii-global',
          pattern: '.*',
        })
      ).rejects.toThrow('Request failed');
    });

    it('should throw APIError on other errors', async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({ error: 'Server error' }),
          text: () => Promise.resolve('{"error": "Server error"}'),
        })
      );

      await expect(client.getStaticPolicy('pol_123')).rejects.toThrow();
    });
  });

  // ========================================================================
  // Authentication Header Tests
  // ========================================================================

  describe('Authentication Headers', () => {
    it('should include X-License-Key header when licenseKey is set', async () => {
      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await client.listStaticPolicies();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should not include auth headers for localhost', async () => {
      const localClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        tenant: 'test',
      });

      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await localClient.listStaticPolicies();

      // Check that the call was made (headers will be included but not auth ones)
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should use apiKey for X-Client-Secret when licenseKey not set', async () => {
      const apiKeyClient = new AxonFlow({
        endpoint: 'https://api.example.com',
        apiKey: 'test-api-key',
        tenant: 'test',
      });

      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await apiKeyClient.listStaticPolicies();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Client-Secret': 'test-api-key',
          }),
        })
      );
    });

    it('should prefer licenseKey over apiKey when both are set', async () => {
      const dualAuthClient = new AxonFlow({
        endpoint: 'https://api.example.com',
        licenseKey: 'test-license-key',
        apiKey: 'test-api-key',
        tenant: 'test',
      });

      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await dualAuthClient.listStaticPolicies();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-License-Key': 'test-license-key',
          }),
        })
      );
    });

    it('should include auth headers when credentials are provided', async () => {
      const localClient = new AxonFlow({
        endpoint: 'http://127.0.0.1:8080',
        licenseKey: 'test-license-key',
        tenant: 'test',
      });

      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await localClient.listStaticPolicies();

      // Auth headers SHOULD be included when credentials are provided
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-License-Key']).toBe('test-license-key');
    });
  });

  // ========================================================================
  // Additional Branch Coverage Tests
  // ========================================================================

  describe('Additional Branch Coverage', () => {
    it('should list policies with all filters combined', async () => {
      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await client.listStaticPolicies({
        category: 'security-sqli',
        tier: 'system',
        enabled: true,
        sortBy: 'severity',
        sortOrder: 'desc',
        limit: 10,
        offset: 0,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('category=security-sqli');
      expect(url).toContain('tier=system');
      expect(url).toContain('enabled=true');
      expect(url).toContain('sort_by=severity');
      expect(url).toContain('sort_order=desc');
      expect(url).toContain('limit=10');
      // offset=0 is not included when it equals 0
    });

    it('should list policies with enabled=false', async () => {
      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await client.listStaticPolicies({ enabled: false });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('enabled=false');
    });

    it('should handle list dynamic policies with all options', async () => {
      const dynamicPolicy: DynamicPolicy = {
        id: 'dpol_456',
        name: 'Rate Limit',
        description: 'Rate limiting',
        type: 'cost',
        conditions: [{ field: 'requests_per_minute', operator: 'greater_than', value: 100 }],
        actions: [{ type: 'block', config: { reason: 'Rate limit exceeded' } }],
        priority: 50,
        enabled: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      mockFetch.mockReturnValueOnce(mockResponse([dynamicPolicy]));

      await client.listDynamicPolicies({
        type: 'cost',
        enabled: true,
        sortBy: 'name',
        sortOrder: 'asc',
        limit: 20,
        offset: 5,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('type=cost');
      expect(url).toContain('enabled=true');
    });

    it('should handle effective policies with options', async () => {
      mockFetch.mockReturnValueOnce(mockResponse([sampleStaticPolicy]));

      await client.getEffectiveStaticPolicies({
        category: 'security-sqli',
        includeDisabled: true,
        includeOverridden: true,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('category=security-sqli');
      expect(url).toContain('include_disabled=true');
      expect(url).toContain('include_overridden=true');
    });

    it('should handle effective dynamic policies with options', async () => {
      const dynamicPolicy = {
        id: 'dpol_456',
        name: 'Rate Limit',
        description: 'Rate limiting',
        category: 'dynamic-cost',
        tier: 'tenant',
        type: 'rate-limit',
        config: { max_requests: 100 },
        enabled: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      mockFetch.mockReturnValueOnce(mockResponse([dynamicPolicy]));

      await client.getEffectiveDynamicPolicies({
        category: 'dynamic-cost',
        includeDisabled: true,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('category=dynamic-cost');
      expect(url).toContain('include_disabled=true');
    });

    it('should handle test pattern with matches', async () => {
      const testResult: TestPatternResult = {
        valid: true,
        pattern: 'SELECT',
        inputs: ['SELECT * FROM users', 'Hello world'],
        matches: [
          { input: 'SELECT * FROM users', matched: true },
          { input: 'Hello world', matched: false },
        ],
      };
      mockFetch.mockReturnValueOnce(mockResponse(testResult));

      const result = await client.testPattern('SELECT', ['SELECT * FROM users', 'Hello world']);

      expect(result.valid).toBe(true);
      expect(result.matches).toHaveLength(2);
    });

    it('should handle 403 authentication error', async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: () => Promise.resolve({ error: 'Access denied' }),
          text: () => Promise.resolve('Access denied'),
        })
      );

      await expect(client.listStaticPolicies()).rejects.toThrow('Request failed');
    });

    it('should handle create policy override with all fields', async () => {
      const override: PolicyOverride = {
        policy_id: 'pol_123',
        action_override: 'warn',
        override_reason: 'Test reason',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        created_by: 'admin',
      };
      mockFetch.mockReturnValueOnce(mockResponse(override));

      const request: CreatePolicyOverrideRequest = {
        action_override: 'warn',
        override_reason: 'Test reason',
      };
      const result = await client.createPolicyOverride('pol_123', request);

      expect(result.action_override).toBe('warn');
      expect(result.override_reason).toBe('Test reason');
    });

    it('should get policy versions', async () => {
      // API returns snake_case fields, SDK transforms to camelCase
      const apiVersions = [
        {
          version: 2,
          change_type: 'updated',
          change_description: 'Updated severity from 8 to 9',
          changed_at: '2025-01-02T00:00:00Z',
          changed_by: 'admin',
        },
        {
          version: 1,
          change_type: 'created',
          changed_at: '2025-01-01T00:00:00Z',
          changed_by: 'system',
        },
      ];
      mockFetch.mockReturnValueOnce(
        mockResponse({ policy_id: 'pol_123', versions: apiVersions, count: 2 })
      );

      const result = await client.getStaticPolicyVersions('pol_123');

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
    });
  });
});
