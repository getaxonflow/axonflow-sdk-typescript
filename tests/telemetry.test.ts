/**
 * Telemetry Module Tests
 *
 * Verifies the anonymous usage telemetry ping behavior under the v8 contract:
 * - Opt-out via AXONFLOW_TELEMETRY=off env var (DO_NOT_TRACK is not honored)
 * - Default ON for every mode (mode-based suppression removed in v8.0)
 * - Sandbox-mode pings tagged stream="sandbox"; other modes omit the field
 * - Payload format correctness
 * - Silent failure on network errors
 * - Custom endpoint via AXONFLOW_CHECKPOINT_URL
 *
 * Note: jest.setup.ts sets AXONFLOW_TELEMETRY=off process-wide so unrelated
 * test files don't accidentally fire pings to checkpoint.getaxonflow.com.
 * Tests in this file that exercise the gate clear the env var in beforeEach
 * via `delete process.env.AXONFLOW_TELEMETRY`.
 */

import {
  ORG_ID_LOCAL_DEV_SENTINEL,
  sendTelemetryPing,
  telemetryOrgID,
  TelemetryPayload,
} from '../src/telemetry';
import { VERSION } from '../src/version';

// Save original env
const originalEnv = { ...process.env };

// ---------------------------------------------------------------------------
// Version constant integrity
// ---------------------------------------------------------------------------
describe('VERSION constant', () => {
  it('should match package.json version', () => {
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
  // Do NOT restore originalFetch here. sendTelemetryPing uses a fire-and-forget
  // async pattern (void IIFE) that can outlive individual tests. Restoring real
  // fetch allows lingering async operations to leak real HTTP requests to the
  // checkpoint service. Jest runs each test file in its own worker, so keeping
  // the mock active until process exit is safe and prevents telemetry leaks.
});

describe('sendTelemetryPing', () => {
  // ============================================================
  // Opt-out via environment variables
  // ============================================================
  describe('opt-out via environment variables', () => {
    it('should STILL send when only DO_NOT_TRACK=1 is set (DNT no longer honored)', async () => {
      process.env.DO_NOT_TRACK = '1';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // DNT alone is no longer honored — host CLIs inject it unconditionally
      // so it cannot be a real user signal.
      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should not send when AXONFLOW_TELEMETRY=off', () => {
      process.env.AXONFLOW_TELEMETRY = 'off';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send when AXONFLOW_TELEMETRY=off, even with DO_NOT_TRACK=1 also set', () => {
      process.env.DO_NOT_TRACK = '1';
      process.env.AXONFLOW_TELEMETRY = 'off';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not emit a console.warn when DO_NOT_TRACK=1 is set (no deprecation noise)', async () => {
      process.env.DO_NOT_TRACK = '1';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
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
  // Default mode-based behavior (v8: ON for every mode)
  // ============================================================
  describe('default mode-based behavior', () => {
    // v8: telemetry is ON for every mode. The mode-based suppression that
    // used to disable sandbox-mode pings was removed — sandbox-mode pings
    // now fire and are tagged stream="sandbox" in the payload so analytics
    // can distinguish them server-side. See CHANGELOG v8.0.0 → Removed.
    const modes = ['sandbox', 'production', 'staging', 'development'];

    modes.forEach(mode => {
      it(`should fire ping for mode=${mode}`, async () => {
        sendTelemetryPing({
          mode,
          endpoint: 'https://api.axonflow.com',
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
      });
    });

    it('should fire ping with stream=sandbox in sandbox mode', async () => {
      sendTelemetryPing({
        mode: 'sandbox',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Both: ping fires AND payload carries stream="sandbox".
      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
      const postCall = mockFetch.mock.calls.find(
        (call: [string, { method?: string }]) => call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const payload: TelemetryPayload = JSON.parse(postCall![1].body);
      expect(payload.stream).toBe('sandbox');
      // v1 schema: deployment_mode classifies from endpoint host (self_hosted),
      // NOT from config.Mode. The sandbox marker lives on `stream`.
      expect(payload.deployment_mode).toBe('self_hosted');
    });

    it('should omit the stream field for production mode', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const postCall = mockFetch.mock.calls.find(
        (call: [string, { method?: string }]) => call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const payload: TelemetryPayload = JSON.parse(postCall![1].body);
      // omit-when-not-sandbox: server defaults absent stream → "heartbeat".
      expect(payload.stream).toBeUndefined();
    });

    it('should omit the stream field for staging mode', async () => {
      sendTelemetryPing({
        mode: 'staging',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const postCall = mockFetch.mock.calls.find(
        (call: [string, { method?: string }]) => call[1]?.method === 'POST'
      );
      const payload: TelemetryPayload = JSON.parse(postCall![1].body);
      expect(payload.stream).toBeUndefined();
    });
  });

  // ============================================================
  // Localhost endpoints — telemetry enabled by default
  // ============================================================
  describe('localhost endpoints send telemetry', () => {
    it('should send when endpoint is localhost', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'http://localhost:8080',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send when endpoint is 127.0.0.1', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'http://127.0.0.1:8080',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });

    it('should send when endpoint is a remote URL', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(2); // health + checkpoint
    });
  });

  // ============================================================
  // Config override removed in v8.0
  // ============================================================
  // The `telemetryEnabled` config field was removed in v8.0 along with the
  // mode-based default-suppression rule. AXONFLOW_TELEMETRY=off is the SOLE
  // opt-out path; programmatic suppression is no longer supported. The v7.x
  // `describe('config telemetryEnabled override')` block was removed with the
  // field. See CHANGELOG v8.0.0 → Removed.

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
      expect(payload.telemetry_type).toBe('sdk');
      expect(payload.sdk).toBe('typescript');
      expect(payload.sdk_version).toBe(VERSION);
      expect(payload.platform_version).toBe('5.1.0');
      expect(payload.os).toBe(process.platform);
      expect(payload.arch).toBe(process.arch);
      expect(payload.runtime_version).toBe(process.version.replace(/^v/, ''));
      // v1 schema: deployment_mode derives from endpoint host.
      expect(payload.deployment_mode).toBe('self_hosted');
      expect(payload.features).toEqual([]);
      expect(payload.instance_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should classify deployment_mode from the endpoint (v1 schema)', async () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Index 1 = checkpoint POST (index 0 = health GET)
      const payload: TelemetryPayload = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(payload.deployment_mode).toBe('self_hosted');
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

  // ============================================================
  // org_id field (v9.1 preflight, issue #2277)
  // ============================================================
  describe('org_id (v9.1)', () => {
    describe('telemetryOrgID helper', () => {
      it('returns ORG_ID env when set (operator-supplied self-hosted)', () => {
        process.env.ORG_ID = 'acme-corp';
        expect(telemetryOrgID()).toBe('acme-corp');
      });

      it('returns local-dev-org sentinel when ORG_ID unset', () => {
        delete process.env.ORG_ID;
        expect(telemetryOrgID()).toBe(ORG_ID_LOCAL_DEV_SENTINEL);
        expect(ORG_ID_LOCAL_DEV_SENTINEL).toBe('local-dev-org'); // wire-value lock
      });

      it('treats empty ORG_ID as unset (sentinel)', () => {
        process.env.ORG_ID = '';
        expect(telemetryOrgID()).toBe(ORG_ID_LOCAL_DEV_SENTINEL);
      });

      it('passes through cs_<uuid> Community SaaS tenant identifier', () => {
        const csId = 'cs_e3a4b5c6-d7e8-4f90-a1b2-c3d4e5f6a7b8';
        process.env.ORG_ID = csId;
        expect(telemetryOrgID()).toBe(csId);
      });
    });

    describe('wire payload always carries org_id', () => {
      it('includes operator-supplied ORG_ID in posted body', async () => {
        process.env.ORG_ID = 'acme-corp';
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockFetch).toHaveBeenCalledTimes(2);
        const postCall = mockFetch.mock.calls.find(
          (call: [string, { method?: string; body?: string }]) => call[1]?.method === 'POST'
        );
        expect(postCall).toBeDefined();
        const rawBody = postCall![1].body as string;
        // Decoded shape AND wire-literal substring — wire-literal defends
        // against tag-removal mutations that JSON.stringify would silently
        // round-trip through a struct decode.
        const payload: TelemetryPayload = JSON.parse(rawBody);
        expect(payload.org_id).toBe('acme-corp');
        expect(rawBody).toContain('"org_id":"acme-corp"');
      });

      it('includes local-dev-org sentinel when ORG_ID unset', async () => {
        delete process.env.ORG_ID;
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        const postCall = mockFetch.mock.calls.find(
          (call: [string, { method?: string; body?: string }]) => call[1]?.method === 'POST'
        );
        const rawBody = postCall![1].body as string;
        const payload: TelemetryPayload = JSON.parse(rawBody);
        expect(payload.org_id).toBe('local-dev-org');
        expect(rawBody).toContain('"org_id":"local-dev-org"');
      });

      it('passes through cs_<uuid> on wire', async () => {
        const csId = 'cs_f29e9c5c-5c5b-4e0d-8e0d-aabbccddeeff';
        process.env.ORG_ID = csId;
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        const postCall = mockFetch.mock.calls.find(
          (call: [string, { method?: string; body?: string }]) => call[1]?.method === 'POST'
        );
        const rawBody = postCall![1].body as string;
        const payload: TelemetryPayload = JSON.parse(rawBody);
        expect(payload.org_id).toBe(csId);
        expect(rawBody).toContain(`"org_id":"${csId}"`);
      });
    });

    describe('wire payload always carries org_id (real-network E2E)', () => {
      // Real http.createServer-based E2E test — captures the wire body
      // for real bytes-on-the-socket proof. Restores real fetch for the
      // duration of this test only; the rest of the file uses mockFetch.
      const realFetch = globalThis.fetch;

      const runWithRealServer = async (
        orgIdValue: string | undefined
      ): Promise<{ body: string; parsed: TelemetryPayload }> => {
        const http = require('http') as typeof import('http');
        let capturedBody = '';

        const server = http.createServer((req, res) => {
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => {
              capturedBody = Buffer.concat(chunks).toString('utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ latest_version: null, alerts: [] }));
            });
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ version: '8.0.0-test' }));
          }
        });

        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
        const addr = server.address();
        if (!addr || typeof addr === 'string') throw new Error('listen failed');
        const port = addr.port;

        // Restore the real fetch for the local capture; the test body MUST
        // restore the mock at the end so neighboring tests stay isolated.
        global.fetch = realFetch as typeof fetch;

        if (orgIdValue === undefined) {
          delete process.env.ORG_ID;
        } else {
          process.env.ORG_ID = orgIdValue;
        }
        process.env.AXONFLOW_CHECKPOINT_URL = `http://127.0.0.1:${port}/v1/ping`;

        try {
          sendTelemetryPing({
            mode: 'production',
            endpoint: `http://127.0.0.1:${port}`,
          });
          // Wait long enough for: health probe + checkpoint POST to complete.
          for (let i = 0; i < 50 && !capturedBody; i += 1) {
            await new Promise(r => setTimeout(r, 50));
          }
          if (!capturedBody) throw new Error('telemetry ping never landed');
          return { body: capturedBody, parsed: JSON.parse(capturedBody) };
        } finally {
          global.fetch = mockFetch as unknown as typeof fetch;
          server.close();
          delete process.env.AXONFLOW_CHECKPOINT_URL;
        }
      };

      it('carries operator-supplied ORG_ID through to the receiver', async () => {
        const { body, parsed } = await runWithRealServer('acme-corp');
        expect(parsed.org_id).toBe('acme-corp');
        expect(body).toContain('"org_id":"acme-corp"');
      });

      it('carries the sentinel when ORG_ID unset', async () => {
        const { body, parsed } = await runWithRealServer(undefined);
        expect(parsed.org_id).toBe('local-dev-org');
        expect(body).toContain('"org_id":"local-dev-org"');
      });

      it('carries cs_<uuid> tenant identifier through to the receiver', async () => {
        const csId = 'cs_f29e9c5c-5c5b-4e0d-8e0d-aabbccddeeff';
        const { body, parsed } = await runWithRealServer(csId);
        expect(parsed.org_id).toBe(csId);
        expect(body).toContain(`"org_id":"${csId}"`);
      });
    });
  });
});
