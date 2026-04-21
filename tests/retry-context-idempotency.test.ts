/**
 * Unit tests for WCP retry_context + idempotency_key (#1673 Phase 1 + 2).
 * Mirrors the six shapes from §6.8 of WCP_RETRY_IDEMPOTENCY_WIRE_CONTRACT.md.
 */

import { AxonFlow } from '../src/client';
import { IdempotencyKeyMismatchError } from '../src/errors';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const mockResponse = (data: unknown, status = 200) => {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : 'Conflict',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
};

describe('retry_context + idempotency_key (#1673)', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 't',
      clientSecret: 's',
      tenant: 'test',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Test a: first-call response shape
  it('first-call shape: gate_count===1, prior_completion_status==="none", timestamps equal', async () => {
    const now = '2026-04-21T15:30:45.123Z';
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        decision: 'allow',
        step_id: 'step_1',
        cached: false,
        decision_source: 'fresh',
        retry_context: {
          gate_count: 1,
          completion_count: 0,
          prior_completion_status: 'none',
          prior_output_available: false,
          prior_output: null,
          prior_completion_at: null,
          first_attempt_at: now,
          last_attempt_at: now,
          last_decision: 'allow',
          idempotency_key: '',
        },
      })
    );

    const gate = await client.stepGate('wf_1', 'step_1', { step_type: 'llm_call' });

    expect(gate.retry_context.gate_count).toBe(1);
    expect(gate.retry_context.completion_count).toBe(0);
    expect(gate.retry_context.prior_completion_status).toBe('none');
    expect(gate.retry_context.prior_output_available).toBe(false);
    expect(gate.retry_context.prior_output).toBeNull();
    expect(gate.retry_context.prior_completion_at).toBeNull();
    expect(gate.retry_context.first_attempt_at).toBe(gate.retry_context.last_attempt_at);
    expect(gate.retry_context.last_decision).toBe(gate.decision);
    expect(gate.retry_context.idempotency_key).toBe('');

    // Default call — no query string
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/v1/workflows/wf_1/steps/step_1/gate');
  });

  // Test b: second-call after completion
  it('second-call after completion: gate_count===2, completion_count===1, status=completed', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        decision: 'allow',
        step_id: 'step_1',
        retry_context: {
          gate_count: 2,
          completion_count: 1,
          prior_completion_status: 'completed',
          prior_output_available: true,
          prior_output: null,
          prior_completion_at: '2026-04-21T15:30:30.000Z',
          first_attempt_at: '2026-04-21T15:30:00.000Z',
          last_attempt_at: '2026-04-21T15:31:00.000Z',
          last_decision: 'allow',
          idempotency_key: '',
        },
      })
    );

    const gate = await client.stepGate('wf_1', 'step_1', { step_type: 'llm_call' });
    expect(gate.retry_context.gate_count).toBe(2);
    expect(gate.retry_context.completion_count).toBe(1);
    expect(gate.retry_context.prior_completion_status).toBe('completed');
    expect(gate.retry_context.prior_output_available).toBe(true);
    expect(gate.retry_context.prior_completion_at).not.toBeNull();
    expect(gate.retry_context.first_attempt_at).not.toBe(gate.retry_context.last_attempt_at);
  });

  // Test c: second-call without completion
  it('second-call without completion: status=gated_not_completed, output unavailable', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        decision: 'allow',
        step_id: 'step_1',
        retry_context: {
          gate_count: 2,
          completion_count: 0,
          prior_completion_status: 'gated_not_completed',
          prior_output_available: false,
          prior_output: null,
          prior_completion_at: null,
          first_attempt_at: '2026-04-21T15:30:00.000Z',
          last_attempt_at: '2026-04-21T15:31:00.000Z',
          last_decision: 'allow',
          idempotency_key: '',
        },
      })
    );

    const gate = await client.stepGate('wf_1', 'step_1', { step_type: 'llm_call' });
    expect(gate.retry_context.gate_count).toBe(2);
    expect(gate.retry_context.completion_count).toBe(0);
    expect(gate.retry_context.prior_completion_status).toBe('gated_not_completed');
    expect(gate.retry_context.prior_output_available).toBe(false);
    expect(gate.retry_context.prior_completion_at).toBeNull();
  });

  // Test d: include_prior_output=true populates prior_output
  it('includePriorOutput=true sends ?include_prior_output=true and carries prior_output', async () => {
    const priorOutput = { result: 'ok', score: 0.92 };
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        decision: 'allow',
        step_id: 'step_1',
        retry_context: {
          gate_count: 2,
          completion_count: 1,
          prior_completion_status: 'completed',
          prior_output_available: true,
          prior_output: priorOutput,
          prior_completion_at: '2026-04-21T15:30:30.000Z',
          first_attempt_at: '2026-04-21T15:30:00.000Z',
          last_attempt_at: '2026-04-21T15:31:00.000Z',
          last_decision: 'allow',
          idempotency_key: '',
        },
      })
    );

    const gate = await client.stepGate(
      'wf_1',
      'step_1',
      { step_type: 'llm_call' },
      { includePriorOutput: true }
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'http://localhost:8080/api/v1/workflows/wf_1/steps/step_1/gate?include_prior_output=true'
    );
    expect(gate.retry_context.prior_output).toEqual(priorOutput);
  });

  // Test e: idempotency key round-trip (gate → retry_context, then complete with same key)
  it('idempotency_key round-trip: gate sets it, retry_context echoes it, complete carries it', async () => {
    const key = 'payment:wire:acct4471:invoice-7721';

    mockFetch.mockResolvedValueOnce(
      mockResponse({
        decision: 'allow',
        step_id: 'step_1',
        retry_context: {
          gate_count: 1,
          completion_count: 0,
          prior_completion_status: 'none',
          prior_output_available: false,
          prior_output: null,
          prior_completion_at: null,
          first_attempt_at: '2026-04-21T15:30:00.000Z',
          last_attempt_at: '2026-04-21T15:30:00.000Z',
          last_decision: 'allow',
          idempotency_key: key,
        },
      })
    );
    mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204));

    const gate = await client.stepGate('wf_1', 'step_1', {
      step_type: 'llm_call',
      idempotency_key: key,
    });
    expect(gate.retry_context.idempotency_key).toBe(key);

    // Gate body should carry the key
    const gateBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(gateBody.idempotency_key).toBe(key);

    await client.markStepCompleted('wf_1', 'step_1', {
      output: { ok: true },
      idempotency_key: key,
    });
    const completeBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(completeBody.idempotency_key).toBe(key);
  });

  // Test f: 409 IDEMPOTENCY_KEY_MISMATCH surfaces as typed error
  it('markStepCompleted: 409 IDEMPOTENCY_KEY_MISMATCH throws IdempotencyKeyMismatchError with details', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        {
          error: {
            code: 'IDEMPOTENCY_KEY_MISMATCH',
            message: 'idempotency_key on complete does not match the key recorded on gate',
            details: {
              workflow_id: 'wf_41231a72',
              step_id: 'step-2',
              expected_idempotency_key: 'payment:wire:acct4471:invoice-7721',
              received_idempotency_key: 'payment:wire:acct4471:invoice-9999',
            },
          },
        },
        409
      )
    );

    expect.assertions(5);
    try {
      await client.markStepCompleted('wf_41231a72', 'step-2', {
        idempotency_key: 'payment:wire:acct4471:invoice-9999',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(IdempotencyKeyMismatchError);
      const idem = err as IdempotencyKeyMismatchError;
      expect(idem.workflowId).toBe('wf_41231a72');
      expect(idem.stepId).toBe('step-2');
      expect(idem.expectedIdempotencyKey).toBe('payment:wire:acct4471:invoice-7721');
      expect(idem.receivedIdempotencyKey).toBe('payment:wire:acct4471:invoice-9999');
    }
  });

  it('retry_context accepts null idempotency_key (contract §3: "string or null")', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        decision: 'allow',
        step_id: 'step_1',
        retry_context: {
          gate_count: 1,
          completion_count: 0,
          prior_completion_status: 'none',
          prior_output_available: false,
          prior_output: null,
          prior_completion_at: null,
          first_attempt_at: '2026-04-21T15:30:00.000Z',
          last_attempt_at: '2026-04-21T15:30:00.000Z',
          last_decision: 'allow',
          idempotency_key: null,
        },
      })
    );

    const gate = await client.stepGate('wf_1', 'step_1', { step_type: 'llm_call' });
    expect(gate.retry_context.idempotency_key).toBeNull();
  });

  it('stepGate: 409 IDEMPOTENCY_KEY_MISMATCH also surfaces as typed error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        {
          error: {
            code: 'IDEMPOTENCY_KEY_MISMATCH',
            message: 'mismatch',
            details: {
              workflow_id: 'wf_1',
              step_id: 's1',
              expected_idempotency_key: 'a',
              received_idempotency_key: 'b',
            },
          },
        },
        409
      )
    );

    expect.assertions(3);
    try {
      await client.stepGate('wf_1', 's1', { step_type: 'llm_call', idempotency_key: 'b' });
    } catch (err) {
      expect(err).toBeInstanceOf(IdempotencyKeyMismatchError);
      const idem = err as IdempotencyKeyMismatchError;
      expect(idem.expectedIdempotencyKey).toBe('a');
      expect(idem.receivedIdempotencyKey).toBe('b');
    }
  });
});
