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

      const result = await client.masfeatRegisterSystem({
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

      const result = await client.masfeatGetSystem('sys-123');

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

      const result = await client.masfeatActivateSystem('sys-123');

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

      const result = await client.masfeatListSystems();

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

      const result = await client.masfeatGetRegistrySummary();

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

      const result = await client.masfeatGetRegistrySummary();

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

      const result = await client.masfeatCreateAssessment({
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

      const result = await client.masfeatGetAssessment('assess-123');

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

      const result = await client.masfeatUpdateAssessment('assess-123', {
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

      const result = await client.masfeatSubmitAssessment('assess-123');

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

      const result = await client.masfeatApproveAssessment('assess-123');

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

      const result = await client.masfeatGetKillSwitch('sys-789');

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

      const result = await client.masfeatConfigureKillSwitch('sys-789', {
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

      const result = await client.masfeatTriggerKillSwitch('sys-789', 'Manual trigger');

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

      const result = await client.masfeatTriggerKillSwitch('sys-789', 'Bias exceeded');

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

      const result = await client.masfeatRestoreKillSwitch('sys-789');

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

      const result = await client.masfeatGetKillSwitchHistory('sys-789');

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

      const result = await client.masfeatGetKillSwitchHistory('sys-789');

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('triggered');
      expect(result[0].createdBy).toBe('admin');
    });
  });
});
