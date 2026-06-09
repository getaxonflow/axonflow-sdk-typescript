/**
 * Unit tests for the Decision Mode PEP contract (ADR-056, epic #2563).
 *
 * Covers decide → fulfill → forward: the decide() parsing, the fulfillRequest()
 * fail-closed semantics, decideAndFulfill(), and the pure helpers. The
 * load-bearing property under test is that the PEP NEVER redacts locally and
 * fails CLOSED on every unfulfillable condition — it can only discharge a
 * redact_pii obligation by round-tripping content through the engine.
 */

import { AxonFlow } from '../src/client';
import { AuthenticationError, ObligationNotFulfillableError, APIError } from '../src/errors';
import {
  CONTENT_TYPE_TEXT,
  OBLIGATION_REDACT_PII,
  PHASE_REQUEST,
  PHASE_RESPONSE,
  VERDICT_ALLOW,
  endpointPathMatches,
  hasRequestRedaction,
  stripUndefined,
  type DecideResponse,
  type Obligation,
} from '../src/pep';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ENDPOINT = 'http://localhost:8080';
const DECIDE_URL = `${ENDPOINT}/api/v1/decide`;
const CHECK_INPUT_URL = `${ENDPOINT}/api/v1/mcp/check-input`;

// The exact obligation the real agent emits on /decide for a request carrying
// PII under a redact policy (verified live against an enterprise agent).
const REDACT_OBLIGATION: Obligation = {
  type: 'redact_pii',
  fulfillment: {
    endpoint: '/api/v1/mcp/check-input',
    method: 'POST',
    phase: 'request',
    content_types: ['text/plain'],
  },
};

function decideAllow(obligations: Obligation[]): Record<string, unknown> {
  return {
    verdict: 'allow',
    decision_id: 'dec-1',
    trace_id: '04110a0b50577bbbdda23a00dcbaf6da',
    obligations,
    evaluated_policies: ['sys_pii_email'],
    stage: 'tool',
    expires_at: '2026-06-09T05:05:06.801139966Z',
  };
}

