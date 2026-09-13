/**
 * The v11.0.0 platform wire: decision provenance, frozen legacy writes, deprecated routes.
 *
 * A v11 platform reports what decided each governed request, freezes the static- and
 * dynamic-policy write routes with `409 LEGACY_POLICY_WRITE_FROZEN`, and stamps its
 * legacy policy routes as deprecated. These tests pin how the SDK surfaces each of
 * those, and that a response from an older platform still parses with every new
 * field absent.
 */

import { AxonFlow } from '../src/client';
import {
  APIError,
  LegacyPolicyWriteFrozenError,
  PlatformRouteDeprecationWarning,
} from '../src/errors';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ENDPOINT = 'http://localhost:8080';

const PROVENANCE = {
  engine: 'anchored',
  subject_type: 'client',
  policy_bundle: 'sha256:4f2a',
  legacy_validators: [{ validator: 'indonesia_pii', action: 'masked' }],
};

const FROZEN_BODY = {
  error: {
    code: 'LEGACY_POLICY_WRITE_FROZEN',
    message: 'legacy policy writes are frozen; author policy at /api/v1/typed-policies',
  },
};

const STAMP_BEFORE_TAG = {
  'X-AxonFlow-Removed-In': 'v11.1',
  Link: '</api/v1/typed-policies>; rel="successor-version"',
};

function mockResponse(data: unknown, status = 200, headers?: Record<string, string>) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    ...(headers ? { headers: new Headers(headers) } : {}),
  });
}

function newClient(): AxonFlow {
  return new AxonFlow({
    endpoint: ENDPOINT,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    tenant: 'test-tenant',
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('decision provenance on every governed response', () => {
  it('decide carries the v11 provenance, the policy identities, the packs and the document version', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({
        verdict: 'allow',
        decision_id: 'dec-1',
        obligations: [],
        evaluated_policies: ['sys_pii_ktp', 'org_pol_7'],
        ...PROVENANCE,
        policy_identities: [
          { id: 'sys_pii_ktp', name: 'Indonesian KTP', source: 'shipped' },
          { id: 'org_pol_7', name: 'Card data', source: 'organization', version: 3 },
        ],
        policy_packs: ['fincrime'],
        document_version: 3,
      })
    );
    const resp = await newClient().decide({ stage: 'tool', query: 'hi' });
    expect(resp.engine).toBe('anchored');
    expect(resp.subject_type).toBe('client');
    expect(resp.policy_bundle).toBe('sha256:4f2a');
    expect(resp.legacy_validators).toEqual([{ validator: 'indonesia_pii', action: 'masked' }]);
    expect(resp.policy_identities).toEqual([
      { id: 'sys_pii_ktp', name: 'Indonesian KTP', source: 'shipped' },
      { id: 'org_pol_7', name: 'Card data', source: 'organization', version: 3 },
    ]);
    expect(resp.policy_packs).toEqual(['fincrime']);
    expect(resp.document_version).toBe(3);
  });

  it('a decide response from an older platform leaves every new field undefined', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ verdict: 'allow', decision_id: 'dec-1', obligations: [] })
    );
    const resp = await newClient().decide({ stage: 'tool', query: 'hi' });
    for (const field of [
      'engine',
      'subject_type',
      'policy_bundle',
      'legacy_validators',
      'policy_identities',
      'policy_packs',
      'document_version',
    ] as const) {
      expect(resp[field]).toBeUndefined();
    }
  });

  it('the pre-check result carries the decision id, the verdict and the provenance', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({
        context_id: 'ctx-1',
        approved: false,
        expires_at: '2026-09-13T06:00:00Z',
        block_reason: 'blocked by policy',
        decision_id: 'dec-9',
        verdict: 'deny',
        ...PROVENANCE,
      })
    );
    const result = await newClient().getPolicyApprovedContext({ userToken: 'u', query: 'q' });
    expect(result.decisionId).toBe('dec-9');
    expect(result.verdict).toBe('deny');
    expect(result.engine).toBe('anchored');
    expect(result.subjectType).toBe('client');
    expect(result.policyBundle).toBe('sha256:4f2a');
    expect(result.legacyValidators).toEqual([{ validator: 'indonesia_pii', action: 'masked' }]);
  });

  it('proxyLLMCall carries the provenance', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ success: true, blocked: false, data: { answer: 'ok' }, ...PROVENANCE })
    );
    const resp = await newClient().proxyLLMCall({ query: 'q', requestType: 'chat' });
    expect(resp.engine).toBe('anchored');
    expect(resp.subjectType).toBe('client');
    expect(resp.policyBundle).toBe('sha256:4f2a');
    expect(resp.legacyValidators).toEqual([{ validator: 'indonesia_pii', action: 'masked' }]);
  });

  it('MCP check-output carries the provenance', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ allowed: true, policies_evaluated: 2, ...PROVENANCE })
    );
    const resp = await newClient().mcpCheckOutput({ connectorType: 'postgres', message: 'ok' });
    expect(resp.engine).toBe('anchored');
    expect(resp.policy_bundle).toBe('sha256:4f2a');
    expect(resp.legacy_validators).toEqual([{ validator: 'indonesia_pii', action: 'masked' }]);
  });

  it('mcpQuery maps the provenance onto its connector response', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true, data: [], ...PROVENANCE }));
    const resp = await newClient().mcpQuery({ connector: 'postgres', statement: 'SELECT 1' });
    expect(resp.engine).toBe('anchored');
    expect(resp.subject_type).toBe('client');
    expect(resp.policy_bundle).toBe('sha256:4f2a');
    expect(resp.legacy_validators).toEqual([{ validator: 'indonesia_pii', action: 'masked' }]);
  });

  it('queryConnector maps the request provenance onto its connector response', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ success: true, data: { rows: [] }, metadata: {}, ...PROVENANCE })
    );
    const resp = await newClient().queryConnector('postgres', 'q');
    expect(resp.engine).toBe('anchored');
    expect(resp.subject_type).toBe('client');
    expect(resp.policy_bundle).toBe('sha256:4f2a');
    expect(resp.legacy_validators).toEqual([{ validator: 'indonesia_pii', action: 'masked' }]);
  });
});

