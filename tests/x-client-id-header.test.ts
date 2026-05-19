/**
 * X-Client-ID header verification (v9 identity).
 *
 * Every governed request carries X-Client-ID alongside Basic Auth. The
 * agent's apiAuthMiddleware overwrites the header with its own auth-derived
 * value, so a missing or wrong client-side header is harmless server-side.
 * These tests pin SDK-emitted behaviour so future regressions are caught
 * early.
 */

import { AxonFlow } from '../src/client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(body: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('X-Client-ID header (v9)', () => {
  it('emits X-Client-ID: community when no clientId configured', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ allowed: true }));
    const client = new AxonFlow({ endpoint: 'http://localhost:8080' });
    await client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Client-ID': 'community' }),
      })
    );
  });

  it('emits X-Client-ID matching the configured clientId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ allowed: true }));
    const client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'acme-corp',
      clientSecret: 'secret',
    });
    await client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Client-ID': 'acme-corp' }),
      })
    );
  });

  it('does NOT emit legacy X-Tenant-ID (agent accepts it as alias for back-compat)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ allowed: true }));
    const client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'acme-corp',
      clientSecret: 'secret',
    });
    await client.mcpCheckInput({ connectorType: 'postgres', statement: 'SELECT 1' });
    const [, init] = mockFetch.mock.calls[0];
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers).not.toHaveProperty('X-Tenant-ID');
    expect(headers).not.toHaveProperty('x-tenant-id');
  });
});
