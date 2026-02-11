/**
 * Tests for unified execution types, helpers, and SSE streaming.
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
  StreamExecutionStatusOptions,
} from '../src/types/execution';
import { AxonFlow } from '../src/client';
import { ConfigurationError, AuthenticationError, APIError } from '../src/errors';

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

    it.each(validStatuses)('should accept %s as valid status', status => {
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

    it.each(validStatuses)('should accept %s as valid status', status => {
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

    it.each(validTypes)('should accept %s as valid type', type => {
      const value: UnifiedStepType = type;
      expect(value).toBe(type);
    });
  });

  describe('UnifiedGateDecision', () => {
    const validDecisions: UnifiedGateDecision[] = ['allow', 'block', 'require_approval'];

    it.each(validDecisions)('should accept %s as valid decision', decision => {
      const value: UnifiedGateDecision = decision;
      expect(value).toBe(decision);
    });
  });

  describe('UnifiedApprovalStatus', () => {
    const validStatuses: UnifiedApprovalStatus[] = ['pending', 'approved', 'rejected'];

    it.each(validStatuses)('should accept %s as valid status', status => {
      const value: UnifiedApprovalStatus = status;
      expect(value).toBe(status);
    });
  });
});

describe('StreamExecutionStatusOptions', () => {
  it('should be a valid type with optional signal', () => {
    const opts: StreamExecutionStatusOptions = {};
    expect(opts.signal).toBeUndefined();

    const controller = new AbortController();
    const optsWithSignal: StreamExecutionStatusOptions = { signal: controller.signal };
    expect(optsWithSignal.signal).toBeDefined();
  });
});

// Helper to create a ReadableStream from SSE event strings
function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function makeExecutionStatusEvent(overrides: Partial<ExecutionStatus>): ExecutionStatus {
  return {
    execution_id: 'exec_123',
    execution_type: 'map_plan',
    name: 'Test Execution',
    status: 'running',
    current_step_index: 0,
    total_steps: 3,
    progress_percent: 0,
    started_at: '2026-02-07T10:00:00Z',
    steps: [],
    created_at: '2026-02-07T10:00:00Z',
    updated_at: '2026-02-07T10:00:00Z',
    ...overrides,
  };
}

describe('streamExecutionStatus', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  let client: AxonFlow;

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockFetch.mockClear();
    client = new AxonFlow({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      endpoint: 'http://localhost:8080',
    });
  });

  it('should throw ConfigurationError for empty executionId', async () => {
    await expect(client.streamExecutionStatus('', () => {})).rejects.toThrow(ConfigurationError);
  });

  it('should throw AuthenticationError on 401 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(client.streamExecutionStatus('exec_123', () => {})).rejects.toThrow(
      AuthenticationError
    );
  });

  it('should throw AuthenticationError on 403 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(client.streamExecutionStatus('exec_123', () => {})).rejects.toThrow(
      AuthenticationError
    );
  });

  it('should throw APIError on 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Execution not found'),
    });

    await expect(client.streamExecutionStatus('exec_123', () => {})).rejects.toThrow(APIError);
  });

  it('should throw APIError on 500 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
    });

    await expect(client.streamExecutionStatus('exec_123', () => {})).rejects.toThrow(APIError);
  });

  it('should throw APIError when response has no body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: null,
    });

    await expect(client.streamExecutionStatus('exec_123', () => {})).rejects.toThrow(APIError);
  });

  it('should stream execution status updates and stop on terminal status', async () => {
    const runningStatus = makeExecutionStatusEvent({
      status: 'running',
      progress_percent: 33,
    });
    const completedStatus = makeExecutionStatusEvent({
      status: 'completed',
      progress_percent: 100,
    });

    const sseData = createSSEStream([
      `data: ${JSON.stringify(runningStatus)}\n\n`,
      `data: ${JSON.stringify(completedStatus)}\n\n`,
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    expect(updates).toHaveLength(2);
    expect(updates[0].status).toBe('running');
    expect(updates[0].progress_percent).toBe(33);
    expect(updates[1].status).toBe('completed');
    expect(updates[1].progress_percent).toBe(100);
  });

  it('should stop on failed terminal status', async () => {
    const failedStatus = makeExecutionStatusEvent({
      status: 'failed',
      error: 'Step 2 timed out',
    });

    const sseData = createSSEStream([`data: ${JSON.stringify(failedStatus)}\n\n`]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('failed');
    expect(updates[0].error).toBe('Step 2 timed out');
  });

  it('should stop on cancelled terminal status', async () => {
    const cancelledStatus = makeExecutionStatusEvent({
      status: 'cancelled',
    });

    const sseData = createSSEStream([`data: ${JSON.stringify(cancelledStatus)}\n\n`]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('cancelled');
  });

  it('should handle multiple events in a single chunk', async () => {
    const status1 = makeExecutionStatusEvent({
      status: 'running',
      progress_percent: 25,
      current_step_index: 0,
    });
    const status2 = makeExecutionStatusEvent({
      status: 'completed',
      progress_percent: 100,
      current_step_index: 2,
    });

    // Send both events in a single chunk
    const sseData = createSSEStream([
      `data: ${JSON.stringify(status1)}\n\ndata: ${JSON.stringify(status2)}\n\n`,
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    expect(updates).toHaveLength(2);
    expect(updates[0].progress_percent).toBe(25);
    expect(updates[1].progress_percent).toBe(100);
  });

  it('should skip [DONE] sentinel and empty data lines', async () => {
    const completedStatus = makeExecutionStatusEvent({
      status: 'completed',
    });

    const sseData = createSSEStream([
      `data: ${JSON.stringify(completedStatus)}\n\n`,
      `data: [DONE]\n\n`,
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    // Should only get the completed status, not the [DONE]
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('completed');
  });

  it('should handle abort signal gracefully on fetch', async () => {
    const controller = new AbortController();
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    mockFetch.mockRejectedValueOnce(abortError);
    controller.abort();

    // Should resolve without throwing
    await expect(
      client.streamExecutionStatus('exec_123', () => {}, { signal: controller.signal })
    ).resolves.toBeUndefined();
  });

  it('should pass correct URL and headers to fetch', async () => {
    const completedStatus = makeExecutionStatusEvent({
      status: 'completed',
    });

    const sseData = createSSEStream([`data: ${JSON.stringify(completedStatus)}\n\n`]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    await client.streamExecutionStatus('exec_123', () => {});

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:8080/api/v1/unified/executions/exec_123/stream');
    expect(calledOptions.method).toBe('GET');
    expect(calledOptions.headers['Accept']).toBe('text/event-stream');
    // Content-Type should not be set for SSE
    expect(calledOptions.headers['Content-Type']).toBeUndefined();
  });

  it('should handle stream that closes without terminal status', async () => {
    const runningStatus = makeExecutionStatusEvent({
      status: 'running',
      progress_percent: 50,
    });

    const sseData = createSSEStream([
      `data: ${JSON.stringify(runningStatus)}\n\n`,
      // Stream closes without terminal event
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    // Should have received the running update and then returned when stream closed
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('running');
  });

  it('should gracefully handle malformed JSON in SSE data', async () => {
    const completedStatus = makeExecutionStatusEvent({
      status: 'completed',
    });

    const sseData = createSSEStream([
      `data: {invalid json}\n\n`,
      `data: ${JSON.stringify(completedStatus)}\n\n`,
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseData,
    });

    const updates: ExecutionStatus[] = [];
    await client.streamExecutionStatus('exec_123', status => {
      updates.push(status);
    });

    // Should skip the malformed event and get the completed one
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('completed');
  });
});