describe('frozen legacy writes', () => {
  it('a frozen static-policy write throws LegacyPolicyWriteFrozenError, which is still an APIError', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(FROZEN_BODY, 409));
    const err = await newClient()
      .createStaticPolicy({ name: 'n', category: 'security-sqli', pattern: 'x' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LegacyPolicyWriteFrozenError);
    expect(err).toBeInstanceOf(APIError);
    expect((err as LegacyPolicyWriteFrozenError).code).toBe('LEGACY_POLICY_WRITE_FROZEN');
    expect((err as LegacyPolicyWriteFrozenError).statusCode).toBe(409);
    expect((err as LegacyPolicyWriteFrozenError).message).toContain('/api/v1/typed-policies');
  });

  it('a frozen dynamic-policy write throws LegacyPolicyWriteFrozenError', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(FROZEN_BODY, 409));
    await expect(
      newClient().createDynamicPolicy({ name: 'n', type: 'cost', conditions: [], actions: [] })
    ).rejects.toBeInstanceOf(LegacyPolicyWriteFrozenError);
  });

  it('a different 409 on the same route stays a plain APIError', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ error: { code: 'DUPLICATE_NAME', message: 'exists' } }, 409)
    );
    const err = await newClient()
      .createStaticPolicy({ name: 'n', category: 'security-sqli', pattern: 'x' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err).not.toBeInstanceOf(LegacyPolicyWriteFrozenError);
  });
});

describe('deprecated routes', () => {
  let emitWarning: jest.SpyInstance;

  beforeEach(() => {
    emitWarning = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  });

  afterEach(() => {
    emitWarning.mockRestore();
  });

  function emitted(): PlatformRouteDeprecationWarning[] {
    return emitWarning.mock.calls
      .map(call => call[0])
      .filter(
        (w): w is PlatformRouteDeprecationWarning => w instanceof PlatformRouteDeprecationWarning
      );
  }

  it('the pre-tag stamp warns, naming the successor and the removal release', async () => {
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMP_BEFORE_TAG));
    await newClient().listStaticPolicies();
    const [warning] = emitted();
    expect(warning).toBeDefined();
    expect(warning.name).toBe('DeprecationWarning');
    expect(warning.code).toBe('AXONFLOW_PLATFORM_ROUTE_DEPRECATED');
    expect(warning.route).toBe('GET /api/v1/static-policies');
    expect(warning.successor).toBe('/api/v1/typed-policies');
    expect(warning.removedIn).toBe('v11.1');
    expect(warning.deprecation).toBeUndefined();
  });

  it('the RFC 9745 Deprecation header alone warns', async () => {
    mockFetch.mockReturnValueOnce(mockResponse([], 200, { Deprecation: '@1789603200' }));
    await newClient().listDynamicPolicies();
    const [warning] = emitted();
    expect(warning).toBeDefined();
    expect(warning.deprecation).toBe('@1789603200');
    expect(warning.successor).toBeUndefined();
  });

  it('an unstamped response does not warn', async () => {
    mockFetch.mockReturnValueOnce(mockResponse([], 200, {}));
    await newClient().listStaticPolicies();
    expect(emitted()).toEqual([]);
  });

  it('a response without headers does not warn or throw', async () => {
    mockFetch.mockReturnValueOnce(mockResponse([]));
    await expect(newClient().listStaticPolicies()).resolves.toBeDefined();
    expect(emitted()).toEqual([]);
  });

  it('warns once per route per client', async () => {
    const client = newClient();
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMP_BEFORE_TAG));
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMP_BEFORE_TAG));
    await client.listStaticPolicies();
    await client.listStaticPolicies({ category: 'security-sqli' });
    expect(emitted()).toHaveLength(1);
  });
});
