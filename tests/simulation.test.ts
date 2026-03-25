/**
 * Tests for policy simulation methods (Evaluation Tier+)
 * Part of the Evaluation Tier Feature Unlock
 */

import { AxonFlow } from '../src/client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Policy Simulation', () => {
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
  // simulatePolicies
  // ==========================================================================

  describe('simulatePolicies', () => {
    it('should send correct request and return typed response', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          allowed: false,
          applied_policies: ['sys_pii_ssn', 'block-sensitive-queries'],
          risk_score: 0.92,
          required_actions: ['block', 'log'],
          processing_time_ms: 12,
          total_policies: 15,
          dry_run: true,
          simulated_at: '2026-03-24T10:00:00Z',
          tier: 'evaluation',
          daily_usage: { used: 5, limit: 100 },
        })
      );

      const result = await client.simulatePolicies({
        query: 'Show me all customer SSNs',
        request_type: 'chat',
        user: { role: 'analyst', department: 'support' },
      });

      expect(result.allowed).toBe(false);
      expect(result.applied_policies).toEqual(['sys_pii_ssn', 'block-sensitive-queries']);
      expect(result.risk_score).toBe(0.92);
      expect(result.required_actions).toEqual(['block', 'log']);
      expect(result.processing_time_ms).toBe(12);
      expect(result.total_policies).toBe(15);
      expect(result.dry_run).toBe(true);
      expect(result.simulated_at).toBe('2026-03-24T10:00:00Z');
      expect(result.tier).toBe('evaluation');
      expect(result.daily_usage).toEqual({ used: 5, limit: 100 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/policies/simulate',
        expect.objectContaining({ method: 'POST' })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toBe('Show me all customer SSNs');
      expect(callBody.request_type).toBe('chat');
      expect(callBody.user).toEqual({ role: 'analyst', department: 'support' });
    });

    it('should only include provided optional fields in the request body', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          allowed: true,
          applied_policies: [],
          risk_score: 0.1,
          required_actions: [],
          processing_time_ms: 3,
          total_policies: 15,
          dry_run: true,
          simulated_at: '2026-03-24T10:00:00Z',
          tier: 'evaluation',
        })
      );

      await client.simulatePolicies({ query: 'What is the weather today?' });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toBe('What is the weather today?');
      expect(callBody.request_type).toBeUndefined();
      expect(callBody.user).toBeUndefined();
      expect(callBody.client).toBeUndefined();
      expect(callBody.context).toBeUndefined();
    });

    it('should include all optional fields when provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          allowed: true,
          applied_policies: [],
          risk_score: 0.0,
          required_actions: [],
          processing_time_ms: 5,
          total_policies: 15,
          dry_run: true,
          simulated_at: '2026-03-24T10:00:00Z',
          tier: 'evaluation',
        })
      );

      await client.simulatePolicies({
        query: 'test query',
        request_type: 'completion',
        user: { id: 'user-1' },
        client: { app: 'dashboard' },
        context: { session: 'abc123' },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toBe('test query');
      expect(callBody.request_type).toBe('completion');
      expect(callBody.user).toEqual({ id: 'user-1' });
      expect(callBody.client).toEqual({ app: 'dashboard' });
      expect(callBody.context).toEqual({ session: 'abc123' });
    });

    it('should handle 403 forbidden (community tier)', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'forbidden' }, 403));

      await expect(client.simulatePolicies({ query: 'test' })).rejects.toThrow();
    });

    it('should handle 429 rate limit', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'rate limit exceeded' }, 429));

      await expect(client.simulatePolicies({ query: 'test' })).rejects.toThrow();
    });

    it('should handle response without daily_usage', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          allowed: true,
          applied_policies: [],
          risk_score: 0.0,
          required_actions: [],
          processing_time_ms: 2,
          total_policies: 10,
          dry_run: true,
          simulated_at: '2026-03-24T10:00:00Z',
          tier: 'enterprise',
        })
      );

      const result = await client.simulatePolicies({ query: 'test' });

      expect(result.daily_usage).toBeUndefined();
      expect(result.tier).toBe('enterprise');
    });
  });

  // ==========================================================================
  // getPolicyImpactReport
  // ==========================================================================

  describe('getPolicyImpactReport', () => {
    it('should send correct body with policy_id and inputs', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          policy_id: 'policy-123',
          policy_name: 'block-pii-queries',
          total_inputs: 3,
          matched: 2,
          blocked: 1,
          match_rate: 0.667,
          block_rate: 0.333,
          results: [
            { input_index: 0, matched: true, blocked: true, actions: ['block', 'log'] },
            { input_index: 1, matched: false, blocked: false },
            { input_index: 2, matched: true, blocked: false, actions: ['warn'] },
          ],
          processing_time_ms: 25,
          generated_at: '2026-03-24T10:05:00Z',
          tier: 'evaluation',
        })
      );

      const inputs = [
        { query: 'Show me all customer SSNs', request_type: 'chat' },
        { query: 'What is the weather today?', request_type: 'chat' },
        { query: 'List user emails', request_type: 'chat', context: { source: 'admin' } },
      ];

      const result = await client.getPolicyImpactReport('policy-123', inputs);

      expect(result.policy_id).toBe('policy-123');
      expect(result.policy_name).toBe('block-pii-queries');
      expect(result.total_inputs).toBe(3);
      expect(result.matched).toBe(2);
      expect(result.blocked).toBe(1);
      expect(result.match_rate).toBe(0.667);
      expect(result.block_rate).toBe(0.333);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].matched).toBe(true);
      expect(result.results[0].blocked).toBe(true);
      expect(result.results[0].actions).toEqual(['block', 'log']);
      expect(result.results[1].matched).toBe(false);
      expect(result.results[1].actions).toBeUndefined();
      expect(result.results[2].matched).toBe(true);
      expect(result.results[2].blocked).toBe(false);
      expect(result.processing_time_ms).toBe(25);
      expect(result.generated_at).toBe('2026-03-24T10:05:00Z');
      expect(result.tier).toBe('evaluation');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/policies/impact-report',
        expect.objectContaining({ method: 'POST' })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.policy_id).toBe('policy-123');
      expect(callBody.inputs).toHaveLength(3);
      expect(callBody.inputs[0].query).toBe('Show me all customer SSNs');
      expect(callBody.inputs[2].context).toEqual({ source: 'admin' });
    });

    it('should handle empty inputs array', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          policy_id: 'policy-456',
          total_inputs: 0,
          matched: 0,
          blocked: 0,
          match_rate: 0,
          block_rate: 0,
          results: [],
          processing_time_ms: 1,
          generated_at: '2026-03-24T10:06:00Z',
          tier: 'evaluation',
        })
      );

      const result = await client.getPolicyImpactReport('policy-456', []);

      expect(result.total_inputs).toBe(0);
      expect(result.results).toHaveLength(0);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.policy_id).toBe('policy-456');
      expect(callBody.inputs).toEqual([]);
    });

    it('should handle 403 forbidden', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'forbidden' }, 403));

      await expect(
        client.getPolicyImpactReport('policy-123', [{ query: 'test' }])
      ).rejects.toThrow();
    });

    it('should handle 500 server error', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'internal error' }, 500));

      await expect(
        client.getPolicyImpactReport('policy-123', [{ query: 'test' }])
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // detectPolicyConflicts
  // ==========================================================================

  describe('detectPolicyConflicts', () => {
    it('should detect conflicts across all policies when no policyId provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          conflicts: [
            {
              policy_a: { id: 'pol-1', name: 'allow-all-queries', type: 'static' },
              policy_b: { id: 'pol-2', name: 'block-pii-queries', type: 'dynamic' },
              conflict_type: 'contradiction',
              description: 'Policy A allows all queries but Policy B blocks PII queries',
              severity: 'high',
              overlapping_field: 'query',
            },
          ],
          total_policies: 15,
          conflict_count: 1,
          checked_at: '2026-03-24T10:10:00Z',
          tier: 'evaluation',
        })
      );

      const result = await client.detectPolicyConflicts();

      expect(result.conflicts).toHaveLength(1);
      expect(result.total_policies).toBe(15);
      expect(result.conflict_count).toBe(1);
      expect(result.checked_at).toBe('2026-03-24T10:10:00Z');
      expect(result.tier).toBe('evaluation');

      const conflict = result.conflicts[0];
      expect(conflict.policy_a.id).toBe('pol-1');
      expect(conflict.policy_a.name).toBe('allow-all-queries');
      expect(conflict.policy_a.type).toBe('static');
      expect(conflict.policy_b.id).toBe('pol-2');
      expect(conflict.policy_b.name).toBe('block-pii-queries');
      expect(conflict.policy_b.type).toBe('dynamic');
      expect(conflict.conflict_type).toBe('contradiction');
      expect(conflict.severity).toBe('high');
      expect(conflict.overlapping_field).toBe('query');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/policies/conflicts',
        expect.objectContaining({ method: 'POST' })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.policy_id).toBeUndefined();
    });

    it('should pass policy_id when policyId is provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          conflicts: [],
          total_policies: 15,
          conflict_count: 0,
          checked_at: '2026-03-24T10:11:00Z',
          tier: 'evaluation',
        })
      );

      const result = await client.detectPolicyConflicts('policy-789');

      expect(result.conflicts).toHaveLength(0);
      expect(result.conflict_count).toBe(0);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.policy_id).toBe('policy-789');
    });

    it('should handle multiple conflicts', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          conflicts: [
            {
              policy_a: { id: 'pol-1', name: 'policy-a', type: 'static' },
              policy_b: { id: 'pol-2', name: 'policy-b', type: 'static' },
              conflict_type: 'overlap',
              description: 'Overlapping scope',
              severity: 'medium',
              overlapping_field: 'user.role',
            },
            {
              policy_a: { id: 'pol-3', name: 'policy-c', type: 'dynamic' },
              policy_b: { id: 'pol-4', name: 'policy-d', type: 'dynamic' },
              conflict_type: 'contradiction',
              description: 'Contradictory actions',
              severity: 'critical',
              overlapping_field: 'request_type',
            },
          ],
          total_policies: 20,
          conflict_count: 2,
          checked_at: '2026-03-24T10:12:00Z',
          tier: 'enterprise',
        })
      );

      const result = await client.detectPolicyConflicts();

      expect(result.conflicts).toHaveLength(2);
      expect(result.conflict_count).toBe(2);
      expect(result.conflicts[1].severity).toBe('critical');
    });

    it('should handle 403 forbidden', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'forbidden' }, 403));

      await expect(client.detectPolicyConflicts()).rejects.toThrow();
    });

    it('should handle 401 unauthorized', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));

      await expect(client.detectPolicyConflicts()).rejects.toThrow();
    });
  });
});
