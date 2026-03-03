/**
 * Telemetry Module Tests
 *
 * Verifies the anonymous usage telemetry ping behavior:
 * - Opt-out via DO_NOT_TRACK and AXONFLOW_TELEMETRY env vars
 * - Default ON for production mode, OFF for sandbox mode
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

// Mock fetch globally
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ latest_version: '3.8.0', alerts: [] }),
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
  // Restore original env and fetch
  process.env = originalEnv;
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

    it('should send when DO_NOT_TRACK is not set to 1', () => {
      process.env.DO_NOT_TRACK = '0';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should send when AXONFLOW_TELEMETRY is not off', () => {
      process.env.AXONFLOW_TELEMETRY = 'on';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
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
    it('should NOT send by default for sandbox mode', () => {
      sendTelemetryPing({
        mode: 'sandbox',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send by default for production mode', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT send for production mode without credentials (hasCredentials=false)', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        hasCredentials: false,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send for production mode with credentials (hasCredentials=true)', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        hasCredentials: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should send for production mode with hasCredentials undefined (backwards compat)', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // Config override of defaults
  // ============================================================
  describe('config telemetryEnabled override', () => {
    it('should send in sandbox mode when telemetryEnabled=true', () => {
      sendTelemetryPing({
        mode: 'sandbox',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
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

    it('config override false skips even with hasCredentials=true', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: false,
        hasCredentials: true,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Payload format
  // ============================================================
  describe('payload format', () => {
    it('should send correct payload shape', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('https://checkpoint.getaxonflow.com/v1/ping');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

      const payload: TelemetryPayload = JSON.parse(options.body);
      expect(payload.sdk).toBe('typescript');
      expect(payload.sdk_version).toBe(VERSION);
      expect(payload.platform_version).toBeNull();
      expect(payload.os).toBe(process.platform);
      expect(payload.arch).toBe(process.arch);
      expect(payload.runtime_version).toBe(process.version);
      expect(payload.deployment_mode).toBe('production');
      expect(payload.features).toEqual([]);
      expect(payload.instance_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should include deployment_mode matching the mode option', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
        telemetryEnabled: true,
      });

      const payload: TelemetryPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.deployment_mode).toBe('production');
    });

    it('should generate unique instance_id per call', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const id1 = JSON.parse(mockFetch.mock.calls[0][1].body).instance_id;
      const id2 = JSON.parse(mockFetch.mock.calls[1][1].body).instance_id;
      expect(id1).not.toBe(id2);
    });
  });

  // ============================================================
  // Silent failure on network error
  // ============================================================
  describe('silent failure', () => {
    it('should not throw when fetch rejects', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      // Let the promise settle
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw when fetch times out (AbortController)', async () => {
      // Simulate a very slow response
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 5000);
          })
      );

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      // Let the promise settle
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw when server returns non-200', async () => {
      mockFetch.mockResolvedValueOnce({
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

      // Let the promise settle
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should not throw on connection refused (TypeError)', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      expect(() => {
        sendTelemetryPing({
          mode: 'production',
          endpoint: 'https://api.axonflow.com',
        });
      }).not.toThrow();

      // Let the promise settle
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  // ============================================================
  // Custom endpoint via AXONFLOW_CHECKPOINT_URL
  // ============================================================
  describe('custom checkpoint endpoint', () => {
    it('should use AXONFLOW_CHECKPOINT_URL when set', () => {
      process.env.AXONFLOW_CHECKPOINT_URL = 'https://custom-telemetry.example.com/ping';

      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom-telemetry.example.com/ping');
    });

    it('should use default endpoint when AXONFLOW_CHECKPOINT_URL is not set', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://checkpoint.getaxonflow.com/v1/ping');
    });
  });

  // ============================================================
  // AbortController signal
  // ============================================================
  describe('abort signal', () => {
    it('should pass an AbortSignal to fetch', () => {
      sendTelemetryPing({
        mode: 'production',
        endpoint: 'https://api.axonflow.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeDefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
