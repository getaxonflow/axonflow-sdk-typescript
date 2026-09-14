/**
 * Typed policy authoring through the agent: `client.typedPolicies`.
 *
 * Each operation is asserted on the wire (the route, the method and the exact
 * body) and on its answer, and so is every refusal the platform documents. The
 * publish body is the one the platform's own route test proves publishable,
 * marshalled by the platform's own types: tests/fixtures/typed-policy-publish-body.json.
 * The platform marshals a nil Go slice or map as JSON null, and those cases
 * carry the null a real stack sends.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_BODY_PATH } from '../examples/typed-policies/body';
import { AxonFlow } from '../src/client';
import { APIError, AuthenticationError, AxonFlowError, TypedPolicyRefusal } from '../src/errors';
import { HEADER_USER_TOKEN } from '../src/read-identity';
import { TYPED_POLICIES_PATH } from '../src/types/typed-policies';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ENDPOINT = 'http://localhost:8080';
const ROUTE = `${ENDPOINT}${TYPED_POLICIES_PATH}`;
const BODY = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'typed-policy-publish-body.json'), 'utf8')
) as { document: Record<string, unknown>; fixtures: Array<Record<string, unknown>> };
const DIGEST = 'sha256:5d41402abc4b2a76b9719d911017c592';

function client(): AxonFlow {
  return new AxonFlow({ endpoint: ENDPOINT, clientId: 'test-client', clientSecret: 'test-secret' });
}

/** Answer the typed-policy route with `text`; anything else the client sends gets an empty 200. */
function answer(text: string, status = 200, headers: Record<string, string> = {}): void {
  mockFetch.mockImplementation((input: unknown) =>
    Promise.resolve(
      String(input).startsWith(ROUTE)
        ? new Response(text, {
            status,
            statusText: status < 300 ? 'OK' : 'Refused',
            headers: { 'Content-Type': 'application/json', ...headers },
          })
        : new Response('{}', { status: 200 })
    )
  );
}

function answerJSON(body: unknown, status = 200, headers: Record<string, string> = {}): void {
  answer(JSON.stringify(body), status, headers);
}

