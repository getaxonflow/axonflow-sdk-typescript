/**
 * Regression tests for the review-feedback fixes on listProviders():
 *
 *  1. Wire-shape: `LLMProvider` surfaces endpoint, model, region,
 *     rate_limit, timeout_seconds, settings.
 *  2. Pagination: `listProvidersPaged` returns `LLMProviderListResponse`
 *     with `pagination`; `listAllProviders` walks every page.
 *  3. Network errors: a fetch rejection bubbles up as an error rather
 *     than an "all tests pass" lie.
 *  4. Bare-array response from older platforms decodes correctly.
 */

import { AxonFlow } from '../src/client';
import type { LLMProvider } from '../src/types/llm-providers';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('listProviders() review fixes', () => {
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

  it('surfaces endpoint, model, region, rate_limit, timeout_seconds, settings', async () => {
    mockFetch.mockReturnValueOnce(
      mockOk({
        providers: [
          {
            name: 'anthropic',
            type: 'anthropic',
            enabled: true,
            has_api_key: true,
            endpoint: 'https://api.anthropic.com',
            model: 'claude-haiku-4-5',
            region: 'us-east-1',
            rate_limit: 60,
            timeout_seconds: 30,
            settings: { temperature_default: 0.2 },
            health: { status: 'healthy' },
          },
        ],
        pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      })
    );

    const providers = await client.listProviders();
    expect(providers).toHaveLength(1);
    const p = providers[0];
    expect(p.endpoint).toBe('https://api.anthropic.com');
    expect(p.model).toBe('claude-haiku-4-5');
    expect(p.region).toBe('us-east-1');
    expect(p.rate_limit).toBe(60);
    expect(p.timeout_seconds).toBe(30);
    expect(p.settings).toEqual({ temperature_default: 0.2 });
  });

  it('listProvidersPaged returns pagination metadata', async () => {
    mockFetch.mockReturnValueOnce(
      mockOk({
        providers: [{ name: 'p1', type: 'openai', enabled: true, has_api_key: true }],
        pagination: { page: 2, page_size: 5, total_items: 7, total_pages: 2 },
      })
    );

    const result = await client.listProvidersPaged({ page: 2, page_size: 5 });
    expect(result.pagination).toEqual({
      page: 2,
      page_size: 5,
      total_items: 7,
      total_pages: 2,
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=5');
  });

  it('listAllProviders walks every page', async () => {
    mockFetch
      .mockReturnValueOnce(
        mockOk({
          providers: [
            { name: 'a', type: 'openai', enabled: true, has_api_key: true },
            { name: 'b', type: 'openai', enabled: true, has_api_key: true },
          ],
          pagination: { page: 1, page_size: 2, total_items: 3, total_pages: 2 },
        })
      )
      .mockReturnValueOnce(
        mockOk({
          providers: [{ name: 'c', type: 'anthropic', enabled: true, has_api_key: true }],
          pagination: { page: 2, page_size: 2, total_items: 3, total_pages: 2 },
        })
      );

    const all = await client.listAllProviders({ page_size: 2 });
    expect(all.map((p: LLMProvider) => p.name)).toEqual(['a', 'b', 'c']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on network error (fetch rejection)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network unreachable'));
    await expect(client.listProviders()).rejects.toBeDefined();
  });

  it('decodes bare-array response (older platform fallback)', async () => {
    // Older platforms may have returned a bare array rather than the wrapped object.
    mockFetch.mockReturnValueOnce(
      mockOk([{ name: 'legacy', type: 'openai', enabled: true, has_api_key: true }])
    );

    const providers = await client.listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('legacy');
  });

  it('decodes bare-array response with synthetic pagination meta', async () => {
    mockFetch.mockReturnValueOnce(
      mockOk([
        { name: 'a', type: 'openai', enabled: true, has_api_key: true },
        { name: 'b', type: 'anthropic', enabled: true, has_api_key: true },
      ])
    );

    const result = await client.listProvidersPaged();
    expect(result.providers).toHaveLength(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.total_items).toBe(2);
    expect(result.pagination.total_pages).toBe(1);
  });

  it('combines multiple filters with proper URL encoding', async () => {
    mockFetch.mockReturnValueOnce(mockOk({ providers: [] }));
    await client.listProviders({
      type: 'azure-openai',
      enabled: true,
      page: 3,
      page_size: 50,
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('type=azure-openai');
    expect(url).toContain('enabled=true');
    expect(url).toContain('page=3');
    expect(url).toContain('page_size=50');
  });
});
