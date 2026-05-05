/**
 * X-Axonflow-Client header injection — ADR-050 §4.
 *
 * Asserts every governed HTTP path forwards `X-Axonflow-Client: sdk-typescript/<VERSION>`
 * so the agent can derive request scope (sdk) and validate against the
 * token's aud.scope via HasScope().
 *
 * The header value is sourced from the bundled VERSION constant; the consumer
 * cannot spoof its own client identity through config (intentional — that's
 * the agent's defense-in-depth posture).
 */

import { AxonFlow } from '../src/client';
import { VERSION } from '../src/version';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const EXPECTED_CLIENT = `sdk-typescript/${VERSION}`;

function jsonResponse(body: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

function makeClient() {
  return new AxonFlow({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    tenant: 'test-tenant',
    endpoint: 'http://localhost:8080',
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('X-Axonflow-Client header injection', () => {
  it('includes X-Axonflow-Client on mcpCheckInput', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ allowed: true }));
    await makeClient().mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Axonflow-Client': EXPECTED_CLIENT,
        }),
      }),
    );
  });

  it('includes X-Axonflow-Client on queryConnector', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }));
    await makeClient().queryConnector('postgres', 'SELECT 1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Axonflow-Client': EXPECTED_CLIENT,
        }),
      }),
    );
  });

  it('header carries the correct format: sdk-typescript/<semver>', () => {
    // Sanity check — agent's deriveScopeFromClientHeader splits on '/' and
    // maps "sdk-*" prefixes to scope=sdk. If we ever ship a value with extra
    // slashes or the wrong prefix this fails loudly so we don't regress
    // agent-side parsing in production.
    expect(EXPECTED_CLIENT).toMatch(/^sdk-typescript\/[0-9]+\.[0-9]+\.[0-9]+/);
    expect(EXPECTED_CLIENT.split('/')).toHaveLength(2);
    expect(EXPECTED_CLIENT.startsWith('sdk-')).toBe(true);
  });
});
