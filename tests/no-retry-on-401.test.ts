/**
 * Tests that 401 is terminal across BOTH HTTP request paths in the
 * TypeScript SDK — `orchestratorRequest` AND `portalRequest`.
 *
 * Regression for getaxonflow/axonflow-enterprise#2275: a customer
 * deployment with invalid credentials caused ~30 401/hour against
 * community-saas because something in the caller's stack was retrying
 * on `AuthenticationError`. The TypeScript SDK is structurally safe —
 * both request helpers issue exactly one outbound `fetch` and throw
 * `AuthenticationError` on 401 / 403 without a retry loop — but we
 * lock the contract in with explicit assertions on both paths so that
 * a future change adding status-code-based retry that includes 401 in
 * either path fails CI.
 *
 * The orchestrator-path companion test lives in
 * `tests/audit-tool-call.test.ts` (`auditToolCall` → `orchestratorRequest`).
 * This file covers `portalRequest` via `listGitProviders` (a GET that
 * uses the portal session cookie path).
 *
 * Mutation-verified: injecting a 2-attempt retry into `portalRequest`
 * makes `expect(mockFetch).toHaveBeenCalledTimes(1)` fail with
 * `Expected number of calls: 1, Received: 2`.
 */

import { AxonFlow } from '../src/client';
import { AuthenticationError } from '../src/errors';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('401 is terminal — no retry on any request path (#2275)', () => {
  let client: AxonFlow;

  beforeEach(() => {
    // mockReset clears BOTH call history AND queued
    // `mockReturnValueOnce` responses — important here because the
    // tests below queue 2 responses each (to ensure a retry-injected
    // mutation fails at the call-count assertion rather than at
    // `response.ok` of undefined). `jest.clearAllMocks()` only resets
    // history and would leak stale queued responses across tests.
    mockFetch.mockReset();
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

  const mockJsonResponse = (data: unknown, status = 200, headers?: Headers) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: headers ?? new Headers(),
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  // Helper: hand-roll a portal session cookie by stubbing the login
  // response and then calling loginToPortal(). Keeps the test
  // independent of any session-cookie helper that might be refactored
  // away (we exercise the same public surface a customer would use).
  async function loginAndClearFetchHistory(): Promise<void> {
    const loginHeaders = new Headers();
    loginHeaders.set('set-cookie', 'axonflow_session=test-session-cookie; HttpOnly; Path=/');
    mockFetch.mockReturnValueOnce(
      mockJsonResponse(
        {
          session_id: 'test-session-cookie',
          org_id: 'test-org-001',
          email: 'admin@test.org',
          name: 'Test Admin',
          expires_at: '2099-01-01T00:00:00Z',
        },
        200,
        loginHeaders
      )
    );
    await client.loginToPortal('test-org-001', 'test123');
    expect(client.isLoggedIn()).toBe(true);
    // Reset call history so the portalRequest-path assertion is
    // unambiguous — exactly one fetch BELOW the login call.
    mockFetch.mockClear();
  }

  it('portalRequest path: must not retry on 401 — regression for #2275', async () => {
    await loginAndClearFetchHistory();

    // Server returns 401 on the portal request — same shape the
    // customer's misconfigured deployment was hitting. We queue a
    // SECOND 401 response so a hypothetical retry-on-401 mutation
    // would still return cleanly on the second call (and the test
    // would fail specifically at the `toHaveBeenCalledTimes(1)`
    // assertion below rather than blowing up on `response.ok` of
    // undefined — the assertion failure must point cleanly at the
    // retry contract being broken).
    mockFetch.mockReturnValueOnce(mockJsonResponse({ error: 'unauthorized' }, 401));
    mockFetch.mockReturnValueOnce(mockJsonResponse({ error: 'unauthorized' }, 401));

    // `listGitProviders` goes through `portalRequest('GET', ...)` and
    // is one of the simplest portal-path methods to exercise. The
    // contract under test is path-level, not method-specific.
    await expect(client.listGitProviders()).rejects.toThrow(AuthenticationError);

    // Exactly one outbound fetch — no retry. If a future change to
    // `portalRequest` or `_fetch` adds status-code-based retry that
    // includes 401, this assertion fails with "Received: 2".
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('portalRequest path: must not retry on 403 either (same terminal-class)', async () => {
    await loginAndClearFetchHistory();

    // 403 forbidden is the sibling terminal class — the SDK throws
    // AuthenticationError on both 401 and 403 in `portalRequest`. A
    // hypothetical retry loop that excluded 401 but included 403
    // would still cause the storm; lock both paths. Queue a second
    // 403 so the mutation test fails specifically at the
    // call-count assertion, not at downstream `response.ok` access.
    mockFetch.mockReturnValueOnce(mockJsonResponse({ error: 'forbidden' }, 403));
    mockFetch.mockReturnValueOnce(mockJsonResponse({ error: 'forbidden' }, 403));

    await expect(client.listGitProviders()).rejects.toThrow(AuthenticationError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
