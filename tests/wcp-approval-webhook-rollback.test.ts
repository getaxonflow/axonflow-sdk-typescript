/**
 * Tests for WCP Approval, Plan Rollback, and Webhook CRUD methods.
 * Features 5 and 7.
 */

import { AxonFlow } from '../src/client';
import { ConfigurationError } from '../src/errors';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('WCP Approval, Rollback, and Webhook Methods', () => {
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
  // WCP Approval Tests (Feature 5)
  // ==========================================================================

  describe('approveStep', () => {
    it('should approve a workflow step', async () => {
      const approveResponse = {
        workflow_id: 'wf_123',
        step_id: 'step_456',
        status: 'approved',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(approveResponse));

      const result = await client.approveStep('wf_123', 'step_456');

      expect(result.workflow_id).toBe('wf_123');
      expect(result.step_id).toBe('step_456');
      expect(result.status).toBe('approved');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflow-control/wf_123/steps/step_456/approve',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.approveStep('', 'step_456')).rejects.toThrow(ConfigurationError);
      await expect(client.approveStep('', 'step_456')).rejects.toThrow('Workflow ID is required');
    });

    it('should throw ConfigurationError when stepId is empty', async () => {
      await expect(client.approveStep('wf_123', '')).rejects.toThrow(ConfigurationError);
      await expect(client.approveStep('wf_123', '')).rejects.toThrow('Step ID is required');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.approveStep('wf_123', 'step_999')).rejects.toThrow();
    });
  });

  describe('rejectStep', () => {
    it('should reject a workflow step without reason', async () => {
      const rejectResponse = {
        workflow_id: 'wf_123',
        step_id: 'step_456',
        status: 'rejected',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(rejectResponse));

      const result = await client.rejectStep('wf_123', 'step_456');

      expect(result.workflow_id).toBe('wf_123');
      expect(result.step_id).toBe('step_456');
      expect(result.status).toBe('rejected');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflow-control/wf_123/steps/step_456/reject',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should reject a workflow step with reason', async () => {
      const rejectResponse = {
        workflow_id: 'wf_123',
        step_id: 'step_456',
        status: 'rejected',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(rejectResponse));

      const result = await client.rejectStep('wf_123', 'step_456', 'Policy violation');

      expect(result.status).toBe('rejected');

      // Verify the body contains the reason
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reason).toBe('Policy violation');
    });

    it('should not include reason in body when not provided', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          workflow_id: 'wf_123',
          step_id: 'step_456',
          status: 'rejected',
        })
      );

      await client.rejectStep('wf_123', 'step_456');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reason).toBeUndefined();
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.rejectStep('', 'step_456')).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError when stepId is empty', async () => {
      await expect(client.rejectStep('wf_123', '')).rejects.toThrow(ConfigurationError);
    });
  });

  describe('getPendingApprovals', () => {
    it('should list pending approvals without options', async () => {
      const pendingResponse = {
        approvals: [
          {
            workflow_id: 'wf_123',
            workflow_name: 'customer-support',
            step_id: 'step_456',
            step_name: 'Send Email',
            step_type: 'tool_call',
            created_at: '2026-02-07T12:00:00Z',
          },
        ],
        total: 1,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(pendingResponse));

      const result = await client.getPendingApprovals();

      expect(result.total).toBe(1);
      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0].workflow_id).toBe('wf_123');
      expect(result.approvals[0].step_name).toBe('Send Email');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflow-control/pending-approvals',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list pending approvals with limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ approvals: [], total: 0 }));

      await client.getPendingApprovals({ limit: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflow-control/pending-approvals?limit=5',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return empty list when no pending approvals', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ approvals: [], total: 0 }));

      const result = await client.getPendingApprovals();

      expect(result.total).toBe(0);
      expect(result.approvals).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Plan Rollback Tests (Feature 7)
  // ==========================================================================

  describe('rollbackPlan', () => {
    it('should rollback a plan to a target version', async () => {
      const rollbackResponse = {
        plan_id: 'plan_123',
        version: 2,
        previous_version: 5,
        status: 'rolled_back',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(rollbackResponse));

      const result = await client.rollbackPlan('plan_123', 2);

      expect(result.plan_id).toBe('plan_123');
      expect(result.version).toBe(2);
      expect(result.previous_version).toBe(5);
      expect(result.status).toBe('rolled_back');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plan/plan_123/rollback/2',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should use plan_id fallback from parameter when not in response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          version: 1,
          previous_version: 3,
          status: 'rolled_back',
        })
      );

      const result = await client.rollbackPlan('plan_abc', 1);

      expect(result.plan_id).toBe('plan_abc');
    });

    it('should throw PlanExecutionError on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Version not found' }, 400));

      await expect(client.rollbackPlan('plan_123', 99)).rejects.toThrow('Plan rollback failed');
    });
  });

  // ==========================================================================
  // Webhook CRUD Tests (Feature 7)
  // ==========================================================================

  describe('createWebhook', () => {
    it('should create a webhook subscription', async () => {
      const webhookResponse = {
        id: 'wh_123',
        url: 'https://example.com/webhook',
        events: ['workflow.completed', 'step.approval_required'],
        active: true,
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(webhookResponse));

      const result = await client.createWebhook({
        url: 'https://example.com/webhook',
        events: ['workflow.completed', 'step.approval_required'],
        active: true,
      });

      expect(result.id).toBe('wh_123');
      expect(result.url).toBe('https://example.com/webhook');
      expect(result.events).toEqual(['workflow.completed', 'step.approval_required']);
      expect(result.active).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/webhooks',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should create a webhook with secret', async () => {
      const webhookResponse = {
        id: 'wh_456',
        url: 'https://example.com/hook',
        events: ['workflow.completed'],
        active: true,
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(webhookResponse));

      await client.createWebhook({
        url: 'https://example.com/hook',
        events: ['workflow.completed'],
        secret: 'my-secret-key',
        active: true,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.secret).toBe('my-secret-key');
    });
  });

  describe('getWebhook', () => {
    it('should get a webhook by ID', async () => {
      const webhookResponse = {
        id: 'wh_123',
        url: 'https://example.com/webhook',
        events: ['workflow.completed'],
        active: true,
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(webhookResponse));

      const result = await client.getWebhook('wh_123');

      expect(result.id).toBe('wh_123');
      expect(result.url).toBe('https://example.com/webhook');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/webhooks/wh_123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw ConfigurationError when webhookId is empty', async () => {
      await expect(client.getWebhook('')).rejects.toThrow(ConfigurationError);
      await expect(client.getWebhook('')).rejects.toThrow('Webhook ID is required');
    });

    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.getWebhook('wh_nonexistent')).rejects.toThrow();
    });
  });

  describe('updateWebhook', () => {
    it('should update a webhook', async () => {
      const webhookResponse = {
        id: 'wh_123',
        url: 'https://example.com/webhook-updated',
        events: ['workflow.completed'],
        active: false,
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T13:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(webhookResponse));

      const result = await client.updateWebhook('wh_123', {
        url: 'https://example.com/webhook-updated',
        active: false,
      });

      expect(result.id).toBe('wh_123');
      expect(result.url).toBe('https://example.com/webhook-updated');
      expect(result.active).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/webhooks/wh_123',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should update webhook events only', async () => {
      const webhookResponse = {
        id: 'wh_123',
        url: 'https://example.com/webhook',
        events: ['step.completed'],
        active: true,
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T13:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(webhookResponse));

      const result = await client.updateWebhook('wh_123', {
        events: ['step.completed'],
      });

      expect(result.events).toEqual(['step.completed']);
    });

    it('should throw ConfigurationError when webhookId is empty', async () => {
      await expect(client.updateWebhook('', { active: false })).rejects.toThrow(ConfigurationError);
      await expect(client.updateWebhook('', { active: false })).rejects.toThrow(
        'Webhook ID is required'
      );
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.deleteWebhook('wh_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/webhooks/wh_123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should throw ConfigurationError when webhookId is empty', async () => {
      await expect(client.deleteWebhook('')).rejects.toThrow(ConfigurationError);
      await expect(client.deleteWebhook('')).rejects.toThrow('Webhook ID is required');
    });

    it('should handle 404 errors on delete', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.deleteWebhook('wh_nonexistent')).rejects.toThrow();
    });
  });

  describe('listWebhooks', () => {
    it('should list all webhooks', async () => {
      const listResponse = {
        webhooks: [
          {
            id: 'wh_123',
            url: 'https://example.com/webhook',
            events: ['workflow.completed'],
            active: true,
            created_at: '2026-02-07T12:00:00Z',
            updated_at: '2026-02-07T12:00:00Z',
          },
          {
            id: 'wh_456',
            url: 'https://example.com/hook2',
            events: ['step.approval_required'],
            active: false,
            created_at: '2026-02-06T12:00:00Z',
            updated_at: '2026-02-07T10:00:00Z',
          },
        ],
        total: 2,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(listResponse));

      const result = await client.listWebhooks();

      expect(result.total).toBe(2);
      expect(result.webhooks).toHaveLength(2);
      expect(result.webhooks[0].id).toBe('wh_123');
      expect(result.webhooks[1].id).toBe('wh_456');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/webhooks',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return empty list when no webhooks exist', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ webhooks: [], total: 0 }));

      const result = await client.listWebhooks();

      expect(result.total).toBe(0);
      expect(result.webhooks).toHaveLength(0);
    });
  });
});
