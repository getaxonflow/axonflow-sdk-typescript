/**
 * Tests for client.listProviders().
 *
 * Pins the wire-shape contract for `GET /api/v1/llm-providers` and
 * confirms the optional `type` and `enabled` filters get passed through
 * as query strings. Closes the parity gap with the Java/Python/Go SDKs.
 */

import { AxonFlow } from '../src/client';
import type { LLMProvider } from '../src/types/llm-providers';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('listProviders()', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });
  });

  const mockOk = (data: unknown) =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });

  it('returns typed providers with health snapshot', async () => {
    mockFetch.mockReturnValueOnce(
      mockOk({
        providers: [
          {
            name: 'anthropic',
            type: 'anthropic',
            enabled: true,
            priority: 0,
            weight: 0,
            has_api_key: true,
            health: {
              status: 'healthy',
              message: 'provider is operational',
              last_checked: '2026-04-28T08:45:12Z',
            },
          },
          {
            name: 'openai',
            type: 'openai',
            enabled: true,
            has_api_key: true,
            health: { status: 'unhealthy', message: 'billing exceeded' },
          },
        ],
      })
    );

    const providers = await client.listProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].name).toBe('anthropic');
    expect(providers[0].health?.status).toBe('healthy');
    expect(providers[1].health?.status).toBe('unhealthy');
  });

  it('passes type filter as query string', async () => {
    mockFetch.mockReturnValueOnce(mockOk({ providers: [] }));
    await client.listProviders({ type: 'anthropic' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/llm-providers?type=anthropic');
  });

  it('passes enabled=false filter as query string', async () => {
    mockFetch.mockReturnValueOnce(mockOk({ providers: [] }));
    await client.listProviders({ enabled: false });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('enabled=false');
  });

  it('combines multiple filters with &', async () => {
    mockFetch.mockReturnValueOnce(mockOk({ providers: [] }));
    await client.listProviders({ type: 'openai', enabled: true });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('type=openai');
    expect(url).toContain('enabled=true');
    expect(url).toContain('?');
    expect(url).toContain('&');
  });

  it('returns empty array when server returns no providers', async () => {
    mockFetch.mockReturnValueOnce(mockOk({ providers: [] }));
    const providers = await client.listProviders();
    expect(providers).toEqual([]);
  });

  it('handles provider response missing health field', async () => {
    mockFetch.mockReturnValueOnce(
      mockOk({
        providers: [{ name: 'ollama', type: 'ollama', enabled: true, has_api_key: false }],
      })
    );
    const providers: LLMProvider[] = await client.listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].health).toBeUndefined();
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: 'forbidden' }),
        text: () => Promise.resolve('forbidden'),
      })
    );
    await expect(client.listProviders()).rejects.toBeDefined();
  });
});
