/**
 * Tests for unified execution types and helpers.
 */

import {
  ExecutionType,
  ExecutionStatusValue,
  StepStatusValue,
  UnifiedStepType,
  UnifiedGateDecision,
  UnifiedApprovalStatus,
  UnifiedStepStatus,
  ExecutionStatus,
  ExecutionHelpers,
} from '../src/types/execution';

describe('ExecutionHelpers', () => {
  describe('isTerminal', () => {
    it('should return true for completed status', () => {
      expect(ExecutionHelpers.isTerminal('completed')).toBe(true);
    });

    it('should return true for failed status', () => {
      expect(ExecutionHelpers.isTerminal('failed')).toBe(true);
    });

    it('should return true for cancelled status', () => {
      expect(ExecutionHelpers.isTerminal('cancelled')).toBe(true);
    });

    it('should return true for aborted status', () => {
      expect(ExecutionHelpers.isTerminal('aborted')).toBe(true);
    });

    it('should return true for expired status', () => {
      expect(ExecutionHelpers.isTerminal('expired')).toBe(true);
    });

    it('should return false for pending status', () => {
      expect(ExecutionHelpers.isTerminal('pending')).toBe(false);
    });

    it('should return false for running status', () => {
      expect(ExecutionHelpers.isTerminal('running')).toBe(false);
    });
  });

  describe('isStepTerminal', () => {
    it('should return true for completed status', () => {
      expect(ExecutionHelpers.isStepTerminal('completed')).toBe(true);
    });

    it('should return true for failed status', () => {
      expect(ExecutionHelpers.isStepTerminal('failed')).toBe(true);
    });

    it('should return true for skipped status', () => {
      expect(ExecutionHelpers.isStepTerminal('skipped')).toBe(true);
    });

    it('should return false for pending status', () => {
      expect(ExecutionHelpers.isStepTerminal('pending')).toBe(false);
    });

    it('should return false for running status', () => {
      expect(ExecutionHelpers.isStepTerminal('running')).toBe(false);
    });

    it('should return false for blocked status', () => {
      expect(ExecutionHelpers.isStepTerminal('blocked')).toBe(false);
    });

    it('should return false for approval status', () => {
      expect(ExecutionHelpers.isStepTerminal('approval')).toBe(false);
    });
  });

  describe('isStepBlocking', () => {
    it('should return true for blocked status', () => {
      expect(ExecutionHelpers.isStepBlocking('blocked')).toBe(true);
    });

    it('should return true for approval status', () => {
      expect(ExecutionHelpers.isStepBlocking('approval')).toBe(true);
    });

    it('should return false for pending status', () => {
      expect(ExecutionHelpers.isStepBlocking('pending')).toBe(false);
    });

    it('should return false for running status', () => {
      expect(ExecutionHelpers.isStepBlocking('running')).toBe(false);
    });

    it('should return false for completed status', () => {
      expect(ExecutionHelpers.isStepBlocking('completed')).toBe(false);
    });
  });

  describe('calculateProgress', () => {
    it('should return 0 for zero total steps', () => {
      expect(ExecutionHelpers.calculateProgress([], 0)).toBe(0);
    });

    it('should calculate progress correctly', () => {
      const steps: UnifiedStepStatus[] = [
        {
          step_id: 'step-1',
          step_index: 0,
          step_name: 'Step 1',
          step_type: 'llm_call',
          status: 'completed',
        },
        {
          step_id: 'step-2',
          step_index: 1,
          step_name: 'Step 2',
          step_type: 'llm_call',
          status: 'completed',
        },
        {
          step_id: 'step-3',
          step_index: 2,
          step_name: 'Step 3',
          step_type: 'llm_call',
          status: 'running',
        },
        {
          step_id: 'step-4',
          step_index: 3,
          step_name: 'Step 4',
          step_type: 'llm_call',
          status: 'pending',
        },
      ];
      expect(ExecutionHelpers.calculateProgress(steps, 4)).toBe(50);
    });

    it('should return 100 for all completed steps', () => {
      const steps: UnifiedStepStatus[] = [
        {
          step_id: 'step-1',
          step_index: 0,
          step_name: 'Step 1',
          step_type: 'llm_call',
          status: 'completed',
        },
        {
          step_id: 'step-2',
          step_index: 1,
          step_name: 'Step 2',
          step_type: 'llm_call',
          status: 'completed',
        },
      ];
      expect(ExecutionHelpers.calculateProgress(steps, 2)).toBe(100);
    });
  });

  describe('getCurrentStep', () => {
    it('should return the running step', () => {
      const execution: ExecutionStatus = {
        execution_id: 'exec-1',
        execution_type: 'map_plan',
        name: 'Test Execution',
        status: 'running',
        current_step_index: 1,
        total_steps: 3,
        progress_percent: 33,
        started_at: '2026-01-24T10:00:00Z',
        steps: [
          {
            step_id: 'step-1',
            step_index: 0,
            step_name: 'Step 1',
            step_type: 'llm_call',
            status: 'completed',
          },
          {
            step_id: 'step-2',
            step_index: 1,
            step_name: 'Step 2',
            step_type: 'tool_call',
            status: 'running',
          },
          {
            step_id: 'step-3',
            step_index: 2,
            step_name: 'Step 3',
            step_type: 'llm_call',
            status: 'pending',
          },
        ],
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:01:00Z',
      };
      const current = ExecutionHelpers.getCurrentStep(execution);
      expect(current).toBeDefined();
      expect(current?.step_id).toBe('step-2');
    });

    it('should return undefined when no running step', () => {
      const execution: ExecutionStatus = {
        execution_id: 'exec-1',
        execution_type: 'map_plan',
        name: 'Test Execution',
        status: 'completed',
        current_step_index: 2,
        total_steps: 2,
        progress_percent: 100,
        started_at: '2026-01-24T10:00:00Z',
        steps: [
          {
            step_id: 'step-1',
            step_index: 0,
            step_name: 'Step 1',
            step_type: 'llm_call',
            status: 'completed',
          },
          {
            step_id: 'step-2',
            step_index: 1,
            step_name: 'Step 2',
            step_type: 'llm_call',
            status: 'completed',
          },
        ],
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:02:00Z',
      };
      expect(ExecutionHelpers.getCurrentStep(execution)).toBeUndefined();
    });
  });

  describe('calculateTotalCost', () => {
    it('should return 0 for empty steps', () => {
      expect(ExecutionHelpers.calculateTotalCost([])).toBe(0);
    });

    it('should sum costs from all steps', () => {
      const steps: UnifiedStepStatus[] = [
        {
          step_id: 'step-1',
          step_index: 0,
          step_name: 'Step 1',
          step_type: 'llm_call',
          status: 'completed',
          cost_usd: 0.05,
        },
        {
          step_id: 'step-2',
          step_index: 1,
          step_name: 'Step 2',
          step_type: 'llm_call',
          status: 'completed',
          cost_usd: 0.1,
        },
      ];
      expect(ExecutionHelpers.calculateTotalCost(steps)).toBeCloseTo(0.15, 5);
    });

    it('should handle steps with undefined cost', () => {
      const steps: UnifiedStepStatus[] = [
        {
          step_id: 'step-1',
          step_index: 0,
          step_name: 'Step 1',
          step_type: 'llm_call',
          status: 'completed',
          cost_usd: 0.05,
        },
        {
          step_id: 'step-2',
          step_index: 1,
          step_name: 'Step 2',
          step_type: 'tool_call',
          status: 'completed',
        },
      ];
      expect(ExecutionHelpers.calculateTotalCost(steps)).toBe(0.05);
    });
  });

  describe('isMapPlan', () => {
    it('should return true for map_plan type', () => {
      const execution: ExecutionStatus = {
        execution_id: 'exec-1',
        execution_type: 'map_plan',
        name: 'Test',
        status: 'running',
        current_step_index: 0,
        total_steps: 1,
        progress_percent: 0,
        started_at: '2026-01-24T10:00:00Z',
        steps: [],
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:00:00Z',
      };
      expect(ExecutionHelpers.isMapPlan(execution)).toBe(true);
    });

    it('should return false for wcp_workflow type', () => {
      const execution: ExecutionStatus = {
        execution_id: 'exec-1',
        execution_type: 'wcp_workflow',
        name: 'Test',
        status: 'running',
        current_step_index: 0,
        total_steps: 1,
        progress_percent: 0,
        started_at: '2026-01-24T10:00:00Z',
        steps: [],
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:00:00Z',
      };
      expect(ExecutionHelpers.isMapPlan(execution)).toBe(false);
    });
  });

  describe('isWcpWorkflow', () => {
    it('should return true for wcp_workflow type', () => {
      const execution: ExecutionStatus = {
        execution_id: 'exec-1',
        execution_type: 'wcp_workflow',
        name: 'Test',
        status: 'running',
        current_step_index: 0,
        total_steps: 1,
        progress_percent: 0,
        started_at: '2026-01-24T10:00:00Z',
        steps: [],
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:00:00Z',
      };
      expect(ExecutionHelpers.isWcpWorkflow(execution)).toBe(true);
    });

    it('should return false for map_plan type', () => {
      const execution: ExecutionStatus = {
        execution_id: 'exec-1',
        execution_type: 'map_plan',
        name: 'Test',
        status: 'running',
        current_step_index: 0,
        total_steps: 1,
        progress_percent: 0,
        started_at: '2026-01-24T10:00:00Z',
        steps: [],
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:00:00Z',
      };
      expect(ExecutionHelpers.isWcpWorkflow(execution)).toBe(false);
    });
  });
});

