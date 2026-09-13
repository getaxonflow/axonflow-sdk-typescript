/**
 * The PEP capability handshake: the declaration, its bytes, and where it goes.
 *
 * 1. PARITY. A declaration encodes to exactly the bytes the platform's own
 *    reference encoder produces for it, and a declaration the platform would
 *    refuse fails here, at construction, naming the same member. The golden
 *    values below came from the platform's encoder and were round-tripped
 *    through its decoder; they are the same vectors the Python SDK pins.
 * 2. PLACEMENT. The declaration reaches the wire on every method whose route
 *    reads it, on every request those methods make, and on no other route.
 * 3. PRECEDENCE. A per-call declaration replaces the client's on that call only.
 */

import { createHash } from 'crypto';
import { AxonFlow } from '../src/client';
import { AxonFlowError, PEPHandshakeError } from '../src/errors';
import {
  MAX_PEP_HANDSHAKE_CAPABILITIES,
  PEP_HANDSHAKE_HEADER,
  PEPHandshake,
  type PEPCapability,
} from '../src/pep-handshake';
import { AUTHZEN_OBLIGATION_TYPE_VALUES, AUTHZEN_PROFILE_V1 } from '../src/types/authzen.gen';
import type { DecideResponse } from '../src/pep';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ENDPOINT = 'http://localhost:8080';

function caps(...pairs: Array<[string, number]>): PEPCapability[] {
  return pairs.map(([type, version]) => ({ type, version }));
}

// Produced by the platform's reference encoder for the declarations beside
// them, and accepted by its decoder. The capabilities are listed in the order
// they were GIVEN; for "unsorted" that is not the canonical order.
const GOLDEN: Array<[string, string, string, Array<[string, number]>, string]> = [
  [
    'empty',
    'sdk-python',
    'https://pep.example.test',
    [],
    'eyJwcm9maWxlX3ZlcnNpb24iOjEsInBlcF9pZCI6InNkay1weXRob24iLCJhdWRpZW5jZSI6Imh0dHBz' +
      'Oi8vcGVwLmV4YW1wbGUudGVzdCIsImNhcGFiaWxpdGllcyI6W119',
  ],
  [
    'unsorted',
    'gateway.request-1',
    'urn:example:aud',
    [
      ['field_redact', 2],
      ['approval_challenge', 1],
      ['field_redact', 1],
      ['notification', 3],
    ],
    'eyJwcm9maWxlX3ZlcnNpb24iOjEsInBlcF9pZCI6ImdhdGV3YXkucmVxdWVzdC0xIiwiYXVkaWVuY2Ui' +
      'OiJ1cm46ZXhhbXBsZTphdWQiLCJjYXBhYmlsaXRpZXMiOlt7InR5cGUiOiJhcHByb3ZhbF9jaGFsbGVu' +
      'Z2UiLCJ2ZXJzaW9uIjoxfSx7InR5cGUiOiJmaWVsZF9yZWRhY3QiLCJ2ZXJzaW9uIjoxfSx7InR5cGUi' +
      'OiJmaWVsZF9yZWRhY3QiLCJ2ZXJzaW9uIjoyfSx7InR5cGUiOiJub3RpZmljYXRpb24iLCJ2ZXJzaW9u' +
      'IjozfV19',
  ],
  [
    'minimal',
    'a',
    'A',
    [['step_up_authentication', 1]],
    'eyJwcm9maWxlX3ZlcnNpb24iOjEsInBlcF9pZCI6ImEiLCJhdWRpZW5jZSI6IkEiLCJjYXBhYmlsaXRp' +
      'ZXMiOlt7InR5cGUiOiJzdGVwX3VwX2F1dGhlbnRpY2F0aW9uIiwidmVyc2lvbiI6MX1dfQ',
  ],
];
// The 64-capability vector, pinned by length and digest rather than inline.
const SIXTY_FOUR_LEN = 3364;
const SIXTY_FOUR_SHA256 = 'cdb2b368348bceaed99ca92647afeecd70981604157b60ad66067953a371edbf';

const DECLARED = new PEPHandshake({
  pepId: 'request-path',
  audience: 'https://pep.example.test',
  capabilities: caps(['field_redact', 1]),
});
const OTHER = new PEPHandshake({
  pepId: 'response-path',
  audience: 'https://pep.example.test',
  capabilities: caps(['field_mask', 1]),
});

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

