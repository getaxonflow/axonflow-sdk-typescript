/**
 * Tests for MAS FEAT Compliance Module
 * Enterprise Feature: Requires AxonFlow Enterprise license.
 */

import { AxonFlow } from '../src/client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('MAS FEAT Compliance Module', () => {
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

  describe('registerSystem', () => {
    it('should register a new AI system', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'credit-model-v1',
        system_name: 'Credit Scoring Model',
        use_case: 'credit_scoring',
        owner_team: 'data-science',
        customer_impact: 3,
        model_complexity: 2,
        human_reliance: 1,
        materiality: 'high',
        status: 'draft',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.registerSystem({
        systemId: 'credit-model-v1',
        systemName: 'Credit Scoring Model',
        useCase: 'credit_scoring',
        ownerTeam: 'data-science',
        customerImpact: 3,
        modelComplexity: 2,
        humanReliance: 1,
      });

      expect(result.id).toBe('sys-123');
      expect(result.systemName).toBe('Credit Scoring Model');
      expect(result.materiality).toBe('high');
    });
  });

  describe('getSystem', () => {
    it('should get a system by ID', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'Test Model',
        use_case: 'credit_scoring',
        owner_team: 'team',
        customer_impact: 3,
        model_complexity: 2,
        human_reliance: 1,
        materiality: 'high',
        status: 'active',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.getSystem('sys-123');

      expect(result.id).toBe('sys-123');
      expect(result.status).toBe('active');
    });
  });

  describe('activateSystem', () => {
    it('should activate a system', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'Test Model',
        use_case: 'credit_scoring',
        owner_team: 'team',
        customer_impact: 3,
        model_complexity: 2,
        human_reliance: 1,
        materiality: 'high',
        status: 'active',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.activateSystem('sys-123');

      expect(result.status).toBe('active');
    });
  });

  describe('listSystems', () => {
    it('should list all systems', async () => {
      const systemsResponse = [
        {
          id: 'sys-1',
          org_id: 'org-456',
          system_id: 'model-1',
          system_name: 'Model 1',
          use_case: 'credit_scoring',
          owner_team: 'team',
          customer_impact: 3,
          model_complexity: 2,
          human_reliance: 1,
          materiality: 'high',
          status: 'active',
          created_at: '2026-01-23T12:00:00Z',
          updated_at: '2026-01-23T12:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce(mockResponse(systemsResponse));

      const result = await client.masfeat.listSystems();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sys-1');
    });
  });

  describe('getRegistrySummary', () => {
    it('should get registry summary', async () => {
      const summaryResponse = {
        total_systems: 10,
        active_systems: 8,
        high_materiality_count: 2,
        medium_materiality_count: 5,
        low_materiality_count: 3,
        by_use_case: { credit_scoring: 4 },
        by_status: { active: 8 },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(summaryResponse));

      const result = await client.masfeat.getRegistrySummary();

      expect(result.totalSystems).toBe(10);
      expect(result.activeSystems).toBe(8);
    });

    it('should handle alternate field names', async () => {
      const summaryResponse = {
        total_systems: 10,
        active_systems: 8,
        high_materiality: 2,
        medium_materiality: 5,
        low_materiality: 3,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(summaryResponse));

      const result = await client.masfeat.getRegistrySummary();

      expect(result.highMaterialityCount).toBe(2);
    });
  });

  describe('createAssessment', () => {
    it('should create a new assessment', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'pending',
        assessment_date: '2026-01-23T12:00:00Z',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.createAssessment({
        systemId: 'sys-789',
        assessmentType: 'annual',
      });

      expect(result.id).toBe('assess-123');
      expect(result.status).toBe('pending');
    });
  });

  describe('getAssessment', () => {
    it('should get an assessment by ID', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'completed',
        assessment_date: '2026-01-23T12:00:00Z',
        fairness_score: 85,
        ethics_score: 90,
        accountability_score: 88,
        transparency_score: 92,
        overall_score: 89,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.getAssessment('assess-123');

      expect(result.id).toBe('assess-123');
      expect(result.overallScore).toBe(89);
    });
  });

  describe('updateAssessment', () => {
    it('should update an assessment', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'in_progress',
        assessment_date: '2026-01-23T12:00:00Z',
        fairness_score: 85,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.updateAssessment('assess-123', {
        fairnessScore: 85,
      });

      expect(result.fairnessScore).toBe(85);
    });
  });

  describe('submitAssessment', () => {
    it('should submit an assessment for review', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'completed',
        assessment_date: '2026-01-23T12:00:00Z',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.submitAssessment('assess-123');

      expect(result.status).toBe('completed');
    });
  });

  describe('approveAssessment', () => {
    it('should approve an assessment', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'approved',
        assessment_date: '2026-01-23T12:00:00Z',
        approved_by: 'admin@example.com',
        approved_at: '2026-01-23T13:00:00Z',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T13:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.approveAssessment('assess-123', {});

      expect(result.status).toBe('approved');
      expect(result.approvedBy).toBe('admin@example.com');
    });
  });

  describe('getKillSwitch', () => {
    it('should get kill switch status', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'enabled',
        auto_trigger_enabled: true,
        accuracy_threshold: 0.95,
        bias_threshold: 0.1,
        error_rate_threshold: 0.05,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.getKillSwitch('sys-789');

      expect(result.id).toBe('ks-123');
      expect(result.status).toBe('enabled');
      expect(result.accuracyThreshold).toBe(0.95);
    });
  });

  describe('configureKillSwitch', () => {
    it('should configure kill switch thresholds', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'enabled',
        auto_trigger_enabled: true,
        accuracy_threshold: 0.95,
        bias_threshold: 0.1,
        error_rate_threshold: 0.05,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.configureKillSwitch('sys-789', {
        accuracyThreshold: 0.95,
        biasThreshold: 0.1,
        errorRateThreshold: 0.05,
        autoTriggerEnabled: true,
      });

      expect(result.autoTriggerEnabled).toBe(true);
    });
  });

  describe('triggerKillSwitch', () => {
    it('should trigger kill switch', async () => {
      const killSwitchResponse = {
        kill_switch: {
          id: 'ks-123',
          org_id: 'org-456',
          system_id: 'sys-789',
          status: 'triggered',
          auto_trigger_enabled: true,
          triggered_reason: 'Manual trigger',
          created_at: '2026-01-23T12:00:00Z',
          updated_at: '2026-01-23T12:00:00Z',
        },
        message: 'Kill switch triggered',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.triggerKillSwitch('sys-789', {
        reason: 'Manual trigger',
      });

      expect(result.status).toBe('triggered');
      expect(result.triggeredReason).toBe('Manual trigger');
    });

    it('should handle trigger_reason field name', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'triggered',
        auto_trigger_enabled: true,
        trigger_reason: 'Bias exceeded',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.triggerKillSwitch('sys-789', { reason: 'Bias exceeded' });

      expect(result.triggeredReason).toBe('Bias exceeded');
    });
  });

  describe('restoreKillSwitch', () => {
    it('should restore kill switch', async () => {
      const killSwitchResponse = {
        kill_switch: {
          id: 'ks-123',
          org_id: 'org-456',
          system_id: 'sys-789',
          status: 'enabled',
          auto_trigger_enabled: true,
          created_at: '2026-01-23T12:00:00Z',
          updated_at: '2026-01-23T12:00:00Z',
        },
        message: 'Kill switch restored',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.restoreKillSwitch('sys-789', {
        reason: 'System restored',
      });

      expect(result.status).toBe('enabled');
    });
  });

  describe('getKillSwitchHistory', () => {
    it('should get kill switch history', async () => {
      const historyResponse = [
        {
          id: 'event-1',
          kill_switch_id: 'ks-123',
          event_type: 'enabled',
          created_at: '2026-01-23T12:00:00Z',
        },
        {
          id: 'event-2',
          kill_switch_id: 'ks-123',
          event_type: 'triggered',
          event_data: { reason: 'Test' },
          created_at: '2026-01-23T13:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce(mockResponse(historyResponse));

      const result = await client.masfeat.getKillSwitchHistory('sys-789');

      expect(result).toHaveLength(2);
      expect(result[0].eventType).toBe('enabled');
      expect(result[1].eventType).toBe('triggered');
    });

    it('should handle nested history response', async () => {
      const historyResponse = {
        history: [
          {
            id: 'event-1',
            kill_switch_id: 'ks-123',
            action: 'triggered',
            performed_by: 'admin',
            performed_at: '2026-01-23T12:00:00Z',
          },
        ],
        count: 1,
      };

      mockFetch.mockResolvedValueOnce(mockResponse(historyResponse));

      const result = await client.masfeat.getKillSwitchHistory('sys-789');

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('triggered');
      expect(result[0].createdBy).toBe('admin');
    });
  });

  describe('updateSystem', () => {
    it('should update a system', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'Updated Model',
        use_case: 'credit_scoring',
        owner_team: 'new-team',
        materiality: 'high',
        status: 'active',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.updateSystem('sys-123', {
        systemName: 'Updated Model',
        ownerTeam: 'new-team',
      });

      expect(result.systemName).toBe('Updated Model');
    });
  });

  describe('retireSystem', () => {
    it('should retire a system', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'Test Model',
        use_case: 'credit_scoring',
        owner_team: 'team',
        materiality: 'high',
        status: 'retired',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.retireSystem('sys-123');

      expect(result.status).toBe('retired');
    });
  });

  describe('listAssessments', () => {
    it('should list assessments', async () => {
      const assessmentsResponse = [
        {
          id: 'assess-1',
          org_id: 'org-456',
          system_id: 'sys-789',
          assessment_type: 'annual',
          status: 'completed',
          assessment_date: '2026-01-23T12:00:00Z',
          created_at: '2026-01-23T12:00:00Z',
          updated_at: '2026-01-23T12:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentsResponse));

      const result = await client.masfeat.listAssessments();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('assess-1');
    });
  });

  describe('rejectAssessment', () => {
    it('should reject an assessment', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'rejected',
        assessment_date: '2026-01-23T12:00:00Z',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.rejectAssessment('assess-123', {
        reason: 'Incomplete data',
      });

      expect(result.status).toBe('rejected');
    });
  });

  describe('checkKillSwitch', () => {
    it('should check kill switch status with metrics', async () => {
      const statusResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'enabled',
        auto_trigger_enabled: true,
        accuracy_threshold: 0.95,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(statusResponse));

      const result = await client.masfeat.checkKillSwitch('sys-789', {
        accuracy: 0.92,
        biasScore: 0.05,
      });

      expect(result.status).toBe('enabled');
      expect(result.accuracyThreshold).toBe(0.95);
    });
  });

  describe('enableKillSwitch', () => {
    it('should enable a kill switch', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'enabled',
        auto_trigger_enabled: true,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.enableKillSwitch('sys-789');

      expect(result.status).toBe('enabled');
    });
  });

  describe('disableKillSwitch', () => {
    it('should disable a kill switch', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'disabled',
        auto_trigger_enabled: false,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.disableKillSwitch('sys-789', { reason: 'Maintenance' });

      expect(result.status).toBe('disabled');
    });
  });

  // Additional tests for branch coverage
  describe('Error Handling', () => {
    it('should throw APIError on registerSystem failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid request' }, 400));

      await expect(
        client.masfeat.registerSystem({
          systemId: 'test',
          systemName: 'Test',
          useCase: 'credit_scoring',
          ownerTeam: 'team',
          customerImpact: 1,
          modelComplexity: 1,
          humanReliance: 1,
        })
      ).rejects.toThrow();
    });

    it('should throw APIError on getSystem failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.masfeat.getSystem('invalid-id')).rejects.toThrow();
    });

    it('should throw APIError on updateSystem failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(
        client.masfeat.updateSystem('invalid-id', { systemName: 'New' })
      ).rejects.toThrow();
    });

    it('should throw APIError on listSystems failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Forbidden' }, 403));

      await expect(client.masfeat.listSystems()).rejects.toThrow();
    });

    it('should throw APIError on activateSystem failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid state' }, 400));

      await expect(client.masfeat.activateSystem('sys-123')).rejects.toThrow();
    });

    it('should throw APIError on retireSystem failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid state' }, 400));

      await expect(client.masfeat.retireSystem('sys-123')).rejects.toThrow();
    });

    it('should throw APIError on getRegistrySummary failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500));

      await expect(client.masfeat.getRegistrySummary()).rejects.toThrow();
    });

    it('should throw APIError on createAssessment failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(
        client.masfeat.createAssessment({ systemId: 'sys-123', assessmentType: 'annual' })
      ).rejects.toThrow();
    });

    it('should throw APIError on getAssessment failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.masfeat.getAssessment('invalid')).rejects.toThrow();
    });

    it('should throw APIError on submitAssessment failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(client.masfeat.submitAssessment('assess-123')).rejects.toThrow();
    });

    it('should throw APIError on approveAssessment failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(client.masfeat.approveAssessment('assess-123', {})).rejects.toThrow();
    });

    it('should throw APIError on rejectAssessment failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(
        client.masfeat.rejectAssessment('assess-123', { reason: 'test' })
      ).rejects.toThrow();
    });

    it('should throw APIError on listAssessments failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Forbidden' }, 403));

      await expect(client.masfeat.listAssessments()).rejects.toThrow();
    });

    it('should throw APIError on getKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(client.masfeat.getKillSwitch('sys-123')).rejects.toThrow();
    });

    it('should throw APIError on configureKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(
        client.masfeat.configureKillSwitch('sys-123', { accuracyThreshold: 0.95 })
      ).rejects.toThrow();
    });

    it('should throw APIError on checkKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(client.masfeat.checkKillSwitch('sys-123', { accuracy: 0.9 })).rejects.toThrow();
    });

    it('should throw APIError on triggerKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(
        client.masfeat.triggerKillSwitch('sys-123', { reason: 'test' })
      ).rejects.toThrow();
    });

    it('should throw APIError on restoreKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(
        client.masfeat.restoreKillSwitch('sys-123', { reason: 'test' })
      ).rejects.toThrow();
    });

    it('should throw APIError on enableKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(client.masfeat.enableKillSwitch('sys-123')).rejects.toThrow();
    });

    it('should throw APIError on disableKillSwitch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Invalid' }, 400));

      await expect(
        client.masfeat.disableKillSwitch('sys-123', { reason: 'test' })
      ).rejects.toThrow();
    });

    it('should throw APIError on getKillSwitchHistory failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      await expect(client.masfeat.getKillSwitchHistory('sys-123')).rejects.toThrow();
    });
  });

  describe('Optional Parameters', () => {
    it('should list systems with all filter options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await client.masfeat.listSystems({
        status: 'active',
        useCase: 'credit_scoring',
        materiality: 'high',
        limit: 10,
        offset: 5,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('status=active');
      expect(url).toContain('use_case=credit_scoring');
      expect(url).toContain('materiality=high');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
    });

    it('should list assessments with all filter options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await client.masfeat.listAssessments({
        systemId: 'sys-123',
        status: 'completed',
        limit: 20,
        offset: 10,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('system_id=sys-123');
      expect(url).toContain('status=completed');
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=10');
    });

    it('should get kill switch history with limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await client.masfeat.getKillSwitchHistory('sys-123', 5);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('limit=5');
    });

    it('should update system with all fields', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'New Name',
        description: 'New Description',
        use_case: 'credit_scoring',
        owner_team: 'new-team',
        technical_owner: 'tech@example.com',
        business_owner: 'biz@example.com',
        customer_impact: 4,
        model_complexity: 3,
        human_reliance: 2,
        metadata: { key: 'value' },
        materiality: 'high',
        status: 'active',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.updateSystem('sys-123', {
        systemName: 'New Name',
        description: 'New Description',
        ownerTeam: 'new-team',
        technicalOwner: 'tech@example.com',
        businessOwner: 'biz@example.com',
        customerImpact: 4,
        modelComplexity: 3,
        humanReliance: 2,
        metadata: { key: 'value' },
      });

      expect(result.systemName).toBe('New Name');
      expect(result.description).toBe('New Description');
    });

    it('should configure kill switch with all thresholds', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'enabled',
        auto_trigger_enabled: true,
        accuracy_threshold: 0.95,
        bias_threshold: 0.1,
        error_rate_threshold: 0.05,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.configureKillSwitch('sys-789', {
        accuracyThreshold: 0.95,
        biasThreshold: 0.1,
        errorRateThreshold: 0.05,
        autoTriggerEnabled: true,
      });

      expect(result.accuracyThreshold).toBe(0.95);
      expect(result.biasThreshold).toBe(0.1);
      expect(result.errorRateThreshold).toBe(0.05);
    });

    it('should check kill switch with all metrics', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'enabled',
        auto_trigger_enabled: true,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.checkKillSwitch('sys-789', {
        accuracy: 0.92,
        biasScore: 0.05,
        errorRate: 0.02,
      });

      expect(result.status).toBe('enabled');
    });

    it('should register system with optional fields', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'Test Model',
        description: 'A test model',
        use_case: 'credit_scoring',
        owner_team: 'team',
        technical_owner: 'tech@example.com',
        business_owner: 'biz@example.com',
        metadata: { env: 'prod' },
        materiality: 'high',
        status: 'draft',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.registerSystem({
        systemId: 'model-v1',
        systemName: 'Test Model',
        useCase: 'credit_scoring',
        ownerTeam: 'team',
        customerImpact: 3,
        modelComplexity: 2,
        humanReliance: 1,
        description: 'A test model',
        technicalOwner: 'tech@example.com',
        businessOwner: 'biz@example.com',
        metadata: { env: 'prod' },
      });

      expect(result.description).toBe('A test model');
      expect(result.technicalOwner).toBe('tech@example.com');
    });

    it('should create assessment with assessors', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'pending',
        assessors: ['user1@example.com', 'user2@example.com'],
        assessment_date: '2026-01-23T12:00:00Z',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.createAssessment({
        systemId: 'sys-789',
        assessmentType: 'annual',
        assessors: ['user1@example.com', 'user2@example.com'],
      });

      expect(result.assessors).toHaveLength(2);
    });

    it('should trigger kill switch with triggeredBy', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'triggered',
        auto_trigger_enabled: true,
        triggered_by: 'admin@example.com',
        trigger_reason: 'Manual trigger',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.triggerKillSwitch('sys-789', {
        reason: 'Manual trigger',
        triggeredBy: 'admin@example.com',
      });

      expect(result.triggeredBy).toBe('admin@example.com');
    });

    it('should restore kill switch with restoredBy', async () => {
      const killSwitchResponse = {
        kill_switch: {
          id: 'ks-123',
          org_id: 'org-456',
          system_id: 'sys-789',
          status: 'enabled',
          auto_trigger_enabled: true,
          restored_by: 'admin@example.com',
          created_at: '2026-01-23T12:00:00Z',
          updated_at: '2026-01-23T12:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.restoreKillSwitch('sys-789', {
        reason: 'Issue resolved',
        restoredBy: 'admin@example.com',
      });

      expect(result.restoredBy).toBe('admin@example.com');
    });
  });

  describe('Response Mapping', () => {
    it('should map all system fields correctly', async () => {
      const systemResponse = {
        id: 'sys-123',
        org_id: 'org-456',
        system_id: 'model-v1',
        system_name: 'Test Model',
        description: 'Description',
        use_case: 'credit_scoring',
        owner_team: 'team',
        technical_owner: 'tech@example.com',
        business_owner: 'biz@example.com',
        risk_rating_impact: 3,
        risk_rating_complexity: 2,
        risk_rating_reliance: 1,
        materiality_classification: 'high',
        metadata: { key: 'value' },
        status: 'active',
        created_by: 'creator@example.com',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(systemResponse));

      const result = await client.masfeat.getSystem('sys-123');

      expect(result.customerImpact).toBe(3);
      expect(result.modelComplexity).toBe(2);
      expect(result.humanReliance).toBe(1);
      expect(result.metadata).toEqual({ key: 'value' });
      expect(result.createdBy).toBe('creator@example.com');
    });

    it('should map all assessment fields correctly', async () => {
      const assessmentResponse = {
        id: 'assess-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        assessment_type: 'annual',
        status: 'completed',
        assessment_date: '2026-01-23T12:00:00Z',
        valid_until: '2027-01-23T12:00:00Z',
        fairness_score: 85,
        ethics_score: 90,
        accountability_score: 88,
        transparency_score: 82,
        overall_score: 86,
        fairness_details: { metric1: 0.9 },
        ethics_details: { metric2: 0.95 },
        accountability_details: { metric3: 0.88 },
        transparency_details: { metric4: 0.82 },
        findings: [
          {
            id: 'finding-1',
            pillar: 'fairness',
            severity: 'minor',
            category: 'bias',
            description: 'Minor bias detected',
            status: 'open',
            remediation: 'Fix the bias',
            due_date: '2026-02-23T12:00:00Z',
          },
        ],
        recommendations: ['Improve data quality'],
        assessors: ['user@example.com'],
        approved_by: 'approver@example.com',
        approved_at: '2026-01-24T12:00:00Z',
        created_by: 'creator@example.com',
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(assessmentResponse));

      const result = await client.masfeat.getAssessment('assess-123');

      expect(result.fairnessScore).toBe(85);
      expect(result.ethicsScore).toBe(90);
      expect(result.accountabilityScore).toBe(88);
      expect(result.transparencyScore).toBe(82);
      expect(result.overallScore).toBe(86);
      expect(result.findings).toHaveLength(1);
      expect(result.findings?.[0].remediation).toBe('Fix the bias');
      expect(result.recommendations).toContain('Improve data quality');
    });

    it('should map all kill switch fields correctly', async () => {
      const killSwitchResponse = {
        id: 'ks-123',
        org_id: 'org-456',
        system_id: 'sys-789',
        status: 'triggered',
        accuracy_threshold: 0.95,
        bias_threshold: 0.1,
        error_rate_threshold: 0.05,
        auto_trigger_enabled: true,
        triggered_at: '2026-01-23T14:00:00Z',
        triggered_by: 'system',
        trigger_reason: 'Accuracy below threshold',
        restored_at: null,
        restored_by: null,
        created_at: '2026-01-23T12:00:00Z',
        updated_at: '2026-01-23T14:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(killSwitchResponse));

      const result = await client.masfeat.getKillSwitch('sys-789');

      expect(result.accuracyThreshold).toBe(0.95);
      expect(result.biasThreshold).toBe(0.1);
      expect(result.errorRateThreshold).toBe(0.05);
      expect(result.triggeredAt).toBeDefined();
      expect(result.triggeredReason).toBe('Accuracy below threshold');
    });

    it('should map kill switch event fields correctly', async () => {
      const historyResponse = [
        {
          id: 'event-1',
          kill_switch_id: 'ks-123',
          event_type: 'triggered',
          event_data: { reason: 'Test', previous_status: 'enabled' },
          created_by: 'admin@example.com',
          created_at: '2026-01-23T12:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce(mockResponse(historyResponse));

      const result = await client.masfeat.getKillSwitchHistory('sys-789');

      expect(result[0].eventType).toBe('triggered');
      expect(result[0].eventData).toEqual({ reason: 'Test', previous_status: 'enabled' });
      expect(result[0].createdBy).toBe('admin@example.com');
    });
  });
});
