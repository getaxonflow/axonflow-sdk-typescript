/**
 * Telemetry Module Tests
 *
 * Verifies the anonymous usage telemetry ping behavior:
 * - Opt-out via DO_NOT_TRACK and AXONFLOW_TELEMETRY env vars
 * - Default ON for all modes except sandbox
 * - Config-level override of defaults
 * - Payload format correctness
 * - Silent failure on network errors
 * - Custom endpoint via AXONFLOW_CHECKPOINT_URL
 */

import { sendTelemetryPing, TelemetryPayload } from '../src/telemetry';
import { VERSION } from '../src/version';

// Save original env and fetch
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

// ---------------------------------------------------------------------------
// Version constant integrity
// ---------------------------------------------------------------------------
describe('VERSION constant', () => {
  it('should match package.json version', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkgVersion = require('../package.json').version;
    expect(VERSION).toBe(pkgVersion);
  });
});

// Mock fetch globally — handles both /health and checkpoint calls
const mockFetch = jest.fn().mockImplementation((url: string) => {
  if (typeof url === 'string' && url.endsWith('/health')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', version: '5.1.0' }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ latest_version: '4.0.1', alerts: [] }),
  });
});

beforeEach(() => {
  // Reset env vars before each test
  process.env = { ...originalEnv };
  delete process.env.DO_NOT_TRACK;
  delete process.env.AXONFLOW_TELEMETRY;
  delete process.env.AXONFLOW_CHECKPOINT_URL;

  // Install mock fetch
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

afterEach(() => {
  // Restore original env but keep mock fetch active.
  // Real fetch must NOT be restored between tests — fire-and-forget async
  // operations (especially timeout/abort tests with 2s delays) may still be
  // in flight and would leak real HTTP requests to checkpoint.getaxonflow.com.
  process.env = originalEnv;
});

afterAll(() => {
  // Restore real fetch only after all tests complete.
  global.fetch = originalFetch;
});

describe('sendTelemetryPing', () => {
  // ============================================================
  // Opt-out via environment variables
  // ============================================================
  describe('opt-out via environment variables', () => {
    it('should not send when DO_NOT_TRACK=1', () => {
      process.env.DO_NOT_TRACK = '1';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send when AXONFLOW_TELEMETRY=off', () => {
      process.env.AXONFLOW_TELEMETRY = 'off';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send when DO_NOT_TRACK is not set to 1', async () => {
      process.env.DO_NOT_TRACK = '0';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send when AXONFLOW_TELEMETRY is not off', async () => {
      process.env.AXONFLOW_TELEMETRY = 'on';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should not send when AXONFLOW_TELEMETRY=OFF (case insensitive)', () => {
      process.env.AXONFLOW_TELEMETRY = 'OFF';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Default mode-based behavior
  // ============================================================
  describe('default mode-based behavior', () => {
    it('should NOT send when user explicitly sets sandbox mode', () => {
      sendTelemetryPing({
        mode: 'sandbox',
        explicitMode: 'sandbox',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send when sandbox is auto-detected (no explicitMode)', async () => {
      // This covers the case where TS SDK auto-selects sandbox because no credentials.
      // Only explicitly-set sandbox should disable telemetry.
      sendTelemetryPing({
        mode: 'sandbox',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send by default for production mode', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send by default for staging mode', async () => {
      sendTelemetryPing({
        mode: 'staging',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send by default for development mode', async () => {
      sendTelemetryPing({
        mode: 'development',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });
  });

  // ============================================================
  // Localhost endpoint suppression
  // ============================================================
  describe('localhost endpoint suppression', () => {
    it('should NOT send when endpoint is localhost', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'http://localhost:8080',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should NOT send when endpoint is 127.0.0.1', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'http://127.0.0.1:8080',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send when endpoint is a remote URL', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send for localhost when telemetryEnabled=true', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'http://localhost:8080',
        telemetryEnabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });
  });

  // ============================================================
  // Config override of defaults
  // ============================================================
  describe('config telemetryEnabled override', () => {
    it('should send in explicit sandbox mode when telemetryEnabled=true', async () => {
      sendTelemetryPing({
        mode: 'sandbox',
        explicitMode: 'sandbox',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should NOT send in production mode when telemetryEnabled=false', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: false,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('env var opt-out takes priority over telemetryEnabled=true', () => {
      process.env.DO_NOT_TRACK = '1';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: true,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('AXONFLOW_TELEMETRY=off takes priority over telemetryEnabled=true', () => {
      process.env.AXONFLOW_TELEMETRY = 'off';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: true,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('config override false skips regardless of mode', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: false,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Payload format
  // ============================================================
  describe('payload format', () => {
    it('should send correct payload shape', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      // Let async health check + checkpoint POST settle
      await new Promise(resolve => setTimeout(resolve, 50));

      // First call is GET /health, second is POST to checkpoint
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url, options] = mockFetch.mock.calls[1];

      expect(url).toBe('https://checkpoint.getaxonflow.com/v1/ping');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

      const payload: TelemetryPayload = JSON.parse(options.body);
      expect(payload.sdk).toBe('typescript');
      expect(payload.sdk_version).toBe(VERSION);
      expect(payload.platform_version).toBe('5.1.0');
      expect(payload.os).toBe(process.platform);
      expect(payload.arch).toBe(process.arch);
      expect(payload.runtime_version).toBe(process.version.replace(/^v/, ''));
      expect(payload.deployment_mode).toBe('production');
      expect(payload.features).toEqual([]);
      expect(payload.instance_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should include deployment_mode matching the mode option', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Index 1 = checkpoint POST (index 0 = health GET)
      const payload: TelemetryPayload = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(payload.deployment_mode).toBe('production');
    });

    it('should generate unique instance_id per call', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Each sendTelemetryPing makes 2 calls (health + checkpoint)
      expect(mockFetch).toHaveBeenCalledTimes(4);
      // Filter to only POST calls (checkpoint pings)
      const postCalls = mockFetch.mock.calls.filter(
        (call: [string, { method?: string }]) => call[1]?.method === 'POST'
      );
      expect(postCalls).toHaveLength(2);
      const id1 = JSON.parse(postCalls[0][1].body).instance_id;
      const id2 = JSON.parse(postCalls[1][1].body).instance_id;
      expect(id1).not.toBe(id2);
    });
  });

  // ============================================================
  // Silent failure on network error
  // ============================================================
  describe('silent failure', () => {
    it('should not throw when checkpoint POST rejects', async () => {
      // First call (health) succeeds, second call (checkpoint) rejects
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'healthy', version: '5.1.0' }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw when health check rejects', async () => {
      // Health rejects, checkpoint should still be attempted
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw when fetch times out (AbortController)', async () => {
      // Both calls time out
      const slowResponse = () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 5000);
        });
      mockFetch.mockImplementationOnce(slowResponse).mockImplementationOnce(slowResponse);

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw when server returns non-200', async () => {
      // Health succeeds, checkpoint returns 500
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'healthy', version: '5.1.0' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw on connection refused (TypeError)', async () => {
      // Both calls fail with connection refused
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  // ============================================================
  // Custom endpoint via AXONFLOW_CHECKPOINT_URL
  // ============================================================
  describe('custom checkpoint endpoint', () => {
    it('should use AXONFLOW_CHECKPOINT_URL when set', async () => {
      process.env.AXONFLOW_CHECKPOINT_URL = 'https://custom-telemetry.example.com/ping';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // calls[0] = health, calls[1] = checkpoint POST
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url] = mockFetch.mock.calls[1];
      expect(url).toBe('https://custom-telemetry.example.com/ping');
    });

    it('should use default endpoint when AXONFLOW_CHECKPOINT_URL is not set', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url] = mockFetch.mock.calls[1];
      expect(url).toBe('https://checkpoint.getaxonflow.com/v1/ping');
    });
  });

  // ============================================================
  // AbortController signal
  // ============================================================
  describe('abort signal', () => {
    it('should pass an AbortSignal to fetch', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Checkpoint POST (index 1) should have an abort signal
      const [, options] = mockFetch.mock.calls[1];
      expect(options.signal).toBeDefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