// ---------------------------------------------------------------------------
// 1. Parity with the platform
// ---------------------------------------------------------------------------

describe('the encoding is the platform encoder', () => {
  it.each(GOLDEN)('%s', (_name, pepId, audience, pairs, header) => {
    expect(new PEPHandshake({ pepId, audience, capabilities: caps(...pairs) }).headerValue).toBe(
      header
    );
  });

  it('encodes sixty-four capabilities under the byte cap', () => {
    const kinds = [...AUTHZEN_OBLIGATION_TYPE_VALUES].sort();
    const pairs: Array<[string, number]> = [];
    for (let v = 1; pairs.length < MAX_PEP_HANDSHAKE_CAPABILITIES; v++) {
      for (const kind of kinds) {
        if (pairs.length < MAX_PEP_HANDSHAKE_CAPABILITIES) {
          pairs.push([kind, v]);
        }
      }
    }
    const value = new PEPHandshake({ pepId: 'p', audience: 'a', capabilities: caps(...pairs) })
      .headerValue;
    expect(value.length).toBe(SIXTY_FOUR_LEN);
    expect(createHash('sha256').update(value).digest('hex')).toBe(SIXTY_FOUR_SHA256);
  });

  it('refuses a declaration past the byte cap as a whole', () => {
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < 64; i++) {
      pairs.push(['step_up_authentication', 1_000_000_000 + i]);
    }
    try {
      new PEPHandshake({ pepId: 'p', audience: 'a', capabilities: caps(...pairs) });
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(PEPHandshakeError);
      // The document is at fault, not a member, exactly as the platform reports it.
      expect((e as PEPHandshakeError).pointer).toBe('');
    }
  });

  it('sends the same bytes whatever order the set is declared in', () => {
    const given: Array<[string, number]> = [
      ['notification', 3],
      ['field_redact', 2],
      ['approval_challenge', 1],
    ];
    const one = new PEPHandshake({ pepId: 'gw', audience: 'a', capabilities: caps(...given) });
    const other = new PEPHandshake({
      pepId: 'gw',
      audience: 'a',
      capabilities: caps(...[...given].reverse()),
    });
    expect(one.headerValue).toBe(other.headerValue);
    expect(one.capabilities.map(c => c.type)).toEqual([
      'approval_challenge',
      'field_redact',
      'notification',
    ]);
  });

  it('is unpadded base64url of the canonical compact document', () => {
    const value = new PEPHandshake({
      pepId: 'gw',
      audience: 'https://pep.example.test',
      capabilities: caps(['field_redact', 2], ['field_redact', 1]),
    }).headerValue;
    expect(value).not.toMatch(/[=+/]/);
    expect(Buffer.from(value, 'base64url').toString('utf8')).toBe(
      '{"profile_version":1,"pep_id":"gw","audience":"https://pep.example.test",' +
        '"capabilities":[{"type":"field_redact","version":1},{"type":"field_redact","version":2}]}'
    );
  });

  it('treats an empty declaration as a declaration', () => {
    const value = new PEPHandshake({ pepId: 'gw', audience: 'a', capabilities: [] }).headerValue;
    expect(decode(value)).toEqual({
      profile_version: 1,
      pep_id: 'gw',
      audience: 'a',
      capabilities: [],
    });
  });

  it("copies the caller's array and freezes itself", () => {
    const given = caps(['field_redact', 1]);
    const declared = new PEPHandshake({ pepId: 'gw', audience: 'a', capabilities: given });
    const before = declared.headerValue;
    given.push({ type: 'field_mask', version: 1 });
    expect(declared.capabilities).toEqual([{ type: 'field_redact', version: 1 }]);
    expect(declared.headerValue).toBe(before);
    expect(Object.isFrozen(declared)).toBe(true);
    expect(Object.isFrozen(declared.capabilities)).toBe(true);
  });
});

