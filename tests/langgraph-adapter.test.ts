/**
 * Tests for AxonFlowLangGraphAdapter
 */

import { AxonFlow } from '../src/client';
import {
  AxonFlowLangGraphAdapter,
  WorkflowBlockedError,
  WorkflowApprovalRequiredError,
} from '../src/adapters/langgraph';
import { PolicyViolationError, AxonFlowError } from '../src/errors';
import type {
  CreateWorkflowResponse,
  StepGateResponse,
  WorkflowStatusResponse,
} from '../src/types/workflows';
import type { MCPCheckInputResponse, MCPCheckOutputResponse } from '../src/types/connector';

// Create a mock client with jest.fn() for each method
function createMockClient(): AxonFlow {
  return {
    createWorkflow: jest.fn(),
    stepGate: jest.fn(),
    markStepCompleted: jest.fn(),
    completeWorkflow: jest.fn(),
    abortWorkflow: jest.fn(),
    failWorkflow: jest.fn(),
    getWorkflow: jest.fn(),
    mcpCheckInput: jest.fn(),
    mcpCheckOutput: jest.fn(),
  } as unknown as AxonFlow;
}

describe('AxonFlowLangGraphAdapter', () => {
  let mockClient: AxonFlow;
  let adapter: AxonFlowLangGraphAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    adapter = new AxonFlowLangGraphAdapter(mockClient, 'test-workflow');
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('should set default source to langgraph', () => {
      expect(adapter.source).toBe('langgraph');
    });

    it('should set default autoBlock to true', () => {
      // We verify this by checking block behavior later
      expect(adapter.workflowName).toBe('test-workflow');
    });

    it('should accept custom source', () => {
      const custom = new AxonFlowLangGraphAdapter(mockClient, 'w', {
        source: 'crewai',
      });
      expect(custom.source).toBe('crewai');
    });

    it('should accept autoBlock=false', () => {
      const custom = new AxonFlowLangGraphAdapter(mockClient, 'w', {
        autoBlock: false,
      });
      expect(custom.workflowName).toBe('w');
    });

    it('should start with null workflowId', () => {
      expect(adapter.workflowId).toBeNull();
    });
  });

  // =========================================================================
  // startWorkflow
  // =========================================================================

  describe('startWorkflow', () => {
    it('should create workflow and store workflowId', async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-123',
        workflow_name: 'test-workflow',
        source: 'langgraph',
        status: 'in_progress',
        created_at: '2026-03-16T00:00:00Z',
      } as CreateWorkflowResponse);

      const id = await adapter.startWorkflow();

      expect(id).toBe('wf-123');
      expect(adapter.workflowId).toBe('wf-123');
      expect(mockClient.createWorkflow).toHaveBeenCalledWith({
        workflow_name: 'test-workflow',
        source: 'langgraph',
        metadata: {},
        trace_id: undefined,
      });
    });

    it('should pass metadata and traceId', async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-456',
      } as CreateWorkflowResponse);

      await adapter.startWorkflow({ env: 'prod' }, 'trace-abc');

      expect(mockClient.createWorkflow).toHaveBeenCalledWith({
        workflow_name: 'test-workflow',
        source: 'langgraph',
        metadata: { env: 'prod' },
        trace_id: 'trace-abc',
      });
    });
  });

  // =========================================================================
  // checkGate
  // =========================================================================

  describe('checkGate', () => {
    beforeEach(async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();
    });

    it('should throw if workflow not started', async () => {
      const fresh = new AxonFlowLangGraphAdapter(mockClient, 'w');
      await expect(fresh.checkGate('step1', 'llm_call')).rejects.toThrow('Workflow not started');
    });

    it('should return true on allow decision', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-generate',
      } as StepGateResponse);

      const result = await adapter.checkGate('generate', 'llm_call', {
        model: 'gpt-4',
      });

      expect(result).toBe(true);
      expect(mockClient.stepGate).toHaveBeenCalledWith(
        'wf-100',
        'step-1-generate',
        expect.objectContaining({
          step_name: 'generate',
          step_type: 'llm_call',
          model: 'gpt-4',
        })
      );
    });

    it('should auto-generate step IDs with counter', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-first',
      });
      await adapter.checkGate('first', 'llm_call');

      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-2-second',
      });
      await adapter.checkGate('second', 'tool_call');

      expect(mockClient.stepGate).toHaveBeenNthCalledWith(
        1,
        'wf-100',
        'step-1-first',
        expect.anything()
      );
      expect(mockClient.stepGate).toHaveBeenNthCalledWith(
        2,
        'wf-100',
        'step-2-second',
        expect.anything()
      );
    });

    it('should sanitize step names for step IDs', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-tools-web-search',
      });
      await adapter.checkGate('tools/Web Search', 'tool_call');

      expect(mockClient.stepGate).toHaveBeenCalledWith(
        'wf-100',
        'step-1-tools-web-search',
        expect.anything()
      );
    });

    it('should use provided stepId instead of auto-generating', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'custom-id',
      });

      await adapter.checkGate('step1', 'llm_call', { stepId: 'custom-id' });

      expect(mockClient.stepGate).toHaveBeenCalledWith('wf-100', 'custom-id', expect.anything());
    });

    it('should throw WorkflowBlockedError on block with autoBlock=true', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'block',
        step_id: 'step-1-gen',
        reason: 'PII detected',
        policy_ids: ['pol-1', 'pol-2'],
      } as StepGateResponse);

      await expect(adapter.checkGate('gen', 'llm_call')).rejects.toThrow(WorkflowBlockedError);

      try {
        await adapter.checkGate('gen2', 'llm_call');
      } catch {
        // The second call auto-increments counter, so step_id differs
        // but the mock returns same response
      }
    });

    it('should include fields on WorkflowBlockedError', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'block',
        step_id: 'step-1-gen',
        reason: 'PII detected',
        policy_ids: ['pol-1'],
      });

      try {
        await adapter.checkGate('gen', 'llm_call');
        fail('Expected WorkflowBlockedError');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowBlockedError);
        expect(err).toBeInstanceOf(AxonFlowError);
        const blocked = err as WorkflowBlockedError;
        expect(blocked.stepId).toBe('step-1-gen');
        expect(blocked.reason).toBe('PII detected');
        expect(blocked.policyIds).toEqual(['pol-1']);
        expect(blocked.message).toContain("Step 'gen' blocked");
      }
    });

    it('should return false on block with autoBlock=false', async () => {
      const noBlock = new AxonFlowLangGraphAdapter(mockClient, 'w', {
        autoBlock: false,
      });
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-200',
      });
      await noBlock.startWorkflow();

      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'block',
        step_id: 'step-1-s',
        reason: 'blocked',
        policy_ids: [],
      });

      const result = await noBlock.checkGate('s', 'llm_call');
      expect(result).toBe(false);
    });

    it('should throw WorkflowApprovalRequiredError on require_approval', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'require_approval',
        step_id: 'step-1-review',
        reason: 'Needs manager approval',
        approval_url: 'https://portal.example.com/approve/123',
      } as StepGateResponse);

      try {
        await adapter.checkGate('review', 'human_task');
        fail('Expected WorkflowApprovalRequiredError');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowApprovalRequiredError);
        expect(err).toBeInstanceOf(AxonFlowError);
        const approval = err as WorkflowApprovalRequiredError;
        expect(approval.stepId).toBe('step-1-review');
        expect(approval.approvalUrl).toBe('https://portal.example.com/approve/123');
        expect(approval.reason).toBe('Needs manager approval');
        expect(approval.message).toContain("Step 'review' requires approval");
      }
    });

    it('should pass stepInput and provider', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-s',
      });

      await adapter.checkGate('s', 'llm_call', {
        stepInput: { prompt: 'hello' },
        provider: 'openai',
      });

      expect(mockClient.stepGate).toHaveBeenCalledWith(
        'wf-100',
        'step-1-s',
        expect.objectContaining({
          step_input: { prompt: 'hello' },
          provider: 'openai',
        })
      );
    });
  });

  // =========================================================================
  // stepCompleted
  // =========================================================================

  describe('stepCompleted', () => {
    beforeEach(async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();
    });

    it('should throw if workflow not started', async () => {
      const fresh = new AxonFlowLangGraphAdapter(mockClient, 'w');
      await expect(fresh.stepCompleted('s')).rejects.toThrow('Workflow not started');
    });

    it('should call markStepCompleted with auto-generated stepId', async () => {
      // First check gate to increment counter
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-gen',
      });
      await adapter.checkGate('gen', 'llm_call');

      await adapter.stepCompleted('gen');

      expect(mockClient.markStepCompleted).toHaveBeenCalledWith(
        'wf-100',
        'step-1-gen',
        expect.objectContaining({
          output: {},
          metadata: {},
        })
      );
    });

    it('should pass all optional fields', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-s',
      });
      await adapter.checkGate('s', 'llm_call');

      await adapter.stepCompleted('s', {
        output: { result: 'ok' },
        metadata: { key: 'val' },
        tokensIn: 100,
        tokensOut: 200,
        costUsd: 0.05,
      });

      expect(mockClient.markStepCompleted).toHaveBeenCalledWith('wf-100', 'step-1-s', {
        output: { result: 'ok' },
        metadata: { key: 'val' },
        tokens_in: 100,
        tokens_out: 200,
        cost_usd: 0.05,
      });
    });

    it('should use provided stepId', async () => {
      await adapter.stepCompleted('s', { stepId: 'my-custom-id' });

      expect(mockClient.markStepCompleted).toHaveBeenCalledWith(
        'wf-100',
        'my-custom-id',
        expect.anything()
      );
    });
  });

  // =========================================================================
  // checkToolGate
  // =========================================================================

  describe('checkToolGate', () => {
    beforeEach(async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();
    });

    it('should build ToolContext and call stepGate with tool_call', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-tools-web-search',
      });

      const result = await adapter.checkToolGate('web_search', 'function', {
        toolInput: { query: 'news' },
      });

      expect(result).toBe(true);
      expect(mockClient.stepGate).toHaveBeenCalledWith(
        'wf-100',
        'step-1-tools-web_search',
        expect.objectContaining({
          step_name: 'tools/web_search',
          step_type: 'tool_call',
          tool_context: {
            tool_name: 'web_search',
            tool_type: 'function',
            tool_input: { query: 'news' },
          },
        })
      );
    });

    it('should use custom stepName', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-custom',
      });

      await adapter.checkToolGate('search', undefined, {
        stepName: 'custom',
      });

      expect(mockClient.stepGate).toHaveBeenCalledWith(
        'wf-100',
        'step-1-custom',
        expect.objectContaining({
          step_name: 'custom',
          step_type: 'tool_call',
        })
      );
    });

    it('should default toolType to undefined', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-tools-ping',
      });

      await adapter.checkToolGate('ping');

      expect(mockClient.stepGate).toHaveBeenCalledWith(
        'wf-100',
        'step-1-tools-ping',
        expect.objectContaining({
          tool_context: {
            tool_name: 'ping',
            tool_type: undefined,
            tool_input: {},
          },
        })
      );
    });
  });

  // =========================================================================
  // toolCompleted
  // =========================================================================

  describe('toolCompleted', () => {
    beforeEach(async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();
    });

    it('should call stepCompleted with tools/ prefix', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-tools-search',
      });
      await adapter.checkToolGate('search');

      await adapter.toolCompleted('search', {
        output: { results: ['a'] },
        tokensIn: 50,
        tokensOut: 100,
        costUsd: 0.01,
      });

      expect(mockClient.markStepCompleted).toHaveBeenCalledWith(
        'wf-100',
        'step-1-tools-search',
        expect.objectContaining({
          output: { results: ['a'] },
          tokens_in: 50,
          tokens_out: 100,
          cost_usd: 0.01,
        })
      );
    });

    it('should use custom stepName', async () => {
      (mockClient.stepGate as jest.Mock).mockResolvedValue({
        decision: 'allow',
        step_id: 'step-1-custom',
      });
      await adapter.checkGate('custom', 'tool_call');

      await adapter.toolCompleted('search', { stepName: 'custom' });

      expect(mockClient.markStepCompleted).toHaveBeenCalledWith(
        'wf-100',
        'step-1-custom',
        expect.anything()
      );
    });
  });

  // =========================================================================
  // Lifecycle methods
  // =========================================================================

  describe('completeWorkflow', () => {
    it('should throw if workflow not started', async () => {
      await expect(adapter.completeWorkflow()).rejects.toThrow('Workflow not started');
    });

    it('should call client.completeWorkflow', async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();

      await adapter.completeWorkflow();
      expect(mockClient.completeWorkflow).toHaveBeenCalledWith('wf-100');
    });
  });

  describe('abortWorkflow', () => {
    it('should throw if workflow not started', async () => {
      await expect(adapter.abortWorkflow()).rejects.toThrow('Workflow not started');
    });

    it('should call client.abortWorkflow with reason', async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();

      await adapter.abortWorkflow('user cancelled');
      expect(mockClient.abortWorkflow).toHaveBeenCalledWith('wf-100', 'user cancelled');
    });

    it('should call client.abortWorkflow without reason', async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();

      await adapter.abortWorkflow();
      expect(mockClient.abortWorkflow).toHaveBeenCalledWith('wf-100', undefined);
    });
  });

  describe('failWorkflow', () => {
    it('should throw if workflow not started', async () => {
      await expect(adapter.failWorkflow()).rejects.toThrow('Workflow not started');
    });

    it('should call client.failWorkflow with reason', async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();

      await adapter.failWorkflow('pipeline crashed');
      expect(mockClient.failWorkflow).toHaveBeenCalledWith('wf-100', 'pipeline crashed');
    });
  });

  // =========================================================================
  // waitForApproval
  // =========================================================================

  describe('waitForApproval', () => {
    beforeEach(async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();
    });

    it('should throw if workflow not started', async () => {
      const fresh = new AxonFlowLangGraphAdapter(mockClient, 'w');
      await expect(fresh.waitForApproval('step-1')).rejects.toThrow('Workflow not started');
    });

    it('should return true when step is approved', async () => {
      (mockClient.getWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
        steps: [
          {
            step_id: 'step-1',
            approval_status: 'approved',
          },
        ],
      } as unknown as WorkflowStatusResponse);

      const result = await adapter.waitForApproval('step-1', {
        pollInterval: 0.01,
        timeout: 1,
      });
      expect(result).toBe(true);
    });

    it('should return false when step is rejected', async () => {
      (mockClient.getWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
        steps: [
          {
            step_id: 'step-1',
            approval_status: 'rejected',
          },
        ],
      } as unknown as WorkflowStatusResponse);

      const result = await adapter.waitForApproval('step-1', {
        pollInterval: 0.01,
        timeout: 1,
      });
      expect(result).toBe(false);
    });

    it('should poll until approved', async () => {
      let callCount = 0;
      (mockClient.getWorkflow as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            workflow_id: 'wf-100',
            steps: [{ step_id: 'step-1', approval_status: 'pending' }],
          };
        }
        return {
          workflow_id: 'wf-100',
          steps: [{ step_id: 'step-1', approval_status: 'approved' }],
        };
      });

      const result = await adapter.waitForApproval('step-1', {
        pollInterval: 0.01,
        timeout: 5,
      });
      expect(result).toBe(true);
      expect(callCount).toBe(3);
    });

    it('should throw on timeout', async () => {
      (mockClient.getWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
        steps: [{ step_id: 'step-1', approval_status: 'pending' }],
      });

      await expect(
        adapter.waitForApproval('step-1', {
          pollInterval: 0.01,
          timeout: 0.03,
        })
      ).rejects.toThrow('timed out');
    });

    it('should handle missing steps array', async () => {
      (mockClient.getWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
        // no steps field
      });

      await expect(
        adapter.waitForApproval('step-1', {
          pollInterval: 0.01,
          timeout: 0.03,
        })
      ).rejects.toThrow('timed out');
    });

    it('should handle step not found in steps list', async () => {
      (mockClient.getWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
        steps: [{ step_id: 'other-step', approval_status: 'approved' }],
      });

      await expect(
        adapter.waitForApproval('step-1', {
          pollInterval: 0.01,
          timeout: 0.03,
        })
      ).rejects.toThrow('timed out');
    });
  });

  // =========================================================================
  // mcpToolInterceptor
  // =========================================================================

  describe('mcpToolInterceptor', () => {
    beforeEach(async () => {
      (mockClient.createWorkflow as jest.Mock).mockResolvedValue({
        workflow_id: 'wf-100',
      });
      await adapter.startWorkflow();
    });

    const makeRequest = (overrides?: Record<string, any>) => ({
      serverName: 'my-server',
      name: 'search',
      args: { query: 'test' },
      ...overrides,
    });

    it('should pass through on allowed input and output', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 3,
      } as MCPCheckInputResponse);

      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 2,
      } as MCPCheckOutputResponse);

      const handler = jest.fn().mockResolvedValue({ results: ['a', 'b'] });
      const interceptor = adapter.mcpToolInterceptor();
      const result = await interceptor(makeRequest(), handler);

      expect(result).toEqual({ results: ['a', 'b'] });
      expect(handler).toHaveBeenCalledWith(makeRequest());

      // Verify input check
      expect(mockClient.mcpCheckInput).toHaveBeenCalledWith({
        connectorType: 'my-server.search',
        statement: 'my-server.search({"query":"test"})',
        operation: 'execute',
        parameters: { query: 'test' },
      });

      // Verify output check
      expect(mockClient.mcpCheckOutput).toHaveBeenCalledWith({
        connectorType: 'my-server.search',
        message: '{"results":["a","b"]}',
      });
    });

    it('should throw PolicyViolationError when input is blocked', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: false,
        block_reason: 'Forbidden query pattern',
        policies_evaluated: 1,
      } as MCPCheckInputResponse);

      const handler = jest.fn();
      const interceptor = adapter.mcpToolInterceptor();

      await expect(interceptor(makeRequest(), handler)).rejects.toThrow(PolicyViolationError);

      try {
        await interceptor(makeRequest(), handler);
      } catch (err) {
        expect((err as PolicyViolationError).blockReason).toBe('Forbidden query pattern');
      }

      // Handler should not have been called
      expect(handler).not.toHaveBeenCalled();
    });

    it('should use fallback message when block_reason is missing', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: false,
        policies_evaluated: 1,
      } as MCPCheckInputResponse);

      const handler = jest.fn();
      const interceptor = adapter.mcpToolInterceptor();

      try {
        await interceptor(makeRequest(), handler);
        fail('Expected PolicyViolationError');
      } catch (err) {
        expect((err as PolicyViolationError).blockReason).toBe('Tool call blocked by policy');
      }
    });

    it('should throw PolicyViolationError when output is blocked', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: false,
        block_reason: 'PII in response',
        policies_evaluated: 1,
      } as MCPCheckOutputResponse);

      const handler = jest.fn().mockResolvedValue({ data: 'sensitive' });
      const interceptor = adapter.mcpToolInterceptor();

      try {
        await interceptor(makeRequest(), handler);
        fail('Expected PolicyViolationError');
      } catch (err) {
        expect((err as PolicyViolationError).blockReason).toBe('PII in response');
      }
    });

    it('should use fallback message when output block_reason is missing', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: false,
        policies_evaluated: 1,
      } as MCPCheckOutputResponse);

      const handler = jest.fn().mockResolvedValue('data');
      const interceptor = adapter.mcpToolInterceptor();

      try {
        await interceptor(makeRequest(), handler);
        fail('Expected PolicyViolationError');
      } catch (err) {
        expect((err as PolicyViolationError).blockReason).toBe('Tool result blocked by policy');
      }
    });

    it('should return redacted_data when present', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: true,
        redacted_data: { name: '***', ssn: '***' },
        policies_evaluated: 2,
      } as MCPCheckOutputResponse);

      const handler = jest.fn().mockResolvedValue({ name: 'Alice', ssn: '123' });
      const interceptor = adapter.mcpToolInterceptor();
      const result = await interceptor(makeRequest(), handler);

      expect(result).toEqual({ name: '***', ssn: '***' });
    });

    it('should use custom connectorTypeFn', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });
      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      const handler = jest.fn().mockResolvedValue('ok');
      const interceptor = adapter.mcpToolInterceptor({
        connectorTypeFn: (req: any) => req.serverName,
      });

      await interceptor(makeRequest(), handler);

      expect(mockClient.mcpCheckInput).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorType: 'my-server',
          statement: 'my-server({"query":"test"})',
        })
      );
    });

    it('should use custom operation', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });
      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      const handler = jest.fn().mockResolvedValue('ok');
      const interceptor = adapter.mcpToolInterceptor({ operation: 'query' });

      await interceptor(makeRequest(), handler);

      expect(mockClient.mcpCheckInput).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'query',
        })
      );
    });

    it('should handle empty args', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });
      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      const handler = jest.fn().mockResolvedValue('ok');
      const interceptor = adapter.mcpToolInterceptor();
      const request = makeRequest({ args: null });

      await interceptor(request, handler);

      expect(mockClient.mcpCheckInput).toHaveBeenCalledWith(
        expect.objectContaining({
          statement: 'my-server.search({})',
          parameters: null,
        })
      );
    });

    it('should handle non-serializable result gracefully', async () => {
      (mockClient.mcpCheckInput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });
      (mockClient.mcpCheckOutput as jest.Mock).mockResolvedValue({
        allowed: true,
        policies_evaluated: 1,
      });

      // Create a circular reference to force JSON.stringify to fail
      const circular: any = { a: 1 };
      circular.self = circular;

      const handler = jest.fn().mockResolvedValue(circular);
      const interceptor = adapter.mcpToolInterceptor();

      const result = await interceptor(makeRequest(), handler);
      expect(result).toBe(circular);

      // The output check should have received String(circular) as message
      expect(mockClient.mcpCheckOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorType: 'my-server.search',
          message: '[object Object]',
        })
      );
    });
  });

  // =========================================================================
  // Error class hierarchy
  // =========================================================================

  describe('error classes', () => {
    it('WorkflowBlockedError should extend AxonFlowError', () => {
      const err = new WorkflowBlockedError('blocked', 'step-1', 'reason', ['p1']);
      expect(err).toBeInstanceOf(AxonFlowError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorkflowBlockedError');
    });

    it('WorkflowBlockedError should default policyIds to empty array', () => {
      const err = new WorkflowBlockedError('blocked');
      expect(err.policyIds).toEqual([]);
      expect(err.stepId).toBeUndefined();
      expect(err.reason).toBeUndefined();
    });

    it('WorkflowApprovalRequiredError should extend AxonFlowError', () => {
      const err = new WorkflowApprovalRequiredError(
        'approval needed',
        'step-1',
        'https://url',
        'reason'
      );
      expect(err).toBeInstanceOf(AxonFlowError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorkflowApprovalRequiredError');
      expect(err.stepId).toBe('step-1');
      expect(err.approvalUrl).toBe('https://url');
      expect(err.reason).toBe('reason');
    });
  });
});