/** The one typed-policy request the client sent: its method, path, body and headers. */
function sent(): { method: string; path: string; body: unknown; headers: Headers } {
  const calls = mockFetch.mock.calls.filter(([input]) => String(input).startsWith(ROUTE));
  expect(calls).toHaveLength(1);
  const [input, init] = calls[0] as [string, RequestInit];
  return {
    method: String(init.method),
    path: new URL(input).pathname,
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
    headers: new Headers(init.headers as HeadersInit),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('the operations', () => {
  it('edition() reports the deployment boundary', async () => {
    answerJSON({
      success: true,
      catalog: 'deployment',
      root: 'organization',
      max_documents: 20,
      constructs: {
        edition: 'community',
        obligation_families: ['disclosure'],
        attribute_namespaces: ['args'],
        group_scope: false,
        separation_of_duties: false,
        tier_established: true,
        reserved: ['step_up'],
      },
      persistence: 'database',
      signing_key_custody: 'process',
    });
    const edition = await client().typedPolicies.edition();
    const request = sent();
    expect([request.method, request.path]).toEqual(['GET', `${TYPED_POLICIES_PATH}/edition`]);
    expect(edition.max_documents).toBe(20);
    expect(edition.persistence).toBe('database');
    expect(edition.constructs?.edition).toBe('community');
    expect(edition.constructs?.group_scope).toBe(false);
    expect(edition.constructs?.reserved).toEqual(['step_up']);
  });

  it('validate() sends the document and fixtures and returns every finding', async () => {
    answerJSON({
      success: false,
      findings: [
        {
          code: 'ACTION_NOT_REGISTERED',
          severity: 'reject',
          policy_id: 'grant.refund',
          summary: 'The action selector names an action that is not in the action registry.',
          detail: 'Action::tool.cal',
        },
      ],
    });
    const validation = await client().typedPolicies.validate(BODY.document, BODY.fixtures);
    const request = sent();
    expect([request.method, request.path, request.body]).toEqual([
      'POST',
      `${TYPED_POLICIES_PATH}/validate`,
      BODY,
    ]);
    // A refused document is a successful validation: an answer, not an error.
    expect(validation.success).toBe(false);
    expect(validation.findings[0]?.code).toBe('ACTION_NOT_REGISTERED');
    expect(validation.findings[0]?.policy_id).toBe('grant.refund');
  });

  it('validate() without fixtures sends the document alone', async () => {
    answerJSON({ success: true, findings: [] });
    await client().typedPolicies.validate(BODY.document);
    expect(sent().body).toEqual({ document: BODY.document });
  });

  it('publish() sends the document and fixtures and returns the digest', async () => {
    answerJSON({ success: true, digest: DIGEST, version: 1, findings: [] });
    const published = await client().typedPolicies.publish(BODY.document, BODY.fixtures);
    const request = sent();
    expect([request.method, request.path, request.body]).toEqual([
      'POST',
      `${TYPED_POLICIES_PATH}/publish`,
      BODY,
    ]);
    expect([published.digest, published.version]).toEqual([DIGEST, 1]);
  });

  it('a publication answered without a digest is an error', async () => {
    answerJSON({ success: true, findings: [] });
    await expect(client().typedPolicies.publish(BODY.document, BODY.fixtures)).rejects.toThrow(
      /without a digest/
    );
  });

  it.each([
    ['with a reason', { reason: 'baseline' }, { digest: DIGEST, reason: 'baseline' }],
    ['without', {}, { digest: DIGEST }],
  ])('activate() %s', async (_label, options, body) => {
    answerJSON({ success: true, activation: { digest: DIGEST, actor: 'admin' } });
    const activation = await client().typedPolicies.activate(DIGEST, options);
    const request = sent();
    expect([request.method, request.path, request.body]).toEqual([
      'POST',
      `${TYPED_POLICIES_PATH}/activate`,
      body,
    ]);
    expect(activation.activation.digest).toBe(DIGEST);
  });

  it('active() keeps the exact text that was signed', async () => {
    // Deliberately not the way JSON.stringify would render it: the source is
    // the signed text, and re-serialising would change what a digest covers.
    const signed = '{"api_version": "v1",  "metadata":{"document_id":"org-baseline"}}';
    answer(signed);
    const active = await client().typedPolicies.active();
    expect(active?.source).toBe(signed);
    expect((active?.document.metadata as Record<string, unknown>).document_id).toBe('org-baseline');
  });

  it('active() is null when nothing is active', async () => {
    answerJSON({ success: false, reason: 'nothing_active', error: 'nothing is active' }, 404);
    await expect(client().typedPolicies.active()).resolves.toBeNull();
  });

  it.each([
    ['a plain-text 404', () => answer('404 page not found', 404), undefined],
    [
      'a 404 with another reason',
      () => answerJSON({ success: false, reason: 'no_such_endpoint', error: 'no route' }, 404),
      'no_such_endpoint',
    ],
  ])('active() on %s is a typed refusal, not nothing active', async (_label, respond, reason) => {
    // A platform before v11.0.0, or an endpoint that is not an agent, is not
    // "nothing active".
    respond();
    const caught = await client()
      .typedPolicies.active()
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(TypedPolicyRefusal);
    expect([
      (caught as TypedPolicyRefusal).statusCode,
      (caught as TypedPolicyRefusal).reason,
    ]).toEqual([404, reason]);
  });

  it('edition() names its vocabulary', async () => {
    answerJSON({
      success: true,
      catalog: 'deployment',
      catalog_digest: 'sha256:vocabulary',
      registry_version: 2,
      catalog_fixture: true,
    });
    const edition = await client().typedPolicies.edition();
    expect([edition.catalog_digest, edition.registry_version, edition.catalog_fixture]).toEqual([
      'sha256:vocabulary',
      2,
      true,
    ]);
  });

  it('edition() without the vocabulary members reads them as absent', async () => {
    answerJSON({ success: true, catalog: 'deployment' });
    const edition = await client().typedPolicies.edition();
    expect([edition.catalog_digest, edition.registry_version, edition.catalog_fixture]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('publish() carries the template omission report', async () => {
    answerJSON({
      success: true,
      digest: DIGEST,
      version: 1,
      findings: [],
      template_omissions: { omitted: ['sys_a', 'sys_b'], of: 22, message: 'omits 2 of 22' },
    });
    const published = await client().typedPolicies.publish(BODY.document, BODY.fixtures);
    expect(published.template_omissions).toEqual({
      omitted: ['sys_a', 'sys_b'],
      of: 22,
      message: 'omits 2 of 22',
    });
    expect(published.template_omissions_unavailable).toBeUndefined();
  });

  it('a publication whose omission report is unavailable says why', async () => {
    answerJSON({
      success: true,
      digest: DIGEST,
      version: 1,
      template_omissions_unavailable: 'the organization template could not be read',
    });
    const published = await client().typedPolicies.publish(BODY.document, BODY.fixtures);
    expect(published.template_omissions).toBeUndefined();
    expect(published.template_omissions_unavailable).toBe(
      'the organization template could not be read'
    );
  });

  it('activate() carries the omission report beside the record, not inside it', async () => {
    answerJSON({
      success: true,
      activation: { digest: DIGEST },
      template_omissions: { omitted: ['sys_a'], of: 22, message: 'omits 1 of 22' },
    });
    const activation = await client().typedPolicies.activate(DIGEST);
    expect(activation.template_omissions).toEqual({
      omitted: ['sys_a'],
      of: 22,
      message: 'omits 1 of 22',
    });
    expect(activation.template_omissions_unavailable).toBeUndefined();
    expect(activation.activation).not.toHaveProperty('template_omissions');
  });

  it('an activation whose omission report is unavailable says why', async () => {
    answerJSON({
      success: true,
      activation: { digest: DIGEST },
      template_omissions_unavailable: 'the organization template could not be read',
    });
    const activation = await client().typedPolicies.activate(DIGEST);
    expect(activation.template_omissions).toBeUndefined();
    expect(activation.template_omissions_unavailable).toBe(
      'the organization template could not be read'
    );
  });

  it('a system control names itself, and is not mandatory when unsaid', async () => {
    answerJSON({
      success: true,
      system: {
        controls: [
          { id: 'sys.a', name: 'Block DROP TABLE', mandatory: true },
          { id: 'sys.b' },
          { id: 'sys.c', mandatory: null },
        ],
      },
    });
    const system = await client().typedPolicies.system();
    // Compared by value against false, so a drift back to undefined fails here.
    expect(system.controls.map(c => [c.id, c.name, c.mandatory])).toEqual([
      ['sys.a', 'Block DROP TABLE', true],
      ['sys.b', undefined, false],
      ['sys.c', undefined, false],
    ]);
  });

  it('system() returns the shipped corpus', async () => {
    answerJSON({
      success: true,
      system: {
        root: 'system',
        version: 3,
        digest: 'sha256:system',
        authority: 'shipped_corpus',
        controls: [
          {
            id: 'sys.pii.ssn',
            authority: 'constraint',
            assurance: 'enforcement',
            mandatory: true,
            description: 'SSN',
            obligations: [{ type: 'field_redact' }],
          },
        ],
        assurance_counts: { enforcement: 1 },
        document: { api_version: 'v1' },
      },
    });
    const system = await client().typedPolicies.system();
    expect([system.root, system.version, system.digest]).toEqual(['system', 3, 'sha256:system']);
    expect(system.controls[0]?.assurance).toBe('enforcement');
    expect(system.controls[0]?.obligations).toEqual([{ type: 'field_redact' }]);
    expect(system.assurance_counts).toEqual({ enforcement: 1 });
  });
});

type Operation = 'edition' | 'validate' | 'publish' | 'activate' | 'active' | 'system';

function call(operation: Operation): Promise<unknown> {
  const typed = client().typedPolicies;
  switch (operation) {
    case 'validate':
      return typed.validate(BODY.document, BODY.fixtures);
    case 'publish':
      return typed.publish(BODY.document, BODY.fixtures);
    case 'activate':
      return typed.activate(DIGEST);
    default:
      return typed[operation]();
  }
}

describe('what the platform sends for a nil Go collection: JSON null', () => {
  // A real stack's clean validation answered "findings": null. These are every
  // such field the platform declares without omitempty.
  it.each<[Operation, unknown, (result: never) => unknown, unknown]>([
    ['validate', { success: true, findings: null }, (r: { findings: unknown }) => r.findings, []],
    [
      'publish',
      { success: true, digest: DIGEST, version: 1, findings: null },
      (r: { findings: unknown }) => r.findings,
      [],
    ],
    [
      'edition',
      {
        success: true,
        constructs: { edition: 'community', obligation_families: null, attribute_namespaces: null },
      },
      (r: { constructs: { obligation_families: unknown; attribute_namespaces: unknown } }) => [
        r.constructs.obligation_families,
        r.constructs.attribute_namespaces,
      ],
      [[], []],
    ],
    [
      'system',
      {
        success: true,
        system: { root: 'system', controls: null, assurance_counts: null, document: null },
      },
      (r: { controls: unknown; assurance_counts: unknown; document: unknown }) => [
        r.controls,
        r.assurance_counts,
        r.document,
      ],
      [[], {}, {}],
    ],
    [
      'publish',
      { success: true, digest: DIGEST, template_omissions: null },
      (r: { template_omissions: unknown }) => r.template_omissions,
      undefined,
    ],
    [
      'publish',
      {
        success: true,
        digest: DIGEST,
        template_omissions: { omitted: null, of: 22, message: 'm' },
      },
      (r: { template_omissions: { omitted: unknown } }) => r.template_omissions.omitted,
      [],
    ],
  ])('%s reads null as empty', async (operation, body, read, expected) => {
    answerJSON(body);
    expect(read((await call(operation)) as never)).toEqual(expected);
  });
});

const APPROVER = {
  code: 'APPROVER_IS_AUTHOR',
  severity: 'reject',
  summary: 'the author may not approve their own publication',
};

function refusal(reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { success: false, reason, error: `refused: ${reason}`, ...extra };
}

describe('the refusals', () => {
  it.each<[string, Operation, number, Record<string, unknown>, Record<string, string>]>([
    [
      'publish 422, separation of duties',
      'publish',
      422,
      refusal('publication_refused', { findings: [APPROVER] }),
      {},
    ],
    [
      'publish 422, the document',
      'publish',
      422,
      refusal('document_refused', { findings: [] }),
      {},
    ],
    [
      'publish 402, the tier limit',
      'publish',
      402,
      refusal('tier_limit', { code: 'ERR_TIER_LIMIT_ORG_ROOT_POLICY', policy: 'grant.refund' }),
      {},
    ],
    [
      'publish 402, the ledger outage',
      'publish',
      402,
      refusal('tier_limit', { code: 'ERR_TIER_LIMIT_ORG_ROOT_POLICY' }),
      { 'Retry-After': '30' },
    ],
    ['publish 429, the artifact cap', 'publish', 429, refusal('artifact_cap'), {}],
    ['publish 400', 'publish', 400, refusal('document_id_required'), {}],
    ['activate 409', 'activate', 409, refusal('activation_refused'), {}],
    ['validate 503', 'validate', 503, refusal('catalog_not_configured'), {}],
    ['edition 404', 'edition', 404, refusal('no_such_endpoint'), {}],
    // A v11.0.0 platform answers a document store it cannot read with 503
    // storage_unavailable, not with nothing_active (getaxonflow/axonflow-enterprise#4255).
    [
      'active 503, a document store that cannot be read',
      'active',
      503,
      refusal('storage_unavailable'),
      {},
    ],
  ])('%s is a typed refusal', async (_label, operation, status, body, headers) => {
    answerJSON(body, status, headers);
    const caught = await call(operation).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(TypedPolicyRefusal);
    const typed = caught as TypedPolicyRefusal;
    expect([typed.statusCode, typed.reason, typed.code]).toEqual([status, body.reason, body.code]);
    expect(typed.message).toBe(body.error);
    expect(typed.findings.map(f => f.code)).toEqual(
      ((body.findings as Array<{ code: string }> | undefined) ?? []).map(f => f.code)
    );
    expect(typed.retryAfter).toBe(
      headers['Retry-After'] ? Number(headers['Retry-After']) : undefined
    );
    // A tier refusal names the policy that crossed the ceiling; an outage
    // refusal (with Retry-After) names none.
    expect(typed.policy).toBe(body.policy);
  });

  it('a refusal is still an APIError, carrying the status and the body', async () => {
    const body = refusal('activation_refused');
    answerJSON(body, 409);
    const caught = await call('activate').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(APIError);
    expect((caught as APIError).statusCode).toBe(409);
    expect(JSON.parse((caught as APIError).body)).toEqual(body);
  });

  it('a 401 is an AuthenticationError carrying the platform text', async () => {
    answerJSON(refusal('org_not_stamped'), 401);
    const caught = await call('system').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(AuthenticationError);
    expect((caught as Error).message).toBe('refused: org_not_stamped');
  });

  it('a refusal without a JSON body still names its status', async () => {
    answer('bad gateway', 502);
    const caught = await call('edition').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(TypedPolicyRefusal);
    expect([
      (caught as TypedPolicyRefusal).statusCode,
      (caught as TypedPolicyRefusal).reason,
    ]).toEqual([502, undefined]);
    expect((caught as Error).message).toBe('HTTP 502 from /edition');
  });

  it('a success whose body is not an object is an error', async () => {
    answerJSON(['not', 'an', 'object']);
    const caught = await call('edition').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(AxonFlowError);
    expect((caught as Error).message).toMatch(/not an object/);
  });
});

describe('the clients', () => {
  it('a method taken off the getter is bound to its client', async () => {
    answerJSON({ success: true, digest: DIGEST, version: 1, findings: [] });
    const { publish } = client().typedPolicies;
    expect((await publish(BODY.document, BODY.fixtures)).digest).toBe(DIGEST);
  });

  it('a derived client sends as itself, and the parent as before', async () => {
    const system = { success: true, system: { root: 'system', controls: [] } };
    const parent = client();
    answerJSON(system);
    await parent.asUser('user-token').typedPolicies.system();
    expect(sent().headers.get(HEADER_USER_TOKEN)).toBe('user-token');

    mockFetch.mockReset();
    answerJSON(system);
    await parent.typedPolicies.system();
    expect(sent().headers.get(HEADER_USER_TOKEN)).toBeNull();
  });
});

describe('when the platform cannot be reached', () => {
  // The transport's own error reaches the caller: not a refusal, and not a
  // "nothing active".
  it.each<[string, () => Error]>([
    ['a connection refusal', () => new TypeError('fetch failed')],
    [
      'a timeout',
      () => new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    ],
  ])('%s on active(), publish() and activate() is the transport error', async (_label, error) => {
    for (const operation of ['active', 'publish', 'activate'] as Operation[]) {
      const thrown = error();
      mockFetch.mockReset();
      mockFetch.mockRejectedValue(thrown);
      const caught = await call(operation).catch((e: unknown) => e);
      expect(caught).toBe(thrown);
      expect(caught).not.toBeInstanceOf(TypedPolicyRefusal);
    }
  });
});

describe('the example', () => {
  it('finds its default document from its own location', () => {
    // examples/typed-policies runs from any directory: its default body is found
    // from the file's own location, and it is the vendored fixture.
    expect(DEFAULT_BODY_PATH).toBe(join(__dirname, 'fixtures', 'typed-policy-publish-body.json'));
    expect(existsSync(DEFAULT_BODY_PATH)).toBe(true);
  });
});