const mockResponse = (data: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

function newClient(): AxonFlow {
  return new AxonFlow({
    endpoint: ENDPOINT,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    tenant: 'test-tenant',
  });
}

// Find the body of the Nth fetch call (0-indexed) as a parsed object.
function fetchBody(callIndex: number): Record<string, unknown> {
  const init = mockFetch.mock.calls[callIndex][1] as { body: string };
  return JSON.parse(init.body);
}

function fetchUrl(callIndex: number): string {
  return mockFetch.mock.calls[callIndex][0] as string;
}

describe('PEP pure helpers', () => {
  describe('hasRequestRedaction', () => {
    it('is true for a request-phase redact_pii obligation', () => {
      expect(hasRequestRedaction([REDACT_OBLIGATION])).toBe(true);
    });

    it('is false for a response-phase obligation', () => {
      const ob: Obligation = {
        type: OBLIGATION_REDACT_PII,
        fulfillment: { endpoint: '/api/v1/mcp/check-output', phase: PHASE_RESPONSE },
      };
      expect(hasRequestRedaction([ob])).toBe(false);
    });

    it('is false for an empty list', () => {
      expect(hasRequestRedaction([])).toBe(false);
    });

    it('is false for a redact_pii obligation with no fulfillment', () => {
      expect(hasRequestRedaction([{ type: OBLIGATION_REDACT_PII }])).toBe(false);
    });
  });

  describe('endpointPathMatches', () => {
    it.each([
      ['/api/v1/mcp/check-input', '/api/v1/mcp/check-input', true],
      ['https://pdp:8443/api/v1/mcp/check-input', '/api/v1/mcp/check-input', true],
      ['https://pdp/api/v1/mcp/check-input?x=1', '/api/v1/mcp/check-input', true],
      ['', '/api/v1/mcp/check-input', false],
      ['/api/v1/other', '/api/v1/mcp/check-input', false],
      ['https://evil.example.com/steal', '/api/v1/mcp/check-input', false],
    ])('endpointPathMatches(%s, %s) === %s', (endpoint, expected, want) => {
      expect(endpointPathMatches(endpoint as string, expected as string)).toBe(want);
    });
  });

  describe('stripUndefined', () => {
    it('drops undefined keys and empty nested objects', () => {
      const out = stripUndefined({
        stage: 'tool',
        query: 'hi',
        user_token: undefined,
        context: undefined,
        caller_identity: { gateway_id: undefined },
        target: { type: 'tool' },
      });
      expect(out).toEqual({ stage: 'tool', query: 'hi', target: { type: 'tool' } });
      expect('user_token' in out).toBe(false);
      expect('context' in out).toBe(false);
      expect('caller_identity' in out).toBe(false);
    });

    it('preserves falsy non-undefined values', () => {
      const out = stripUndefined({ a: '', b: 0, c: false, d: undefined });
      expect(out).toEqual({ a: '', b: 0, c: false });
    });
  });
});

describe('AxonFlow.decide', () => {
  let client: AxonFlow;
  beforeEach(() => {
    jest.clearAllMocks();
    client = newClient();
  });
  afterEach(() => jest.restoreAllMocks());

  it('parses obligations from the verdict', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(decideAllow([REDACT_OBLIGATION])));
    const resp = await client.decide({
      stage: 'tool',
      query: 'Email a@b.com',
      target: { type: 'tool' },
    });
    expect(resp.verdict).toBe(VERDICT_ALLOW);
    expect(resp.trace_id).toBe('04110a0b50577bbbdda23a00dcbaf6da');
    expect(resp.obligations).toHaveLength(1);
    const ob = resp.obligations[0];
    expect(ob.type).toBe(OBLIGATION_REDACT_PII);
    expect(ob.fulfillment?.endpoint).toBe('/api/v1/mcp/check-input');
    expect(ob.fulfillment?.phase).toBe(PHASE_REQUEST);
    expect(ob.fulfillment?.content_types).toEqual([CONTENT_TYPE_TEXT]);
    expect(fetchUrl(0)).toBe(DECIDE_URL);
  });

  it('normalizes a missing obligations field to an empty array', async () => {
    const body = decideAllow([]);
    delete body.obligations;
    mockFetch.mockReturnValueOnce(mockResponse(body));
    const resp = await client.decide({ stage: 'tool', query: 'hi' });
    expect(resp.obligations).toEqual([]);
  });

  it('throws AuthenticationError on 401', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ error: 'unauthorized' }, 401));
    await expect(client.decide({ stage: 'tool', query: 'hi' })).rejects.toThrow(
      AuthenticationError
    );
  });

  it('throws APIError on a 500', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ error: 'boom' }, 500));
    await expect(client.decide({ stage: 'tool', query: 'hi' })).rejects.toThrow(APIError);
  });

  it('omits undefined optional fields on the wire', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(decideAllow([])));
    await client.decide({ stage: 'tool', query: 'hi' });
    const body = fetchBody(0);
    expect(body.stage).toBe('tool');
    expect('user_token' in body).toBe(false);
    expect('context' in body).toBe(false);
  });

  it('returns a deny verdict in the body (not an error)', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ verdict: 'deny', decision_id: 'd2', obligations: [], reasons: ['blocked'] })
    );
    const resp = await client.decide({ stage: 'tool', query: 'leak sk-123' });
    expect(resp.verdict).toBe('deny');
    expect(resp.reasons).toEqual(['blocked']);
  });

  // FAIL CLOSED: a malformed/empty 200 body with no verdict must NOT default to
  // allow (that would let decideAndFulfill forward the original unredacted
  // query). Cross-SDK parity: Python/Rust raise, Go/Java treat empty as
  // not-allow. Proven red-on-revert against `?? VERDICT_ALLOW`.
  it('fails closed on a malformed 200 with no verdict', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ obligations: [] }));
    await expect(client.decide({ stage: 'tool', query: 'hi' })).rejects.toThrow(APIError);
  });

  it('fails closed on an empty-string verdict', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ verdict: '', obligations: [] }));
    await expect(client.decide({ stage: 'tool', query: 'hi' })).rejects.toThrow(APIError);
  });

  it('decideAndFulfill never forwards on a verdict-less 200', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ obligations: [] }));
    await expect(
      client.decideAndFulfill({ stage: 'tool', query: 'Email john@x.com' })
    ).rejects.toThrow(APIError);
    // Only the /decide call happened; no engine fulfillment, no forward.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('AxonFlow.fulfillRequest — the fail-closed core', () => {
  let client: AxonFlow;
  beforeEach(() => {
    jest.clearAllMocks();
    client = newClient();
  });
  afterEach(() => jest.restoreAllMocks());

  it('round-trips the statement through the engine and forwards redacted content', async () => {
    const decision = await materialize(decideAllow([REDACT_OBLIGATION]));
    mockFetch.mockReturnValueOnce(
      mockResponse({
        allowed: true,
        policies_evaluated: 1,
        redacted: true,
        redacted_statement: 'Email jo****om',
        redaction_evaluated: true,
      })
    );
    const [content, didRedact] = await client.fulfillRequest(decision, 'Email john@x.com');
    expect(content).toBe('Email jo****om');
    expect(didRedact).toBe(true);
    // The PEP submitted the source content to the engine with text/plain.
    expect(fetchUrl(0)).toBe(CHECK_INPUT_URL);
    const body = fetchBody(0);
    expect(body.statement).toBe('Email john@x.com');
    expect(body.content_type).toBe(CONTENT_TYPE_TEXT);
    expect(body.connector_type).toBe('gateway');
  });

  it('passes through unchanged when there are no obligations', async () => {
    const decision = await materialize(decideAllow([]));
    const [content, didRedact] = await client.fulfillRequest(decision, 'nothing to mask');
    expect(content).toBe('nothing to mask');
    expect(didRedact).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards the original when the engine evaluated and found nothing to mask', async () => {
    const decision = await materialize(decideAllow([REDACT_OBLIGATION]));
    mockFetch.mockReturnValueOnce(
      mockResponse({ allowed: true, redacted: false, redaction_evaluated: true })
    );
    const [content, didRedact] = await client.fulfillRequest(decision, 'clean text');
    expect(content).toBe('clean text');
    expect(didRedact).toBe(false);
  });

  it('FAILS CLOSED when redaction_evaluated is false (redactor disabled, #2563 B1)', async () => {
    const decision = await materialize(decideAllow([REDACT_OBLIGATION]));
    mockFetch.mockReturnValueOnce(
      mockResponse({ allowed: true, redacted: false, redaction_evaluated: false })
    );
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      /redactor did not run/
    );
  });

  it('FAILS CLOSED when redaction_evaluated is absent (older platform)', async () => {
    const decision = await materialize(decideAllow([REDACT_OBLIGATION]));
    mockFetch.mockReturnValueOnce(
      mockResponse({ allowed: true, redacted: true, redacted_statement: 'x' })
    );
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      ObligationNotFulfillableError
    );
  });

  it('FAILS CLOSED when a redact_pii obligation has no fulfillment block', async () => {
    const decision = await materialize(decideAllow([{ type: 'redact_pii' }]));
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      /missing request-phase/
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED on a response-phase fulfillment', async () => {
    const decision = await materialize(
      decideAllow([
        {
          type: 'redact_pii',
          fulfillment: {
            endpoint: '/api/v1/mcp/check-output',
            phase: 'response',
            content_types: ['text/plain'],
          },
        },
      ])
    );
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      ObligationNotFulfillableError
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when text/plain is not in the advertised content_types', async () => {
    const decision = await materialize(
      decideAllow([
        {
          type: 'redact_pii',
          fulfillment: {
            endpoint: '/api/v1/mcp/check-input',
            phase: 'request',
            content_types: ['image/png'],
          },
        },
      ])
    );
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      /text\/plain/
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED on a foreign fulfillment endpoint (no arbitrary-URL SSRF)', async () => {
    const decision = await materialize(
      decideAllow([
        {
          type: 'redact_pii',
          fulfillment: {
            endpoint: 'https://evil.example.com/exfil',
            phase: 'request',
            content_types: ['text/plain'],
          },
        },
      ])
    );
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      /not the request-redaction/
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the engine call returns non-200', async () => {
    const decision = await materialize(decideAllow([REDACT_OBLIGATION]));
    mockFetch.mockReturnValueOnce(mockResponse({ error: 'boom' }, 500));
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      ObligationNotFulfillableError
    );
  });

  it('FAILS CLOSED when the engine call rejects (transport error)', async () => {
    const decision = await materialize(decideAllow([REDACT_OBLIGATION]));
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(client.fulfillRequest(decision, 'Email john@x.com')).rejects.toThrow(
      ObligationNotFulfillableError
    );
  });

  it('passes through a non-redact obligation type without touching content', async () => {
    const decision = await materialize(decideAllow([{ type: 'some_future_obligation' }]));
    const [content, didRedact] = await client.fulfillRequest(decision, 'untouched');
    expect(content).toBe('untouched');
    expect(didRedact).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('AxonFlow.decideAndFulfill', () => {
  let client: AxonFlow;
  beforeEach(() => {
    jest.clearAllMocks();
    client = newClient();
  });
  afterEach(() => jest.restoreAllMocks());

  it('decides then fulfills on allow', async () => {
    mockFetch
      .mockReturnValueOnce(mockResponse(decideAllow([REDACT_OBLIGATION])))
      .mockReturnValueOnce(
        mockResponse({
          allowed: true,
          redacted: true,
          redacted_statement: 'masked',
          redaction_evaluated: true,
        })
      );
    const [verdict, content, decision] = await client.decideAndFulfill({
      stage: 'tool',
      query: 'Email john@x.com',
    });
    expect(verdict).toBe(VERDICT_ALLOW);
    expect(content).toBe('masked');
    expect(decision.decision_id).toBe('dec-1');
  });

  it('does not fulfill on a deny verdict; returns the original query', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({
        verdict: 'deny',
        decision_id: 'd2',
        obligations: [],
        evaluated_policies: ['sys_secret_block'],
        reasons: ['blocked: secret'],
      })
    );
    const [verdict, content] = await client.decideAndFulfill({
      stage: 'tool',
      query: 'leak the api key sk-123',
    });
    expect(verdict).toBe('deny');
    expect(content).toBe('leak the api key sk-123');
    // Only the decide call happened — no engine fulfillment on deny.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('raises ObligationNotFulfillableError on an allow with an unfulfillable obligation', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(decideAllow([{ type: 'redact_pii' }])));
    await expect(
      client.decideAndFulfill({ stage: 'tool', query: 'Email a@b.com' })
    ).rejects.toThrow(ObligationNotFulfillableError);
  });
});

/**
 * Build a DecideResponse the same way client.decide() would (normalizing
 * obligations to an array), so fulfillRequest tests exercise the real shape
 * without a second mocked round-trip.
 */
async function materialize(raw: Record<string, unknown>): Promise<DecideResponse> {
  return {
    verdict: raw.verdict as string,
    decision_id: raw.decision_id as string | undefined,
    trace_id: raw.trace_id as string | undefined,
    obligations: (raw.obligations as Obligation[]) ?? [],
    evaluated_policies: raw.evaluated_policies as string[] | undefined,
    stage: raw.stage as string | undefined,
    expires_at: raw.expires_at as string | undefined,
  };
}