describe('Execution Types', () => {
  describe('ExecutionType', () => {
    it('should have map_plan value', () => {
      const type: ExecutionType = 'map_plan';
      expect(type).toBe('map_plan');
    });

    it('should have wcp_workflow value', () => {
      const type: ExecutionType = 'wcp_workflow';
      expect(type).toBe('wcp_workflow');
    });
  });

  describe('ExecutionStatusValue', () => {
    const validStatuses: ExecutionStatusValue[] = [
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled',
      'aborted',
      'expired',
    ];

    it.each(validStatuses)('should accept %s as valid status', (status) => {
      const value: ExecutionStatusValue = status;
      expect(value).toBe(status);
    });
  });

  describe('StepStatusValue', () => {
    const validStatuses: StepStatusValue[] = [
      'pending',
      'running',
      'completed',
      'failed',
      'skipped',
      'blocked',
      'approval',
    ];

    it.each(validStatuses)('should accept %s as valid status', (status) => {
      const value: StepStatusValue = status;
      expect(value).toBe(status);
    });
  });

  describe('UnifiedStepType', () => {
    const validTypes: UnifiedStepType[] = [
      'llm_call',
      'tool_call',
      'connector_call',
      'human_task',
      'synthesis',
      'action',
      'gate',
    ];

    it.each(validTypes)('should accept %s as valid type', (type) => {
      const value: UnifiedStepType = type;
      expect(value).toBe(type);
    });
  });

  describe('UnifiedGateDecision', () => {
    const validDecisions: UnifiedGateDecision[] = ['allow', 'block', 'require_approval'];

    it.each(validDecisions)('should accept %s as valid decision', (decision) => {
      const value: UnifiedGateDecision = decision;
      expect(value).toBe(decision);
    });
  });

  describe('UnifiedApprovalStatus', () => {
    const validStatuses: UnifiedApprovalStatus[] = ['pending', 'approved', 'rejected'];

    it.each(validStatuses)('should accept %s as valid status', (status) => {
      const value: UnifiedApprovalStatus = status;
      expect(value).toBe(status);
    });
  });
});