describe('the refusals are the platform validator', () => {
  const refusals: Array<[string, unknown, unknown, unknown, string]> = [
    ['pep_id empty', '', 'a', [], '/pep_id'],
    ['pep_id upper-case', 'Gateway', 'a', [], '/pep_id'],
    ['pep_id with a colon', 'client:gw', 'a', [], '/pep_id'],
    ['pep_id with a leading dash', '-gw', 'a', [], '/pep_id'],
    ['pep_id with a trailing newline', 'gw\n', 'a', [], '/pep_id'],
    ['pep_id of 129 bytes', 'g'.repeat(129), 'a', [], '/pep_id'],
    ['pep_id not a string', 7, 'a', [], '/pep_id'],
    ['audience empty', 'gw', '', [], '/audience'],
    ['audience with a leading slash', 'gw', '/aud', [], '/audience'],
    ['audience with a space', 'gw', 'a b', [], '/audience'],
    ['audience with a trailing newline', 'gw', 'aud\n', [], '/audience'],
    ['audience of 129 bytes', 'gw', 'a'.repeat(129), [], '/audience'],
    ['capabilities absent', 'gw', 'a', undefined, '/capabilities'],
    ['capabilities a string', 'gw', 'a', 'field_redact', '/capabilities'],
    ['capabilities a map', 'gw', 'a', { field_redact: 1 }, '/capabilities'],
    ['an entry that is a pair', 'gw', 'a', [['field_redact', 1]], '/capabilities'],
    [
      'an entry with an extra member',
      'gw',
      'a',
      [{ type: 'field_redact', version: 1, edition: 'enterprise' }],
      '/capabilities',
    ],
    ['a legacy obligation name', 'gw', 'a', caps(['redact_pii', 1]), '/capabilities'],
    ['a wrong-case type', 'gw', 'a', caps(['Field_Redact', 1]), '/capabilities'],
    ['version zero', 'gw', 'a', caps(['field_redact', 0]), '/capabilities'],
    ['a negative version', 'gw', 'a', caps(['field_redact', -1]), '/capabilities'],
    ['a fractional version', 'gw', 'a', caps(['field_redact', 1.5]), '/capabilities'],
    ['a boolean version', 'gw', 'a', [{ type: 'field_redact', version: true }], '/capabilities'],
    ['a string version', 'gw', 'a', [{ type: 'field_redact', version: '1' }], '/capabilities'],
    [
      'a repeated capability',
      'gw',
      'a',
      caps(['field_redact', 1], ['field_redact', 1]),
      '/capabilities',
    ],
    [
      'sixty-five capabilities',
      'gw',
      'a',
      Array.from({ length: 65 }, (_, i) => ({ type: 'field_redact', version: i + 1 })),
      '/capabilities',
    ],
  ];

  it.each(refusals)('%s', (_name, pepId, audience, capabilities, pointer) => {
    let caught: unknown;
    try {
      new PEPHandshake({ pepId, audience, capabilities } as unknown as ConstructorParameters<
        typeof PEPHandshake
      >[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PEPHandshakeError);
    expect(caught).toBeInstanceOf(AxonFlowError);
    expect((caught as PEPHandshakeError).pointer).toBe(pointer);
    expect(
      (caught as PEPHandshakeError).message.startsWith(`${PEP_HANDSHAKE_HEADER}: ${pointer}: `)
    ).toBe(true);
  });

  it('accepts the longest identifiers the platform reads, and a URI audience', () => {
    expect(
      () =>
        new PEPHandshake({ pepId: 'g'.repeat(128), audience: 'A'.repeat(128), capabilities: [] })
    ).not.toThrow();
    expect(
      () =>
        new PEPHandshake({
          pepId: 'gw.request-1',
          audience: 'https://api.example.com/v1',
          capabilities: [],
        })
    ).not.toThrow();
  });

  it('accepts every obligation type this build declares', () => {
    for (const type of AUTHZEN_OBLIGATION_TYPE_VALUES) {
      expect(
        () => new PEPHandshake({ pepId: 'gw', audience: 'a', capabilities: [{ type, version: 1 }] })
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Placement
// ---------------------------------------------------------------------------

const REDACT_OBLIGATION = {
  type: 'redact_pii',
  fulfillment: {
    endpoint: '/api/v1/mcp/check-input',
    method: 'POST',
    phase: 'request',
    content_types: ['text/plain'],
  },
};
const DECIDE_BODY = { verdict: 'allow', decision_id: 'dec-1', obligations: [], stage: 'tool' };
const REDACTING_DECIDE_BODY = { ...DECIDE_BODY, obligations: [REDACT_OBLIGATION] };
const AUTHZEN_BODY = {
  decision: true,
  context: {
    profile: AUTHZEN_PROFILE_V1,
    state: 'ALLOW',
    category: 'allowed',
    reason: 'permitted',
    decision_id: 'dec-1',
    schema_version: '2026-08-29',
  },
};
const CHECK_BODY = { allowed: true, policies_evaluated: 1 };
const FULFIL_BODY = { ...CHECK_BODY, redaction_evaluated: true, redacted: false };
const PRE_CHECK_BODY = { context_id: 'ctx-1', approved: true, expires_at: '2030-01-01T00:00:00Z' };

const DECIDE = '/api/v1/decide';
const EVALUATION = '/api/v1/access/evaluation';
const CHECK_INPUT = '/api/v1/mcp/check-input';
const CHECK_OUTPUT = '/api/v1/mcp/check-output';
const PRE_CHECK = '/api/policy/pre-check';

const AUTHZEN_REQUEST = {
  subject: { type: 'gateway', id: 'gw' },
  action: { name: 'llm.completion' },
  resource: { type: 'llm', id: 'llm' },
  context: { args: { query: 'hi' } },
};
const AUTHZEN_BULK = {
  subject: { type: 'gateway', id: 'gw' },
  action: { name: 'tool.call' },
  context: { args: { query: 'hi' } },
  evaluations: [{ resource: { type: 'tool', id: 'jira/a' } }],
};

type Call = (client: AxonFlow, perCall?: PEPHandshake) => Promise<unknown>;

// [method, responses in the order the method makes its requests, the call]
const PLANE_CALLS: Array<[string, Array<[string, unknown]>, Call]> = [
  [
    'decide',
    [[DECIDE, DECIDE_BODY]],
    (c, p) => c.decide({ stage: 'tool', query: 'hi' }, { pepHandshake: p }),
  ],
  [
    'decideAndFulfill',
    [
      [DECIDE, REDACTING_DECIDE_BODY],
      [CHECK_INPUT, FULFIL_BODY],
    ],
    (c, p) => c.decideAndFulfill({ stage: 'tool', query: 'hi' }, { pepHandshake: p }),
  ],
  [
    'fulfillRequest',
    [[CHECK_INPUT, FULFIL_BODY]],
    (c, p) =>
      c.fulfillRequest(REDACTING_DECIDE_BODY as unknown as DecideResponse, 'hi', {
        pepHandshake: p,
      }),
  ],
  [
    'evaluate',
    [[EVALUATION, AUTHZEN_BODY]],
    (c, p) => c.evaluate(AUTHZEN_REQUEST as never, { pepHandshake: p }),
  ],
  [
    'evaluateAll',
    [[EVALUATION, AUTHZEN_BODY]],
    (c, p) => c.evaluateAll(AUTHZEN_BULK as never, { pepHandshake: p }),
  ],
  [
    'mcpCheckInput',
    [[CHECK_INPUT, CHECK_BODY]],
    (c, p) =>
      c.mcpCheckInput({ connectorType: 'postgres', statement: 'select 1', pepHandshake: p }),
  ],
  [
    'checkToolInput',
    [[CHECK_INPUT, CHECK_BODY]],
    (c, p) =>
      c.checkToolInput({ connectorType: 'postgres', statement: 'select 1', pepHandshake: p }),
  ],
  [
    'mcpCheckOutput',
    [[CHECK_OUTPUT, CHECK_BODY]],
    (c, p) => c.mcpCheckOutput({ connectorType: 'postgres', message: 'hi', pepHandshake: p }),
  ],
  [
    'checkToolOutput',
    [[CHECK_OUTPUT, CHECK_BODY]],
    (c, p) => c.checkToolOutput({ connectorType: 'postgres', message: 'hi', pepHandshake: p }),
  ],
  [
    'getPolicyApprovedContext',
    [[PRE_CHECK, PRE_CHECK_BODY]],
    (c, p) => c.getPolicyApprovedContext({ userToken: 'tok', query: 'hi', pepHandshake: p }),
  ],
  [
    'preCheck',
    [[PRE_CHECK, PRE_CHECK_BODY]],
    (c, p) => c.preCheck({ userToken: 'tok', query: 'hi', pepHandshake: p }),
  ],
];

function respond(body: unknown, status = 200): Promise<unknown> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function queue(responses: Array<[string, unknown]>): void {
  for (const [, body] of responses) {
    mockFetch.mockImplementationOnce(() => respond(body));
  }
}

function client(pepHandshake?: PEPHandshake): AxonFlow {
  return new AxonFlow({
    endpoint: ENDPOINT,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    pepHandshake,
  });
}

/** The handshake header on each request sent, or undefined where there was none. */
function sentHandshakes(): Array<[string, string | undefined]> {
  return mockFetch.mock.calls.map(([input, init]) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    return [new URL(String(input)).pathname, headers[PEP_HANDSHAKE_HEADER]];
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('the declaration reaches every request of every plane method', () => {
  it.each(PLANE_CALLS)("%s carries the client's declaration", async (_name, responses, call) => {
    queue(responses);
    await call(client(DECLARED));
    expect(sentHandshakes()).toEqual(responses.map(([path]) => [path, DECLARED.headerValue]));
  });

  it.each(PLANE_CALLS)(
    '%s forwards a per-call declaration through every delegation',
    async (_name, responses, call) => {
      queue(responses);
      await call(client(DECLARED), OTHER);
      expect(sentHandshakes()).toEqual(responses.map(([path]) => [path, OTHER.headerValue]));
    }
  );

  it.each(PLANE_CALLS)(
    '%s sends no header from a client with no declaration',
    async (_name, responses, call) => {
      queue(responses);
      await call(client());
      expect(sentHandshakes()).toEqual(responses.map(([path]) => [path, undefined]));
    }
  );
});

describe('no other route receives it', () => {
  it('is not sent to the proxy route', async () => {
    mockFetch.mockImplementationOnce(() =>
      respond({ success: true, data: { answer: '4' }, blocked: false })
    );
    await client(DECLARED).proxyLLMCall({
      userToken: '',
      query: 'What is 2+2?',
      requestType: 'chat',
    });
    expect(sentHandshakes()).toEqual([['/api/request', undefined]]);
  });

  it('is not sent to the health route', async () => {
    mockFetch.mockImplementationOnce(() => respond({ status: 'healthy' }));
    await client(DECLARED).healthCheck();
    expect(sentHandshakes()).toEqual([['/health', undefined]]);
  });
});

// ---------------------------------------------------------------------------
// 3. Precedence, and values that are not declarations
// ---------------------------------------------------------------------------

describe('precedence', () => {
  it("replaces the client's declaration on that call only", async () => {
    queue([
      [CHECK_INPUT, CHECK_BODY],
      [CHECK_INPUT, CHECK_BODY],
    ]);
    const c = client(DECLARED);
    await c.mcpCheckInput({ connectorType: 'postgres', statement: 'a', pepHandshake: OTHER });
    await c.mcpCheckInput({ connectorType: 'postgres', statement: 'b' });
    expect(sentHandshakes()).toEqual([
      [CHECK_INPUT, OTHER.headerValue],
      [CHECK_INPUT, DECLARED.headerValue],
    ]);
  });

  it('does not stick to a client without a declaration', async () => {
    queue([
      [DECIDE, DECIDE_BODY],
      [DECIDE, DECIDE_BODY],
    ]);
    const c = client();
    await c.decide({ stage: 'tool', query: 'a' }, { pepHandshake: OTHER });
    await c.decide({ stage: 'tool', query: 'b' });
    expect(sentHandshakes()).toEqual([
      [DECIDE, OTHER.headerValue],
      [DECIDE, undefined],
    ]);
  });

  it('keeps the declaration on a client derived with asUser', async () => {
    queue([[DECIDE, DECIDE_BODY]]);
    await client(DECLARED).asUser('user-token').decide({ stage: 'tool', query: 'a' });
    expect(sentHandshakes()).toEqual([[DECIDE, DECLARED.headerValue]]);
  });

  it.each([
    ['a plain object', { pepId: 'gw' }],
    ['an encoded string', DECLARED.headerValue],
  ])('refuses %s as the client declaration', (_name, value) => {
    expect(() => client(value as unknown as PEPHandshake)).toThrow(TypeError);
  });

  it('refuses a per-call value that is not a declaration, before sending', async () => {
    await expect(
      client().decide(
        { stage: 'tool', query: 'a' },
        { pepHandshake: DECLARED.headerValue as unknown as PEPHandshake }
      )
    ).rejects.toThrow(TypeError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
