/**
 * Read-path per-user identity (X-User-Token) and the read-scope contract.
 *
 * Companion to src/read-identity.ts. Also carries the #263 fail-open tests: a
 * marker document whose state this build does not recognise must be REFUSED,
 * not walked as ordinary data and sent on the wire.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { AxonFlow } from '../src/client';
import { AUTHZEN_ATTRIBUTE_MARKER, AuthZENAttribute, buildEnvelope, toWire } from '../src/authzen';
import {
  HEADER_READ_SCOPE,
  HEADER_USER_TOKEN,
  ReadScope,
  ReadScopeError,
} from '../src/read-identity';

// Distinctive on purpose: the leak tests grep whole captured streams for it,
// and a value like 'tok' would match by accident.
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.SENTINEL-USER-TOKEN-a7f3c91e.sig';
const ENDPOINT = 'http://localhost:8080';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

interface Captured {
  url: string;
  headers: Headers;
}

const captured: Captured[] = [];

function respond(
  body: unknown,
  init: { status?: number; scope?: string; location?: string } = {}
): Response {
  const headers = new Headers();
  if (init.scope !== undefined) headers.set(HEADER_READ_SCOPE, init.scope);
  if (init.location) headers.set('location', init.location);
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function queue(...responses: Response[]): void {
  for (const response of responses) {
    mockFetch.mockImplementationOnce((url: string | URL, init?: RequestInit) => {
      captured.push({ url: url.toString(), headers: new Headers(init?.headers as HeadersInit) });
      return Promise.resolve(response);
    });
  }
}

function client(overrides: Record<string, unknown> = {}): AxonFlow {
  return new AxonFlow({
    endpoint: ENDPOINT,
    clientId: 'org',
    clientSecret: 'secret',
    ...overrides,
  });
}

const ROW = { decision_id: 'd1', timestamp: '2026-04-17T12:00:00Z', decision: 'blocked' };
const EXPLANATION = { decision_id: 'd1', timestamp: '2026-04-17T12:00:00Z', decision: 'blocked' };

beforeEach(() => {
  mockFetch.mockReset();
  captured.length = 0;
  process.env.AXONFLOW_TELEMETRY = 'off';
});

// ==========================================================================
// Option plumbing: present when configured, absent when not, exactly once
// ==========================================================================

describe('presenting an identity', () => {
  it('sends no identity header at all when none is configured', async () => {
    queue(respond({ decisions: [ROW] }));
    await client().listDecisions();

    expect(captured[0].headers.has(HEADER_USER_TOKEN)).toBe(false);
  });

  it.each([
    ['explainDecision', async (c: AxonFlow) => c.explainDecision('d1'), EXPLANATION],
    ['listDecisions', async (c: AxonFlow) => c.listDecisions(), { decisions: [ROW] }],
    ['listConnectors', async (c: AxonFlow) => c.listConnectors(), { connectors: [] }],
    [
      'searchAuditLogs',
      async (c: AxonFlow) => c.searchAuditLogs({ limit: 1 }),
      [{ id: 'a1', timestamp: '2026-04-17T12:00:00Z' }],
    ],
  ])('a client-wide identity travels on %s', async (_name, call, body) => {
    queue(respond(body));
    await call(client({ userToken: TEST_TOKEN }));

    // listConnectors and searchAuditLogs are NOT reads in the scoped sense,
    // and that is the point: the agent validates this header on every route
    // it proxies, so a stale token breaks them too. The docstrings say so;
    // this is what makes that a checked claim rather than prose.
    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
  });

  it('a per-call identity overrides the client-wide one', async () => {
    queue(respond(EXPLANATION));
    await client({ userToken: 'client-level' }).explainDecision('d1', { userToken: TEST_TOKEN });

    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
  });

  it('an explicitly empty per-call identity clears the client-wide one', async () => {
    // Falling back would make the option unable to express the very state the
    // platform treats as distinct (ReadScope.None).
    queue(respond({ decisions: [] }, { scope: 'own-rows' }));
    await client({ userToken: TEST_TOKEN }).listDecisions(undefined, { userToken: '   ' });

    expect(captured[0].headers.has(HEADER_USER_TOKEN)).toBe(false);
  });

  it('a per-call identity does not become client state', async () => {
    queue(respond(EXPLANATION), respond(EXPLANATION));
    const c = client();
    await c.explainDecision('d1', { userToken: TEST_TOKEN });
    await c.explainDecision('d1');

    expect(captured[1].headers.has(HEADER_USER_TOKEN)).toBe(false);
  });

  it('trims the token', async () => {
    queue(respond(EXPLANATION));
    await client({ userToken: `  ${TEST_TOKEN}\n` }).explainDecision('d1');

    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
  });
});

describe('asUser', () => {
  it('reaches every method, including ones that take no per-call option', async () => {
    queue(respond({ connectors: [] }), respond({ connectors: [] }));
    const admin = client({ userToken: 'ADMIN-TOKEN' });

    await admin.listConnectors();
    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe('ADMIN-TOKEN');

    await admin.asUser('ALICE-TOKEN').listConnectors();
    expect(captured[1].headers.get(HEADER_USER_TOKEN)).toBe('ALICE-TOKEN');
  });

  it('does not mutate the client it was derived from', async () => {
    queue(respond({ connectors: [] }), respond({ connectors: [] }));
    const admin = client({ userToken: 'ADMIN-TOKEN' });

    admin.asUser('ALICE-TOKEN');
    await admin.listConnectors();

    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe('ADMIN-TOKEN');
  });

  it('with no token presents no identity at all', async () => {
    queue(respond({ connectors: [] }));
    await client({ userToken: TEST_TOKEN }).asUser('').listConnectors();

    expect(captured[0].headers.has(HEADER_USER_TOKEN)).toBe(false);
  });
});

// ==========================================================================
// The credential goes to the header and nowhere else
// ==========================================================================

describe('the token is a credential', () => {
  it('is not carried in an error message, even when the body echoes it back', async () => {
    // The strongest form of the mistake: the natural implementation puts the
    // response body into the error verbatim.
    queue(respond({ error: 'not found', echo: TEST_TOKEN }, { status: 404, scope: 'own-rows' }));

    const failure: unknown = await client({ userToken: TEST_TOKEN, debug: true })
      .explainDecision('d1')
      .then(() => undefined)
      .catch((err: unknown) => err);

    // Precondition: the header DID carry it, or the assertion below is vacuous.
    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
    expect(failure).toBeInstanceOf(ReadScopeError);
    expect((failure as Error).message).not.toContain(TEST_TOKEN);
  });

  it('is never sent to any origin but the configured endpoint', async () => {
    // The redirect property, asserted at the stamping site. The fetch spec
    // strips Authorization on a cross-origin redirect but its list is fixed and
    // X-User-Token is not on it — measured on Node 25, the redirect target
    // received `authorization: undefined` and `x-user-token: SENTINEL`.
    queue(
      respond({}, { status: 302, location: 'http://elsewhere.invalid/api/v1/decisions' }),
      respond({ decisions: [] }, { scope: 'own-rows' })
    );

    await client({ userToken: TEST_TOKEN }).listDecisions();

    expect(captured).toHaveLength(2);
    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
    expect(captured[1].url).toContain('elsewhere.invalid');
    expect(captured[1].headers.has(HEADER_USER_TOKEN)).toBe(false);
  });

  it('is kept across a SAME-origin redirect', async () => {
    // The other failure direction: a guard that strips too eagerly turns an
    // ordinary redirect into an unscoped read, which now refuses.
    queue(
      respond({}, { status: 302, location: `${ENDPOINT}/api/v1/decisions?page=2` }),
      respond({ decisions: [ROW] })
    );

    const rows = await client({ userToken: TEST_TOKEN }).listDecisions();

    expect(captured).toHaveLength(2);
    expect(captured[1].headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
    expect(rows).toHaveLength(1);
  });

  it('does not follow redirects at all when no identity is attached', async () => {
    // The manual follower is engaged only while a credential is in flight, so
    // an unidentified request keeps `fetch`'s own behaviour rather than
    // acquiring a second, subtly different redirect implementation.
    queue(respond({ decisions: [ROW] }));
    await client().listDecisions();

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBeUndefined();
  });
});

// TestOneTransportSite, TypeScript form: the structural half of "do not build a
// second identity plumbing".
describe('one transport site', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : [];
    });
  }

  it('spells the header once and sets it once', () => {
    const setters: string[] = [];
    const literals: string[] = [];

    for (const file of sourceFiles(join(__dirname, '..', 'src'))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          // Comments are excluded: the claim is about CODE. The header is named
          // in prose in several docstrings on purpose, and counting those would
          // make the guard fail for being well documented — which teaches the
          // next author to delete the explanation rather than the duplicate.
          const trimmed = line.trim();
          if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            return;
          }
          // Deliberately wider than the one spelling the fix uses. A guard is
          // only as wide as the syntax it matches — proven here: this census
          // went BLIND when the implementation moved from `headers.set(...)`
          // to a bracket assignment, and reported ZERO setters as a pass. All
          // the ways to write a header into a bag are counted now.
          const named = '(HEADER_USER_TOKEN|[\'"`][Xx]-[Uu]ser-[Tt]oken[\'"`]?)';
          const setter = new RegExp(
            'headers\\.(set|append)\\(\\s*' +
              named +
              '|headers\\[\\s*' +
              named +
              '\\s*\\]\\s*=' +
              '|[\'"`]?[Xx]-[Uu]ser-[Tt]oken[\'"`]?\\s*:'
          );
          if (setter.test(line)) {
            setters.push(`${file}:${index + 1}`);
          }
          if (/['"`]X-User-Token['"`]/i.test(line)) {
            literals.push(`${file}:${index + 1}`);
          }
        });
    }

    expect(setters).toHaveLength(1);
    expect(literals).toHaveLength(1);
  });
});

// ==========================================================================
// The read outcomes
// ==========================================================================

describe('read-scope surfacing', () => {
  it.each([
    ['no identity resolved', 404, 'none', true, true],
    ['not among this identity rows', 404, 'own-rows', true, false],
    ['tenant-wide caller: a real miss', 404, 'tenant', false, false],
    ['pre-#2922 platform states no scope', 404, undefined, false, false],
    ['a scope this build does not know', 404, 'segment-rows', false, false],
    ['a server fault under a scoped read', 500, 'none', false, false],
  ])('explainDecision: %s', async (_name, status, scope, wantTyped, wantMissing) => {
    queue(
      respond(
        { error: 'Decision not found or past retention window' },
        {
          status: status as number,
          scope: scope as string | undefined,
        }
      )
    );

    const failure: unknown = await client()
      .explainDecision('dec-1')
      .then(() => undefined)
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(Error);
    expect(failure instanceof ReadScopeError).toBe(wantTyped);
    if (!wantTyped) return;
    const scoped = failure as ReadScopeError;
    expect(scoped.identityMissing).toBe(wantMissing);
    expect(scoped.scope).toBe(scope);
    expect(scoped.identifier).toBe('dec-1');
    expect(scoped.resource).toBe('decision');
  });

  it('listDecisions: an empty page under scope none is refused', async () => {
    queue(respond({ decisions: [] }, { scope: 'none' }));

    const failure: unknown = await client()
      .listDecisions()
      .then(() => undefined)
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(ReadScopeError);
    expect((failure as ReadScopeError).identityMissing).toBe(true);
    // The platform answered successfully; it is the SCOPE that makes the page
    // meaningless.
    expect((failure as ReadScopeError).statusCode).toBe(200);
  });

  it.each(['own-rows', 'tenant', undefined, 'segment-rows'])(
    'listDecisions: an honestly-empty read under scope %s is not an error',
    async scope => {
      queue(respond({ decisions: [] }, { scope }));
      await expect(client().listDecisions()).resolves.toEqual([]);
    }
  );

  it('listDecisions: a populated page is never discarded on the strength of a header', async () => {
    queue(respond({ decisions: [ROW] }, { scope: 'none' }));
    await expect(client().listDecisions()).resolves.toHaveLength(1);
  });

  it.each(['none', 'None', 'NONE', ' none '])(
    'matches the scope %p case-insensitively',
    async spelling => {
      // A scope spelled `None` degrading to "no opinion" would restore the
      // vacuous empty list — too quiet a failure to leave to a constant staying
      // put.
      queue(respond({ decisions: [] }, { scope: spelling }));
      await expect(client().listDecisions()).rejects.toBeInstanceOf(ReadScopeError);
    }
  );

  it.each([
    ['array shape', [] as unknown],
    ['wrapped shape', { entries: [], total: 0 } as unknown],
  ])('audit reads: an empty %s under scope none is refused', async (_name, body) => {
    queue(respond(body, { scope: 'none' }), respond(body, { scope: 'none' }));
    const c = client();

    await expect(c.searchAuditLogs({ limit: 10 })).rejects.toBeInstanceOf(ReadScopeError);
    await expect(c.getAuditLogsByTenant('t1')).rejects.toBeInstanceOf(ReadScopeError);
  });

  it('audit reads: an honestly-empty own-rows page is not an error', async () => {
    queue(respond([], { scope: 'own-rows' }));
    await expect(client().searchAuditLogs({ limit: 10 })).resolves.toMatchObject({ entries: [] });
  });

  it('audit reads: a populated page is never discarded', async () => {
    queue(respond([{ id: 'a1', timestamp: '2026-04-17T12:00:00Z' }], { scope: 'none' }));
    const result = await client().searchAuditLogs({ limit: 10 });
    expect(result.entries).toHaveLength(1);
  });

  it('the own-rows message reports the SCOPE, not a claim about what exists', () => {
    const notYours = new ReadScopeError({
      scope: ReadScope.OwnRows,
      statusCode: 404,
      resource: 'decision',
      identifier: 'd1',
    });
    expect(notYours.identityMissing).toBe(false);
    expect(notYours.message).not.toContain('resolved no per-user identity');
    // It must not assert the row exists and is someone else's — the platform
    // answers "not yours" and "not there" identically, on purpose.
    expect(notYours.message).toContain('not there at all');

    const missing = new ReadScopeError({ scope: ReadScope.None, statusCode: 404 });
    expect(missing.message).toContain('userToken');
    expect(missing.message).toContain('@axonflow.local');
  });

  it('absent is not none', () => {
    expect(ReadScope.Absent).not.toBe(ReadScope.None);
    expect(ReadScope.Absent).toBe('');
  });
});

// ==========================================================================
// typescript#263 — a marker document with an unrecognised state must be REFUSED
// ==========================================================================

describe('the tri-state recogniser (#263)', () => {
  function envelopeWithContext(context: Record<string, unknown>) {
    // A COMPLETE evaluation. An incomplete one is refused before the attribute
    // walk ever runs, which would make every assertion below pass for the wrong
    // reason.
    return buildEnvelope({
      subject: { type: 'user', id: 'u1' },
      action: { name: 'read' },
      resource: { type: 'doc', id: 'r1' },
      context,
    });
  }

  it.each(['future-state', '', 'KNOWN', 'Absent', 'resolved'])(
    'refuses a marker document whose state is %p',
    state => {
      const document = { [AUTHZEN_ATTRIBUTE_MARKER]: true, state, value: 'leaked' };
      expect(() => toWire(envelopeWithContext({ clearance: document }))).toThrow(/clearance/);
    }
  );

  it('never lets such a document reach the wire', () => {
    // Asserted on the serialized document rather than on the throw, because
    // "it raised" and "it did not send" are different properties and only the
    // second is what the gateway sees.
    const document = { [AUTHZEN_ATTRIBUTE_MARKER]: true, state: 'future-state', value: 'leaked' };
    let wire: string | undefined;
    try {
      wire = JSON.stringify(toWire(envelopeWithContext({ clearance: document })));
    } catch {
      return; // refusing is the correct outcome
    }
    throw new Error(`the marker document reached the wire: ${wire}`);
  });

  it.each([false, 'true', 1, null, 'yes'])(
    'a marker that is not boolean true (%p) stays data',
    marker => {
      // The mirror failure direction: a caller's own bag carrying a
      // similarly-named key must NOT be turned into a refusal.
      const document = { [AUTHZEN_ATTRIBUTE_MARKER]: marker, state: 'future-state', value: 'ok' };
      const wire = toWire(envelopeWithContext({ bag: document })) as Record<string, any>;
      expect(wire.evaluation.context.bag.value).toBe('ok');
    }
  );

  it('the three recognised states still behave', () => {
    const wire = toWire(
      envelopeWithContext({
        known: AuthZENAttribute.known('v'),
        absent: AuthZENAttribute.absent(),
      })
    ) as Record<string, any>;
    expect(wire.evaluation.context.known).toBe('v');
    expect(wire.evaluation.context).not.toHaveProperty('absent');
  });

  it('differs from the pre-fix recogniser on exactly the payload that matters', () => {
    const document = { [AUTHZEN_ATTRIBUTE_MARKER]: true, state: 'future-state' };
    const preFix = (value: Record<string, unknown>) =>
      value[AUTHZEN_ATTRIBUTE_MARKER] === true &&
      (value.state === 'known' || value.state === 'absent' || value.state === 'unknown');

    expect(preFix(document)).toBe(false);
    expect(AuthZENAttribute.is(document)).toBe(true);
  });
});

// ==========================================================================
// Round 2: every credential is dropped off-origin, and a derived client owns
// every request-issuing member
// ==========================================================================

describe('credentials off-origin', () => {
  it('drops EVERY credential on a cross-origin redirect, not just the identity', async () => {
    // `fetch`'s own follower strips Authorization on a cross-origin hop. The
    // moment this SDK follows by hand — which it does whenever an identity is
    // attached — that stops happening and becomes this code's job. Dropping
    // only the new header made setting `userToken` LEAK `clientSecret` to a
    // host the caller never named, on a client that did not leak it before.
    queue(
      respond({}, { status: 302, location: 'http://elsewhere.invalid/api/v1/decisions' }),
      respond({ decisions: [] }, { scope: 'own-rows' })
    );

    await client({ userToken: TEST_TOKEN }).listDecisions();

    expect(captured).toHaveLength(2);
    const [origin, elsewhere] = captured;

    // Precondition: the origin request carried them all, or the assertions
    // below are vacuous.
    expect(origin.headers.get('authorization')).toBeTruthy();
    expect(origin.headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
    expect(origin.headers.get('x-client-id')).toBeTruthy();

    for (const credential of [
      'authorization',
      HEADER_USER_TOKEN,
      'x-client-id',
      'x-axonflow-client',
    ]) {
      expect(elsewhere.headers.get(credential)).toBeNull();
    }
  });

  it('keeps every credential across a SAME-origin redirect', async () => {
    // The other failure direction: stripping too eagerly turns an ordinary
    // redirect into an unauthenticated request.
    queue(
      respond({}, { status: 302, location: `${ENDPOINT}/api/v1/decisions?page=2` }),
      respond({ decisions: [ROW] })
    );

    await client({ userToken: TEST_TOKEN }).listDecisions();

    const [, second] = captured;
    expect(second.headers.get('authorization')).toBeTruthy();
    expect(second.headers.get(HEADER_USER_TOKEN)).toBe(TEST_TOKEN);
    expect(second.headers.get('x-client-id')).toBeTruthy();
    expect(second.headers.get('x-axonflow-client')).toBeTruthy();
  });
});

describe('a derived client owns every request-issuing member', () => {
  it('evaluate() on a derived client sends the DERIVED identity', async () => {
    // `sendAuthZEN` used to be a class-field ARROW: an own enumerable property
    // holding the PARENT's lexical `this`, which `asUser`'s Object.assign
    // copied. Every evaluate() on a derived client therefore sent the parent's
    // token, from construction — not merely after some ordering, which is what
    // made it worse than the Python sibling's.
    queue(
      respond({
        decision: true,
        context: {
          profile: 'axonflow-authzen-profile-2026-08-29',
          state: 'allow',
          category: 'data_access',
          decision_id: 'd1',
          schema_version: '2026-08-29',
        },
      })
    );

    await client({ userToken: 'ADMIN-TOKEN' })
      .asUser('ALICE-TOKEN')
      .evaluate({
        subject: { type: 'user', id: 'u1' },
        action: { name: 'read' },
        resource: { type: 'doc', id: 'r1' },
      })
      .catch(() => undefined);

    expect(captured[0].headers.get(HEADER_USER_TOKEN)).toBe('ALICE-TOKEN');
  });

  it('a fresh instance has no own-property functions', () => {
    // The census behind the fix. Any function held as an OWN property is a
    // parent-bound closure waiting to be copied by `asUser`; the next class
    // field added as an arrow is caught here rather than in production.
    const instance = client() as unknown as Record<string, unknown>;
    const ownFunctions = Object.keys(instance).filter(key => typeof instance[key] === 'function');

    expect(ownFunctions).toEqual([]);
  });
});
