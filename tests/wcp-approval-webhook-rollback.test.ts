/**
 * Tests for WCP Approval, Plan Rollback, Webhook CRUD, Workflow Control Plane,
 * Portal Request Text, Assessment branches, and Unified Execution methods.
 * Features 5 and 7 plus branch coverage additions.
 */

import { AxonFlow } from '../src/client';
import { ConfigurationError, AuthenticationError, APIError } from '../src/errors';

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
        'http://localhost:8080/api/v1/workflows/wf_123/steps/step_456/approve',
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
        'http://localhost:8080/api/v1/workflows/wf_123/steps/step_456/reject',
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
        pending_approvals: [
          {
            workflow_id: 'wf_123',
            workflow_name: 'customer-support',
            step_id: 'step_456',
            step_index: 1,
            step_name: 'Send Email',
            step_type: 'tool_call',
            decision: 'require_approval',
            created_at: '2026-02-07T12:00:00Z',
          },
        ],
        count: 1,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(pendingResponse));

      const result = await client.getPendingApprovals();

      expect(result.count).toBe(1);
      expect(result.pending_approvals).toHaveLength(1);
      expect(result.pending_approvals[0].workflow_id).toBe('wf_123');
      expect(result.pending_approvals[0].step_name).toBe('Send Email');
      // WCP entries must not carry plan_id
      expect(result.pending_approvals[0].plan_id).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/approvals/pending',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list pending approvals with limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ pending_approvals: [], count: 0 }));

      await client.getPendingApprovals({ limit: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/approvals/pending?limit=5',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return empty list when no pending approvals', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ pending_approvals: [], count: 0 }));

      const result = await client.getPendingApprovals();

      expect(result.count).toBe(0);
      expect(result.pending_approvals).toHaveLength(0);
    });
  });

  describe('getPendingPlanApprovals', () => {
    it('should list MAP-plane pending approvals and populate plan_id', async () => {
      const pendingResponse = {
        pending_approvals: [
          {
            workflow_id: 'wf_map_abc',
            workflow_name: 'map-confirm-plan-abc',
            plan_id: 'plan-abc',
            step_id: 'step_0_analyze',
            step_index: 0,
            step_name: 'Analyze transaction',
            step_type: 'tool_call',
            decision: 'require_approval',
            created_at: '2026-04-22T10:00:00Z',
          },
        ],
        count: 1,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(pendingResponse));

      const result = await client.getPendingPlanApprovals();

      expect(result.count).toBe(1);
      expect(result.pending_approvals).toHaveLength(1);
      expect(result.pending_approvals[0].plan_id).toBe('plan-abc');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plans/approvals/pending',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should propagate plan_id filter to the query string', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ pending_approvals: [], count: 0 }));

      await client.getPendingPlanApprovals({ plan_id: 'plan-abc' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plans/approvals/pending?plan_id=plan-abc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should propagate both limit and plan_id', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ pending_approvals: [], count: 0 }));

      await client.getPendingPlanApprovals({ limit: 3, plan_id: 'plan-x' });

      // URLSearchParams encodes in insertion order — limit first, then plan_id
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plans/approvals/pending?limit=3&plan_id=plan-x',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return empty list when no MAP-plane approvals exist', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ pending_approvals: [], count: 0 }));

      const result = await client.getPendingPlanApprovals();

      expect(result.count).toBe(0);
      expect(result.pending_approvals).toHaveLength(0);
    });

    it('should surface server errors (e.g. 403 tier gate)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error:
              'Listing plan-scoped pending approvals requires Evaluation or Enterprise license',
          },
          403
        )
      );

      await expect(client.getPendingPlanApprovals()).rejects.toThrow();
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

      expect(result.planId).toBe('plan_123');
      expect(result.version).toBe(2);
      expect(result.previousVersion).toBe(5);
      expect(result.status).toBe('rolled_back');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plan/plan_123/rollback/2',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should use planId fallback from parameter when not in response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          version: 1,
          previous_version: 3,
          status: 'rolled_back',
        })
      );

      const result = await client.rollbackPlan('plan_abc', 1);

      expect(result.planId).toBe('plan_abc');
    });

    it('should throw PlanExecutionError on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Version not found' }, 400));

      await expect(client.rollbackPlan('plan_123', 99)).rejects.toThrow('Plan rollback failed');
    });
  });

  // ==========================================================================
  // Plan Resume Tests (step/confirm-mode HITL + terminal paths)
  // ==========================================================================

  describe('resumePlan', () => {
    it('should surface step-mode HITL fields when the platform gates the next step', async () => {
      // Wire shape from the orchestrator's confirm/step-mode resume path:
      // the approved step ran, the next step is gated for approval.
      const resumeResponse = {
        plan_id: 'plan_123',
        workflow_id: 'wf_456',
        status: 'awaiting_approval',
        step_result: { output: 'step 1 done', records: 3 },
        next_step: 2,
        next_step_name: 'send_notification',
        total_steps: 4,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(resumeResponse));

      const result = await client.resumePlan('plan_123', true);

      expect(result.planId).toBe('plan_123');
      expect(result.workflowId).toBe('wf_456');
      expect(result.status).toBe('awaiting_approval');
      expect(result.stepResult).toEqual({ output: 'step 1 done', records: 3 });
      expect(result.nextStep).toBe(2);
      expect(result.nextStepName).toBe('send_notification');
      expect(result.totalSteps).toBe(4);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plan/plan_123/resume',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ approved: true }),
        })
      );
    });

    it('should map the terminal completed path (message, no step-gating fields)', async () => {
      const resumeResponse = {
        plan_id: 'plan_123',
        workflow_id: 'wf_456',
        status: 'completed',
        step_result: { output: 'final step done' },
        message: 'All steps completed',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(resumeResponse));

      const result = await client.resumePlan('plan_123');

      expect(result.planId).toBe('plan_123');
      expect(result.workflowId).toBe('wf_456');
      expect(result.status).toBe('completed');
      expect(result.message).toBe('All steps completed');
      expect(result.stepResult).toEqual({ output: 'final step done' });
      // No next step is gated on a terminal resume.
      expect(result.nextStep).toBeUndefined();
      expect(result.nextStepName).toBeUndefined();
      expect(result.totalSteps).toBeUndefined();
      // approved defaults to true on the request wire.
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plan/plan_123/resume',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ approved: true }),
        })
      );
    });

    it('should map the rejected path and send approved: false', async () => {
      const resumeResponse = {
        plan_id: 'plan_123',
        workflow_id: 'wf_456',
        status: 'rejected',
        message: 'Step rejected, plan aborted',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(resumeResponse));

      const result = await client.resumePlan('plan_123', false);

      expect(result.status).toBe('rejected');
      expect(result.message).toBe('Step rejected, plan aborted');
      expect(result.workflowId).toBe('wf_456');
      expect(result.stepResult).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/plan/plan_123/resume',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ approved: false }),
        })
      );
    });

    it('should throw PlanExecutionError on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Plan is not executing' }, 400));

      await expect(client.resumePlan('plan_123')).rejects.toThrow('Plan resume failed');
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

  // ==========================================================================
  // Rollback Plan - debug branch (line 4358)
  // ==========================================================================

  describe('rollbackPlan - debug mode', () => {
    it('should log debug info when debug is enabled', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        debug: true,
      });

      const rollbackResponse = {
        plan_id: 'plan_debug',
        version: 1,
        previous_version: 3,
        status: 'rolled_back',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(rollbackResponse));

      const result = await debugClient.rollbackPlan('plan_debug', 1);

      expect(result.planId).toBe('plan_debug');
      expect(result.version).toBe(1);
    });
  });

  // ==========================================================================
  // Portal Request Text (lines 3955, 3972, 3978-3982)
  // ==========================================================================

  describe('portalRequestText - via exportCodeGovernanceDataCSV', () => {
    it('should throw AuthenticationError when not logged in', async () => {
      await expect(client.exportCodeGovernanceDataCSV()).rejects.toThrow(AuthenticationError);
      await expect(client.exportCodeGovernanceDataCSV()).rejects.toThrow(
        'Not logged in to Customer Portal'
      );
    });

    it('should export CSV after login', async () => {
      // Simulate login by calling loginToPortal
      const loginResponse = {
        session_id: 'sess-123',
        org_id: 'org-1',
        email: 'test@example.com',
        name: 'Test User',
        expires_at: '2026-12-31T23:59:59Z',
      };
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve(loginResponse),
          text: () => Promise.resolve(JSON.stringify(loginResponse)),
        })
      );

      await client.loginToPortal('org-1', 'password');

      // Now export CSV
      const csvData = 'id,title,status\n1,PR-1,merged';
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(csvData),
          text: () => Promise.resolve(csvData),
        })
      );

      const result = await client.exportCodeGovernanceDataCSV();
      expect(result).toBe(csvData);
    });

    it('should throw AuthenticationError on 401 response', async () => {
      // Login first
      const loginResponse = {
        session_id: 'sess-expired',
        org_id: 'org-1',
        email: 'test@example.com',
        name: 'Test User',
        expires_at: '2026-12-31T23:59:59Z',
      };
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve(loginResponse),
          text: () => Promise.resolve(JSON.stringify(loginResponse)),
        })
      );

      await client.loginToPortal('org-1', 'password');

      // Now attempt export with 401 response
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'Session expired' }),
          text: () => Promise.resolve('Session expired'),
        })
      );

      await expect(client.exportCodeGovernanceDataCSV()).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError on 403 response', async () => {
      // Login first
      const loginResponse = {
        session_id: 'sess-403',
        org_id: 'org-1',
        email: 'test@example.com',
        name: 'Test User',
        expires_at: '2026-12-31T23:59:59Z',
      };
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve(loginResponse),
          text: () => Promise.resolve(JSON.stringify(loginResponse)),
        })
      );

      await client.loginToPortal('org-1', 'password');

      // Now attempt export with 403 response
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: () => Promise.resolve({ error: 'Forbidden' }),
          text: () => Promise.resolve('Access denied'),
        })
      );

      await expect(client.exportCodeGovernanceDataCSV()).rejects.toThrow(AuthenticationError);
    });

    it('should throw APIError on non-auth error response', async () => {
      // Login first
      const loginResponse = {
        session_id: 'sess-500',
        org_id: 'org-1',
        email: 'test@example.com',
        name: 'Test User',
        expires_at: '2026-12-31T23:59:59Z',
      };
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve(loginResponse),
          text: () => Promise.resolve(JSON.stringify(loginResponse)),
        })
      );

      await client.loginToPortal('org-1', 'password');

      // Now attempt export with 500 response
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({ error: 'Server error' }),
          text: () => Promise.resolve('Internal server error'),
        })
      );

      await expect(client.exportCodeGovernanceDataCSV()).rejects.toThrow(APIError);
    });

    it('should log debug info when debug is enabled', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        debug: true,
      });

      // Login first
      const loginResponse = {
        session_id: 'sess-debug',
        org_id: 'org-1',
        email: 'test@example.com',
        name: 'Test User',
        expires_at: '2026-12-31T23:59:59Z',
      };
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve(loginResponse),
          text: () => Promise.resolve(JSON.stringify(loginResponse)),
        })
      );

      await debugClient.loginToPortal('org-1', 'password');

      // Now export CSV
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve('csv-data'),
          text: () => Promise.resolve('csv-data'),
        })
      );

      const result = await debugClient.exportCodeGovernanceDataCSV();
      expect(result).toBe('csv-data');
    });
  });

  // ==========================================================================
  // Workflow Control Plane Methods (lines 4010-4205)
  // ==========================================================================

  describe('createWorkflow', () => {
    it('should create a workflow', async () => {
      const workflowResponse = {
        workflow_id: 'wf_new',
        status: 'created',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(workflowResponse));

      const result = await client.createWorkflow({
        workflow_name: 'test-workflow',
        source: 'langgraph',
      });

      expect(result.workflow_id).toBe('wf_new');
      expect(result.status).toBe('created');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should create workflow with metadata', async () => {
      const workflowResponse = {
        workflow_id: 'wf_meta',
        status: 'created',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(workflowResponse));

      const result = await client.createWorkflow({
        workflow_name: 'meta-workflow',
        source: 'crewai',
        metadata: { customer_id: 'cust-123' },
      });

      expect(result.workflow_id).toBe('wf_meta');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.metadata).toEqual({ customer_id: 'cust-123' });
    });

    it('should handle API errors on createWorkflow', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Bad request' }, 400));

      await expect(
        client.createWorkflow({
          workflow_name: 'bad',
          source: 'external',
        })
      ).rejects.toThrow();
    });
  });

  describe('getWorkflow', () => {
    it('should get workflow status', async () => {
      const statusResponse = {
        workflow_id: 'wf_123',
        status: 'in_progress',
        current_step_index: 2,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statusResponse));

      const result = await client.getWorkflow('wf_123');

      expect(result.workflow_id).toBe('wf_123');
      expect(result.status).toBe('in_progress');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/wf_123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.getWorkflow('')).rejects.toThrow(ConfigurationError);
      await expect(client.getWorkflow('')).rejects.toThrow('Workflow ID is required');
    });
  });

  describe('stepGate', () => {
    it('should check a step gate', async () => {
      const gateResponse = {
        decision: 'allow',
        workflow_id: 'wf_123',
        step_id: 'step-1',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(gateResponse));

      const result = await client.stepGate('wf_123', 'step-1', {
        step_name: 'Generate Code',
        step_type: 'llm_call',
        model: 'gpt-4',
        provider: 'openai',
      });

      expect(result.decision).toBe('allow');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/wf_123/steps/step-1/gate',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return block decision', async () => {
      const gateResponse = {
        decision: 'block',
        reason: 'Policy violation',
        workflow_id: 'wf_123',
        step_id: 'step-1',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(gateResponse));

      const result = await client.stepGate('wf_123', 'step-1', {
        step_name: 'Risky Action',
        step_type: 'tool_call',
      });

      expect(result.decision).toBe('block');
      expect(result.reason).toBe('Policy violation');
    });

    it('should return require_approval decision', async () => {
      const gateResponse = {
        decision: 'require_approval',
        approval_url: 'http://localhost:8080/approve/123',
        workflow_id: 'wf_123',
        step_id: 'step-1',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(gateResponse));

      const result = await client.stepGate('wf_123', 'step-1', {
        step_name: 'Send Email',
        step_type: 'tool_call',
      });

      expect(result.decision).toBe('require_approval');
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(
        client.stepGate('', 'step-1', { step_name: 'Test', step_type: 'llm_call' })
      ).rejects.toThrow(ConfigurationError);
      await expect(
        client.stepGate('', 'step-1', { step_name: 'Test', step_type: 'llm_call' })
      ).rejects.toThrow('Workflow ID is required');
    });

    it('should throw ConfigurationError when stepId is empty', async () => {
      await expect(
        client.stepGate('wf_123', '', { step_name: 'Test', step_type: 'llm_call' })
      ).rejects.toThrow(ConfigurationError);
      await expect(
        client.stepGate('wf_123', '', { step_name: 'Test', step_type: 'llm_call' })
      ).rejects.toThrow('Step ID is required');
    });
  });

  describe('completeWorkflow', () => {
    it('should complete a workflow', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.completeWorkflow('wf_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/wf_123/complete',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.completeWorkflow('')).rejects.toThrow(ConfigurationError);
      await expect(client.completeWorkflow('')).rejects.toThrow('Workflow ID is required');
    });
  });

  describe('abortWorkflow', () => {
    it('should abort a workflow without reason', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.abortWorkflow('wf_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/wf_123/abort',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should abort a workflow with reason', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.abortWorkflow('wf_123', 'User cancelled');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reason).toBe('User cancelled');
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.abortWorkflow('')).rejects.toThrow(ConfigurationError);
      await expect(client.abortWorkflow('')).rejects.toThrow('Workflow ID is required');
    });
  });

  describe('markStepCompleted', () => {
    it('should mark a step as completed with output', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.markStepCompleted('wf_123', 'step-1', {
        output: { result: 'success' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/wf_123/steps/step-1/complete',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should mark a step as completed without request body', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.markStepCompleted('wf_123', 'step-1');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toEqual({});
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.markStepCompleted('', 'step-1')).rejects.toThrow(ConfigurationError);
      await expect(client.markStepCompleted('', 'step-1')).rejects.toThrow(
        'Workflow ID is required'
      );
    });

    it('should throw ConfigurationError when stepId is empty', async () => {
      await expect(client.markStepCompleted('wf_123', '')).rejects.toThrow(ConfigurationError);
      await expect(client.markStepCompleted('wf_123', '')).rejects.toThrow('Step ID is required');
    });
  });

  describe('resumeWorkflow', () => {
    it('should resume a workflow', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.resumeWorkflow('wf_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows/wf_123/resume',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw ConfigurationError when workflowId is empty', async () => {
      await expect(client.resumeWorkflow('')).rejects.toThrow(ConfigurationError);
      await expect(client.resumeWorkflow('')).rejects.toThrow('Workflow ID is required');
    });
  });

  describe('listWorkflows', () => {
    it('should list workflows without options', async () => {
      const listResponse = {
        workflows: [{ workflow_id: 'wf_1', status: 'completed' }],
        total: 1,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(listResponse));

      const result = await client.listWorkflows();

      expect(result.total).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/workflows',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list workflows with status filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ workflows: [], total: 0 }));

      await client.listWorkflows({ status: 'in_progress' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=in_progress'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list workflows with source filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ workflows: [], total: 0 }));

      await client.listWorkflows({ source: 'langgraph' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('source=langgraph'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list workflows with limit and offset', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ workflows: [], total: 0 }));

      await client.listWorkflows({ limit: 10, offset: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=20'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list workflows with all options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ workflows: [], total: 0 }));

      await client.listWorkflows({
        status: 'completed',
        source: 'crewai',
        limit: 5,
        offset: 0,
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('status=completed');
      expect(url).toContain('source=crewai');
      expect(url).toContain('limit=5');
      expect(url).toContain('offset=0');
    });
  });

  // ==========================================================================
  // MAS FEAT Assessment - optional branch coverage (lines 4739-4843)
  // ==========================================================================

  describe('masfeat createAssessment - optional fields', () => {
    it('should create assessment with all score fields and findings', async () => {
      const assessmentResponse = {
        id: 'assess-full',
        org_id: 'org-1',
        system_id: 'sys-1',
        assessment_type: 'annual',
        status: 'pending',
        assessment_date: '2026-02-07T12:00:00Z',
        fairness_score: 85,
        ethics_score: 90,
        accountability_score: 88,
        transparency_score: 92,
        fairness_details: { metric: 0.9 },
        ethics_details: { metric: 0.95 },
        accountability_details: { metric: 0.88 },
        transparency_details: { metric: 0.92 },
        recommendations: ['Improve data collection'],
        findings: [
          {
            id: 'f-1',
            pillar: 'fairness',
            severity: 'major',
            category: 'bias',
            description: 'Bias detected',
            status: 'open',
            remediation: 'Retrain model',
            due_date: '2026-03-01T00:00:00Z',
          },
        ],
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.createAssessment({
        systemId: 'sys-1',
        assessmentType: 'annual',
        assessmentDate: new Date('2026-02-07T12:00:00Z'),
        fairnessScore: 85,
        ethicsScore: 90,
        accountabilityScore: 88,
        transparencyScore: 92,
        fairnessDetails: { metric: 0.9 },
        ethicsDetails: { metric: 0.95 },
        accountabilityDetails: { metric: 0.88 },
        transparencyDetails: { metric: 0.92 },
        recommendations: ['Improve data collection'],
        findings: [
          {
            id: 'f-1',
            pillar: 'fairness',
            severity: 'major',
            category: 'bias',
            description: 'Bias detected',
            status: 'open',
            remediation: 'Retrain model',
            dueDate: new Date('2026-03-01'),
          },
        ],
      });

      expect(result.id).toBe('assess-full');
      expect(result.fairnessScore).toBe(85);

      // Verify body sent to API
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.fairness_score).toBe(85);
      expect(body.ethics_score).toBe(90);
      expect(body.accountability_score).toBe(88);
      expect(body.transparency_score).toBe(92);
      expect(body.fairness_details).toEqual({ metric: 0.9 });
      expect(body.ethics_details).toEqual({ metric: 0.95 });
      expect(body.accountability_details).toEqual({ metric: 0.88 });
      expect(body.transparency_details).toEqual({ metric: 0.92 });
      expect(body.recommendations).toEqual(['Improve data collection']);
      expect(body.findings).toHaveLength(1);
      expect(body.findings[0].remediation).toBe('Retrain model');
      expect(body.assessment_date).toBeDefined();
    });
  });

  describe('masfeat updateAssessment - optional fields', () => {
    it('should update assessment with all optional score fields and findings', async () => {
      const assessmentResponse = {
        id: 'assess-upd',
        org_id: 'org-1',
        system_id: 'sys-1',
        assessment_type: 'annual',
        status: 'in_progress',
        assessment_date: '2026-02-07T12:00:00Z',
        fairness_score: 80,
        ethics_score: 85,
        accountability_score: 82,
        transparency_score: 78,
        fairness_details: { updated: true },
        ethics_details: { updated: true },
        accountability_details: { updated: true },
        transparency_details: { updated: true },
        findings: [
          {
            id: 'f-upd',
            pillar: 'ethics',
            severity: 'minor',
            category: 'consent',
            description: 'Updated finding',
            status: 'resolved',
          },
        ],
        recommendations: ['New rec'],
        assessors: ['new@example.com'],
        created_at: '2026-02-07T12:00:00Z',
        updated_at: '2026-02-07T13:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.updateAssessment('assess-upd', {
        fairnessScore: 80,
        ethicsScore: 85,
        accountabilityScore: 82,
        transparencyScore: 78,
        fairnessDetails: { updated: true },
        ethicsDetails: { updated: true },
        accountabilityDetails: { updated: true },
        transparencyDetails: { updated: true },
        findings: [
          {
            id: 'f-upd',
            pillar: 'ethics',
            severity: 'minor',
            category: 'consent',
            description: 'Updated finding',
            status: 'resolved',
          },
        ],
        recommendations: ['New rec'],
        assessors: ['new@example.com'],
      });

      expect(result.fairnessScore).toBe(80);
      expect(result.ethicsScore).toBe(85);
      expect(result.accountabilityScore).toBe(82);
      expect(result.transparencyScore).toBe(78);

      // Verify body sent to API
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.accountability_score).toBe(82);
      expect(body.transparency_score).toBe(78);
      expect(body.fairness_details).toEqual({ updated: true });
      expect(body.ethics_details).toEqual({ updated: true });
      expect(body.accountability_details).toEqual({ updated: true });
      expect(body.transparency_details).toEqual({ updated: true });
      expect(body.findings).toHaveLength(1);
      expect(body.recommendations).toEqual(['New rec']);
      expect(body.assessors).toEqual(['new@example.com']);
    });

    it('should throw APIError on update failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500));

      await expect(
        client.masfeat.updateAssessment('assess-fail', { fairnessScore: 50 })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Unified Execution Methods (lines 5295-5397)
  // ==========================================================================

  describe('getExecutionStatus', () => {
    it('should get execution status', async () => {
      const statusResponse = {
        execution_id: 'exec_123',
        execution_type: 'wcp_workflow',
        status: 'running',
        progress_percent: 60,
        steps: [
          { step_index: 0, step_name: 'Step 1', status: 'completed' },
          { step_index: 1, step_name: 'Step 2', status: 'running' },
        ],
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statusResponse));

      const result = await client.getExecutionStatus('exec_123');

      expect(result.execution_id).toBe('exec_123');
      expect(result.execution_type).toBe('wcp_workflow');
      expect(result.status).toBe('running');
      expect(result.progress_percent).toBe(60);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/unified/executions/exec_123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw ConfigurationError when executionId is empty', async () => {
      await expect(client.getExecutionStatus('')).rejects.toThrow(ConfigurationError);
      await expect(client.getExecutionStatus('')).rejects.toThrow('Execution ID is required');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.getExecutionStatus('exec_bad')).rejects.toThrow();
    });

    it('should work in debug mode', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        debug: true,
      });

      const statusResponse = {
        execution_id: 'exec_debug',
        execution_type: 'map_plan',
        status: 'completed',
        progress_percent: 100,
        steps: [],
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statusResponse));

      const result = await debugClient.getExecutionStatus('exec_debug');
      expect(result.execution_id).toBe('exec_debug');
    });
  });

  describe('listUnifiedExecutions', () => {
    it('should list unified executions without options', async () => {
      const listResponse = {
        executions: [
          {
            execution_id: 'exec_1',
            execution_type: 'wcp_workflow',
            status: 'running',
          },
        ],
        total: 1,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(listResponse));

      const result = await client.listUnifiedExecutions();

      expect(result.total).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/unified/executions',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list with execution_type filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ executions: [], total: 0 }));

      await client.listUnifiedExecutions({ execution_type: 'map_plan' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('execution_type=map_plan'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list with status filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ executions: [], total: 0 }));

      await client.listUnifiedExecutions({ status: 'running' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=running'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should list with tenant_id and org_id filters', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ executions: [], total: 0 }));

      await client.listUnifiedExecutions({
        tenant_id: 'tenant_123',
        org_id: 'org_456',
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('tenant_id=tenant_123');
      expect(url).toContain('org_id=org_456');
    });

    it('should list with limit and offset', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ executions: [], total: 0 }));

      await client.listUnifiedExecutions({ limit: 25, offset: 50 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=25');
      expect(url).toContain('offset=50');
    });

    it('should list with all options combined', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ executions: [], total: 0 }));

      await client.listUnifiedExecutions({
        execution_type: 'wcp_workflow',
        status: 'completed',
        tenant_id: 'tenant_x',
        org_id: 'org_y',
        limit: 10,
        offset: 0,
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('execution_type=wcp_workflow');
      expect(url).toContain('status=completed');
      expect(url).toContain('tenant_id=tenant_x');
      expect(url).toContain('org_id=org_y');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
    });

    it('should work in debug mode', async () => {
      const debugClient = new AxonFlow({
        endpoint: 'http://localhost:8080',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
        debug: true,
      });

      mockFetch.mockResolvedValueOnce(mockResponse({ executions: [], total: 0 }));

      const result = await debugClient.listUnifiedExecutions({ status: 'running' });
      expect(result.total).toBe(0);
    });
  });

  describe('cancelExecution', () => {
    it('should cancel an execution without reason', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.cancelExecution('exec_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/unified/executions/exec_123/cancel',
        expect.objectContaining({ method: 'POST' })
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toEqual({});
    });

    it('should cancel an execution with reason', async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          json: () => Promise.resolve(undefined),
          text: () => Promise.resolve(''),
        })
      );

      await client.cancelExecution('exec_123', 'User requested cancellation');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reason).toBe('User requested cancellation');
    });

    it('should throw ConfigurationError when executionId is empty', async () => {
      await expect(client.cancelExecution('')).rejects.toThrow(ConfigurationError);
      await expect(client.cancelExecution('')).rejects.toThrow('Execution ID is required');
    });

    it('should handle API errors on cancel', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.cancelExecution('exec_bad')).rejects.toThrow();
    });
  });
});
