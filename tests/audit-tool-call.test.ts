/**
 * Tests for auditToolCall method
 * Part of Issue #1260 - Audit non-LLM tool calls
 */

import { AxonFlow } from '../src/client';
import type { AuditToolCallRequest } from '../src/types/gateway';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('auditToolCall', () => {
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

  it('should audit a tool call with all fields', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({
        audit_id: 'audit-tc-001',
        status: 'recorded',
        timestamp: '2026-03-14T10:00:00Z',
      })
    );

    const request: AuditToolCallRequest = {
      toolName: 'search_database',
      toolType: 'function',
      input: { query: 'SELECT * FROM users' },
      output: { rows: 42 },
      workflowId: 'wf-123',
      stepId: 'step-1',
      userId: 'user-456',
      durationMs: 150,
      policiesApplied: ['policy-1', 'policy-2'],
      success: true,
    };

    const result = await client.auditToolCall(request);

    expect(result.auditId).toBe('audit-tc-001');
    expect(result.status).toBe('recorded');
    expect(result.timestamp).toBe('2026-03-14T10:00:00Z');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/audit/tool-call',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"tool_name":"search_database"'),
      })
    );

    // Verify snake_case body serialization
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tool_name).toBe('search_database');
    expect(callBody.tool_type).toBe('function');
    expect(callBody.input).toEqual({ query: 'SELECT * FROM users' });
    expect(callBody.output).toEqual({ rows: 42 });
    expect(callBody.workflow_id).toBe('wf-123');
    expect(callBody.step_id).toBe('step-1');
    expect(callBody.user_id).toBe('user-456');
    expect(callBody.duration_ms).toBe(150);
    expect(callBody.policies_applied).toEqual(['policy-1', 'policy-2']);
    expect(callBody.success).toBe(true);
  });

  it('should audit a tool call with only required fields', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({
        audit_id: 'audit-tc-002',
        status: 'recorded',
        timestamp: '2026-03-14T10:01:00Z',
      })
    );

    const result = await client.auditToolCall({ toolName: 'ping' });

    expect(result.auditId).toBe('audit-tc-002');
    expect(result.status).toBe('recorded');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tool_name).toBe('ping');
    // Optional fields should not be present
    expect(callBody.tool_type).toBeUndefined();
    expect(callBody.input).toBeUndefined();
    expect(callBody.output).toBeUndefined();
    expect(callBody.workflow_id).toBeUndefined();
    expect(callBody.step_id).toBeUndefined();
    expect(callBody.user_id).toBeUndefined();
    expect(callBody.duration_ms).toBeUndefined();
    expect(callBody.policies_applied).toBeUndefined();
    expect(callBody.success).toBeUndefined();
    expect(callBody.error_message).toBeUndefined();
  });

  it('should throw ConfigurationError for empty tool_name', async () => {
    await expect(client.auditToolCall({ toolName: '' })).rejects.toThrow('tool_name is required');
  });

  it('should handle server error (500)', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ error: 'internal error' }, 500));

    await expect(client.auditToolCall({ toolName: 'search_database' })).rejects.toThrow();
  });

  it('should handle authentication error (401)', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));

    await expect(client.auditToolCall({ toolName: 'search_database' })).rejects.toThrow();
  });

  // Regression test for getaxonflow/axonflow-enterprise#2275: 401 must be
  // terminal — the SDK MUST NOT retry an auth failure, because retrying
  // with the same invalid token just compounds the storm on the agent
  // (716 × 401 / 24h observed from one source IP against community-saas
  // on 2026-05-19, ~30/hour, not human pacing).
  //
  // TypeScript SDK is structurally safe: `orchestratorRequest` calls
  // `_fetch` exactly once and throws `AuthenticationError` on 401 or 403
  // without a retry loop. This test makes the contract explicit by
  // asserting `mockFetch` was invoked exactly once.
  it('must not retry on 401 — regression for issue #2275', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));

    await expect(client.auditToolCall({ toolName: 'search_database' })).rejects.toThrow();

    // Exactly one outbound fetch — no retry. If a future change to
    // `orchestratorRequest` or `_fetch` adds status-code-based retry
    // that includes 401, this assertion fails.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should include error_message for failed tool calls', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({
        audit_id: 'audit-tc-003',
        status: 'recorded',
        timestamp: '2026-03-14T10:02:00Z',
      })
    );

    await client.auditToolCall({
      toolName: 'fetch_data',
      success: false,
      errorMessage: 'Connection timed out',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.success).toBe(false);
    expect(callBody.error_message).toBe('Connection timed out');
  });
});
