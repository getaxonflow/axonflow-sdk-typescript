/**
 * How the SDK reports the platform's deprecation of its legacy policy routes.
 *
 * A v11 platform stamps every response from its deprecated policy surface, and the
 * client reports each stamped route ONCE per client through
 * `PlatformRouteDeprecationWarning`, keyed by method and path without the query, and
 * shared with clients derived through `asUser`. The stamps below are exactly what the
 * platform's `policypath.StampDeprecation` writes at 857455033 (`X-AxonFlow-Removed-In`
 * and the successor `Link`, `Deprecation` omitted until release prep sets the tag
 * date), and what it writes from the v11.0.0 tag (`Deprecation: @<unix seconds>`).
 * The simulation routes are registered only on an Evaluation+ licence.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { AxonFlow } from '../src/client';
import { LegacyPolicyWriteFrozenError, PlatformRouteDeprecationWarning } from '../src/errors';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ENDPOINT = 'http://localhost:8080';
const STAMPED_TODAY = {
  'X-Axonflow-Removed-In': 'v11.1',
  Link: '</api/v1/typed-policies>; rel="successor-version"',
};
const STAMPED_AT_THE_TAG = { ...STAMPED_TODAY, Deprecation: '@1788220800' };
const FROZEN_BODY = {
  error: {
    code: 'LEGACY_POLICY_WRITE_FROZEN',
    message: 'legacy policy writes are frozen; author policy at /api/v1/typed-policies',
  },
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
  return new AxonFlow({ endpoint: ENDPOINT, clientId: 'test-client', clientSecret: 'test-secret' });
}

let emitWarning: jest.SpyInstance;

beforeEach(() => {
  mockFetch.mockReset();
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

describe('each route is reported once per client', () => {
  it('a derived client shares the memory, both ways round', async () => {
    const parent = newClient();
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMPED_TODAY));
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMPED_TODAY));
    await parent.listStaticPolicies();
    await parent.asUser('user-token').listStaticPolicies();
    expect(emitted()).toHaveLength(1);

    emitWarning.mockClear();
    const other = newClient();
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMPED_TODAY));
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMPED_TODAY));
    await other.asUser('user-token').listStaticPolicies();
    await other.listStaticPolicies();
    expect(emitted()).toHaveLength(1);
  });

  it('a different route is reported again', async () => {
    const client = newClient();
    mockFetch.mockReturnValueOnce(mockResponse([], 200, STAMPED_TODAY));
    mockFetch.mockReturnValueOnce(mockResponse({ static: [], dynamic: [] }, 200, STAMPED_TODAY));
    await client.listStaticPolicies();
    await client.getEffectiveStaticPolicies();
    expect(emitted().map(w => w.route)).toEqual([
      'GET /api/v1/static-policies',
      'GET /api/v1/static-policies/effective',
    ]);
  });
});

describe('the simulation family', () => {
  it.each([
    ['today', STAMPED_TODAY],
    ['at the tag', STAMPED_AT_THE_TAG],
  ])('each simulation route is reported once (%s)', async (_label, stamp) => {
    const client = newClient();
    for (let i = 0; i < 2; i++) {
      mockFetch.mockReturnValueOnce(mockResponse({}, 200, stamp));
      mockFetch.mockReturnValueOnce(mockResponse({}, 200, stamp));
      // An impact report on a policy a fresh organization cannot have answers 500
      // at 857455033 (enterprise #4223); the stamp rides the refusal.
      mockFetch.mockReturnValueOnce(
        mockResponse(
          {
            code: 'INTERNAL_ERROR',
            error: 'INTERNAL_ERROR',
            message: 'Failed to evaluate input 0',
          },
          500,
          stamp
        )
      );
    }
    for (let i = 0; i < 2; i++) {
      await client.simulatePolicies({ query: 'hello' });
      await client.detectPolicyConflicts();
      await expect(
        client.getPolicyImpactReport('pol_missing', [{ query: 'hello' }])
      ).rejects.toBeDefined();
    }
    const deprecation = 'Deprecation' in stamp ? stamp.Deprecation : undefined;
    expect(emitted().map(w => [w.route, w.removedIn, w.successor, w.deprecation])).toEqual(
      ['simulate', 'conflicts', 'impact-report'].map(route => [
        `POST /api/v1/policies/${route}`,
        'v11.1',
        '/api/v1/typed-policies',
        deprecation,
      ])
    );
  });
});

describe('the documented deprecations', () => {
  // The doc markers are the deliverable, so read them from the source the way
  // the compiler does, not by searching the text.
  const source = ts.createSourceFile(
    'client.ts',
    readFileSync(join(__dirname, '..', 'src', 'client.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );

  function docOf(methodName: string): { tags: readonly ts.JSDocTag[]; text: string } {
    let found: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (
        ts.isMethodDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === methodName &&
        node.body !== undefined
      ) {
        found = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (!found) throw new Error(`no method ${methodName}`);
    const docs = ts.getJSDocCommentsAndTags(found);
    return {
      tags: ts.getJSDocTags(found),
      text: docs
        .map(d => d.getText())
        .join('\n')
        .replace(/\s+/g, ' '),
    };
  }

  function tagText(tag: ts.JSDocTag): string {
    return (ts.getTextOfJSDocComment(tag.comment) ?? '').replace(/\s+/g, ' ');
  }

  it.each([
    ['simulatePolicies', 'POST /api/v1/policies/simulate'],
    ['getPolicyImpactReport', 'POST /api/v1/policies/impact-report'],
    ['detectPolicyConflicts', 'POST /api/v1/policies/conflicts'],
  ])('%s carries an @deprecated tag naming the removal and the successor', (method, route) => {
    const deprecated = docOf(method).tags.filter(t => t.tagName.text === 'deprecated');
    expect(deprecated).toHaveLength(1);
    const text = tagText(deprecated[0]);
    expect(text).toContain(
      `The platform deprecates \`${route}\` in v11.0.0 and removes it in v11.1`
    );
    expect(text).toContain('`/api/v1/typed-policies`');
    expect(text).toContain('PlatformRouteDeprecationWarning');
  });

  it.each(['createPolicyOverride', 'deletePolicyOverride'])(
    '%s documents the freeze and is not marked deprecated',
    method => {
      const doc = docOf(method);
      expect(doc.tags.some(t => t.tagName.text === 'deprecated')).toBe(false);
      expect(doc.text).toContain('`409 LEGACY_POLICY_WRITE_FROZEN`');
      expect(doc.text).toContain('LegacyPolicyWriteFrozenError');
    }
  );
});

describe('the override freeze', () => {
  it('creating an override is refused as LegacyPolicyWriteFrozenError', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(FROZEN_BODY, 409));
    const err = await newClient()
      .createPolicyOverride('pol_1', { action_override: 'warn', override_reason: 'migration' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LegacyPolicyWriteFrozenError);
    expect((err as Error).message).toBe(FROZEN_BODY.error.message);
  });

  it('deleting an override is refused as LegacyPolicyWriteFrozenError', async () => {
    mockFetch.mockReturnValueOnce(mockResponse(FROZEN_BODY, 409));
    const err = await newClient()
      .deletePolicyOverride('pol_1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LegacyPolicyWriteFrozenError);
  });
});
