// Copyright 2026 AxonFlow
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for HITL (Human-in-the-Loop) Queue API methods.
 */

import { AxonFlow } from '../src/client';
import { APIError, AuthenticationError, ConfigurationError } from '../src/errors';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('HITL Queue Methods', () => {
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

  // Helper to create mock responses
  const mockResponse = (data: unknown, status = 200) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // ==========================================================================
  // listHITLQueue Tests
  // ==========================================================================

  describe('listHITLQueue', () => {
    it('should list HITL queue items without options', async () => {
      const listResponse = {
        success: true,
        data: [
          {
            request_id: 'req_001',
            org_id: 'org-1',
            tenant_id: 'tenant-1',
            client_id: 'client-1',
            original_query: 'Delete all user data',
            request_type: 'llm_call',
            triggered_policy_id: 'pol_123',
            triggered_policy_name: 'PII Protection',
            trigger_reason: 'Query contains data deletion request',
            severity: 'high',
            status: 'pending',
            expires_at: '2026-02-13T12:00:00Z',
            created_at: '2026-02-12T12:00:00Z',
            updated_at: '2026-02-12T12:00:00Z',
          },
        ],
        meta: { total: 1, limit: 50, offset: 0 },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(listResponse));

      const result = await client.listHITLQueue();

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.has_more).toBe(false);
      expect(result.items[0].request_id).toBe('req_001');
      expect(result.items[0].triggered_policy_name).toBe('PII Protection');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/hitl/queue',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list HITL queue items with status filter', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: [],
          meta: { total: 0, limit: 50, offset: 0 },
        })
      );

      await client.listHITLQueue({ status: 'pending' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list HITL queue items with severity filter', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: [],
          meta: { total: 0, limit: 50, offset: 0 },
        })
      );

      await client.listHITLQueue({ severity: 'critical' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('severity=critical'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list HITL queue items with limit and offset', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: [],
          meta: { total: 0, limit: 10, offset: 20 },
        })
      );

      await client.listHITLQueue({ limit: 10, offset: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
    });

    it('should list HITL queue items with all options', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: [],
          meta: { total: 0, limit: 5, offset: 10 },
        })
      );

      await client.listHITLQueue({
        status: 'pending',
        severity: 'high',
        limit: 5,
        offset: 10,
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('status=pending');
      expect(url).toContain('severity=high');
      expect(url).toContain('limit=5');
      expect(url).toContain('offset=10');
    });

    it('should calculate has_more correctly when more items exist', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: [
            {
              request_id: 'req_001',
              org_id: 'org-1',
              tenant_id: 'tenant-1',
              client_id: 'client-1',
              original_query: 'test',
              request_type: 'llm_call',
              triggered_policy_id: 'pol_1',
              triggered_policy_name: 'Test',
              trigger_reason: 'test',
              severity: 'low',
              status: 'pending',
              expires_at: '2026-02-13T12:00:00Z',
              created_at: '2026-02-12T12:00:00Z',
              updated_at: '2026-02-12T12:00:00Z',
            },
          ],
          meta: { total: 25, limit: 1, offset: 0 },
        })
      );

      const result = await client.listHITLQueue({ limit: 1 });

      expect(result.has_more).toBe(true);
      expect(result.total).toBe(25);
    });

    it('should return empty list when no items exist', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          success: true,
          data: [],
          meta: { total: 0, limit: 50, offset: 0 },
        })
      );

      const result = await client.listHITLQueue();

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });
  });

  // ==========================================================================
  // createHITLRequest Tests
  // ==========================================================================

  describe('createHITLRequest', () => {
    it('should POST a full create-input and return the created record', async () => {
      const createResponse = {
        success: true,
        data: {
          request_id: 'hitl-req-new-001',
          org_id: 'org-1',
          tenant_id: 'tenant-1',
          client_id: 'loan-desk',
          user_id: 'cust-001',
          original_query: 'disburse $50000 to cust-001',
          request_type: 'adk-tool',
          request_context: { tool_name: 'disburse_payment' },
          triggered_policy_id: 'loan-amount-cap',
          triggered_policy_name: 'Loan amount cap',
          trigger_reason: 'Disbursement above $10k requires manager approval',
          severity: 'high',
          notify_url: 'https://workflows.example.com/hooks/loan-approve',
          status: 'pending',
          expires_at: '2026-05-23T11:00:00Z',
          created_at: '2026-05-23T10:00:00Z',
          updated_at: '2026-05-23T10:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(createResponse, 201));

      const result = await client.createHITLRequest({
        client_id: 'loan-desk',
        user_id: 'cust-001',
        original_query: 'disburse $50000 to cust-001',
        request_type: 'adk-tool',
        request_context: { tool_name: 'disburse_payment' },
        triggered_policy_id: 'loan-amount-cap',
        triggered_policy_name: 'Loan amount cap',
        trigger_reason: 'Disbursement above $10k requires manager approval',
        severity: 'high',
        notify_url: 'https://workflows.example.com/hooks/loan-approve',
      });

      expect(result.request_id).toBe('hitl-req-new-001');
      expect(result.status).toBe('pending');
      expect(result.notify_url).toBe('https://workflows.example.com/hooks/loan-approve');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/hitl/queue',
        expect.objectContaining({ method: 'POST' })
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.client_id).toBe('loan-desk');
      expect(body.original_query).toBe('disburse $50000 to cust-001');
      expect(body.request_type).toBe('adk-tool');
      expect(body.notify_url).toBe('https://workflows.example.com/hooks/loan-approve');
      expect(body.severity).toBe('high');
    });

    it('should accept the minimal required-field set (client_id + original_query + request_type)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            success: true,
            data: {
              request_id: 'hitl-req-minimal',
              org_id: 'org-1',
              tenant_id: 'tenant-1',
              client_id: 'c1',
              original_query: 'q',
              request_type: 'chat',
              triggered_policy_id: '',
              triggered_policy_name: '',
              trigger_reason: '',
              severity: 'high',
              status: 'pending',
              expires_at: '2026-05-23T11:00:00Z',
              created_at: '2026-05-23T10:00:00Z',
              updated_at: '2026-05-23T10:00:00Z',
            },
          },
          201
        )
      );

      const result = await client.createHITLRequest({
        client_id: 'c1',
        original_query: 'q',
        request_type: 'chat',
      });
      expect(result.request_id).toBe('hitl-req-minimal');
      expect(result.notify_url).toBeUndefined();
    });

    it('should surface a platform 400 on bad notify_url scheme as APIError(400)', async () => {
      // Mirrors `platform/agent/hitl/webhook.go:105 ValidateNotifyURL` —
      // the SDK is a pass-through here so a tightening of the scheme
      // allowlist on the platform doesn't require an SDK upgrade.
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            success: false,
            error:
              'notify_url scheme "javascript" is not allowed (use https:// or http://)',
          },
          400
        )
      );

      await expect(
        client.createHITLRequest({
          client_id: 'loan-desk',
          original_query: 'disburse $50000',
          request_type: 'adk-tool',
          notify_url: 'javascript:alert(1)',
        })
      ).rejects.toThrow(APIError);
    });

    it('should propagate 401 as AuthenticationError (orchestratorRequest 401/403 path)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: false, error: 'Invalid API key' }, 401)
      );

      await expect(
        client.createHITLRequest({
          client_id: 'loan-desk',
          original_query: 'disburse $50000',
          request_type: 'adk-tool',
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('should propagate connect/network failure as the underlying fetch TypeError', async () => {
      // orchestratorRequest does not wrap fetch's transport-layer rejection
      // (TypeError 'fetch failed' on Node 18+) — it surfaces unchanged so
      // callers can branch on `.cause`. Locking the contract here means a
      // future wrapping layer must update this test too.
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed: ECONNREFUSED'));

      await expect(
        client.createHITLRequest({
          client_id: 'loan-desk',
          original_query: 'disburse $50000',
          request_type: 'adk-tool',
        })
      ).rejects.toThrow(TypeError);
    });

    it('should throw ConfigurationError when client_id is missing', async () => {
      await expect(
        client.createHITLRequest({
          client_id: '',
          original_query: 'q',
          request_type: 'chat',
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError when original_query is missing', async () => {
      await expect(
        client.createHITLRequest({
          client_id: 'c1',
          original_query: '',
          request_type: 'chat',
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError when request_type is missing', async () => {
      await expect(
        client.createHITLRequest({
          client_id: 'c1',
          original_query: 'q',
          request_type: '',
        })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  // ==========================================================================
  // getHITLRequest Tests
  // ==========================================================================

  describe('getHITLRequest', () => {
    it('should get a specific HITL request', async () => {
      const requestResponse = {
        success: true,
        data: {
          request_id: 'req_001',
          org_id: 'org-1',
          tenant_id: 'tenant-1',
          client_id: 'client-1',
          user_id: 'user-123',
          original_query: 'Delete all user data',
          request_type: 'llm_call',
          triggered_policy_id: 'pol_123',
          triggered_policy_name: 'PII Protection',
          trigger_reason: 'Query contains data deletion request',
          severity: 'high',
          eu_ai_act_article: 'Article 14',
          compliance_framework: 'GDPR',
          risk_classification: 'high-risk',
          status: 'pending',
          expires_at: '2026-02-13T12:00:00Z',
          created_at: '2026-02-12T12:00:00Z',
          updated_at: '2026-02-12T12:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(requestResponse));

      const result = await client.getHITLRequest('req_001');

      expect(result.request_id).toBe('req_001');
      expect(result.original_query).toBe('Delete all user data');
      expect(result.triggered_policy_name).toBe('PII Protection');
      expect(result.severity).toBe('high');
      expect(result.eu_ai_act_article).toBe('Article 14');
      expect(result.compliance_framework).toBe('GDPR');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/hitl/queue/req_001',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw ConfigurationError when requestId is empty', async () => {
      await expect(client.getHITLRequest('')).rejects.toThrow(ConfigurationError);
      await expect(client.getHITLRequest('')).rejects.toThrow('Request ID is required');
    });

    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.getHITLRequest('req_nonexistent')).rejects.toThrow();
    });
  });

  // ==========================================================================
  // approveHITLRequest Tests
  // ==========================================================================

  describe('approveHITLRequest', () => {
    it('should approve an HITL request', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({ success: true }),
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        })
      );

      await client.approveHITLRequest('req_001', {
        reviewer_id: 'user_456',
        reviewer_email: 'reviewer@example.com',
        comment: 'Approved after review',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/hitl/queue/req_001/approve',
        expect.objectContaining({ method: 'POST' })
      );

      // Verify the body contains the review input
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reviewer_id).toBe('user_456');
      expect(body.reviewer_email).toBe('reviewer@example.com');
      expect(body.comment).toBe('Approved after review');
    });

    it('should approve with reviewer_role', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.approveHITLRequest('req_002', {
        reviewer_id: 'user_789',
        reviewer_email: 'admin@example.com',
        reviewer_role: 'compliance_officer',
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reviewer_role).toBe('compliance_officer');
    });

    it('should approve without optional fields', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.approveHITLRequest('req_003', {
        reviewer_id: 'user_111',
        reviewer_email: 'user@example.com',
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reviewer_id).toBe('user_111');
      expect(body.reviewer_email).toBe('user@example.com');
      expect(body.reviewer_role).toBeUndefined();
      expect(body.comment).toBeUndefined();
    });

    it('should throw ConfigurationError when requestId is empty', async () => {
      await expect(
        client.approveHITLRequest('', {
          reviewer_id: 'user_456',
          reviewer_email: 'reviewer@example.com',
        })
      ).rejects.toThrow(ConfigurationError);
      await expect(
        client.approveHITLRequest('', {
          reviewer_id: 'user_456',
          reviewer_email: 'reviewer@example.com',
        })
      ).rejects.toThrow('Request ID is required');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(
        client.approveHITLRequest('req_bad', {
          reviewer_id: 'user_456',
          reviewer_email: 'reviewer@example.com',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // rejectHITLRequest Tests
  // ==========================================================================

  describe('rejectHITLRequest', () => {
    it('should reject an HITL request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.rejectHITLRequest('req_001', {
        reviewer_id: 'user_456',
        reviewer_email: 'reviewer@example.com',
        comment: 'Rejected: contains PII data',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/hitl/queue/req_001/reject',
        expect.objectContaining({ method: 'POST' })
      );

      // Verify the body contains the review input
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reviewer_id).toBe('user_456');
      expect(body.reviewer_email).toBe('reviewer@example.com');
      expect(body.comment).toBe('Rejected: contains PII data');
    });

    it('should reject without comment', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.rejectHITLRequest('req_002', {
        reviewer_id: 'user_789',
        reviewer_email: 'admin@example.com',
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reviewer_id).toBe('user_789');
      expect(body.comment).toBeUndefined();
    });

    it('should throw ConfigurationError when requestId is empty', async () => {
      await expect(
        client.rejectHITLRequest('', {
          reviewer_id: 'user_456',
          reviewer_email: 'reviewer@example.com',
        })
      ).rejects.toThrow(ConfigurationError);
      await expect(
        client.rejectHITLRequest('', {
          reviewer_id: 'user_456',
          reviewer_email: 'reviewer@example.com',
        })
      ).rejects.toThrow('Request ID is required');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500));

      await expect(
        client.rejectHITLRequest('req_bad', {
          reviewer_id: 'user_456',
          reviewer_email: 'reviewer@example.com',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // getHITLStats Tests
  // ==========================================================================

  describe('getHITLStats', () => {
    it('should get HITL queue statistics', async () => {
      const statsResponse = {
        success: true,
        data: {
          total_pending: 15,
          high_priority: 5,
          critical_priority: 2,
          oldest_pending_hours: 48.5,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statsResponse));

      const result = await client.getHITLStats();

      expect(result.total_pending).toBe(15);
      expect(result.high_priority).toBe(5);
      expect(result.critical_priority).toBe(2);
      expect(result.oldest_pending_hours).toBe(48.5);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/hitl/stats',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle stats with no oldest_pending_hours', async () => {
      const statsResponse = {
        success: true,
        data: {
          total_pending: 0,
          high_priority: 0,
          critical_priority: 0,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statsResponse));

      const result = await client.getHITLStats();

      expect(result.total_pending).toBe(0);
      expect(result.high_priority).toBe(0);
      expect(result.critical_priority).toBe(0);
      expect(result.oldest_pending_hours).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Service unavailable' }, 503));

      await expect(client.getHITLStats()).rejects.toThrow();
    });

    it('should work in debug mode', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        debug: true,
      });

      const statsResponse = {
        success: true,
        data: {
          total_pending: 3,
          high_priority: 1,
          critical_priority: 0,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statsResponse));

      const result = await debugClient.getHITLStats();
      expect(result.total_pending).toBe(3);
    });
  });
});
