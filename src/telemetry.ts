import { VERSION } from './version';

/**
 * Default checkpoint endpoint for anonymous usage telemetry.
 */
const DEFAULT_CHECKPOINT_URL = 'https://checkpoint.getaxonflow.com/v1/ping';

/**
 * Timeout for the telemetry HTTP request (milliseconds).
 */
const TELEMETRY_TIMEOUT_MS = 3000;

/**
 * Generate a random UUID v4-style identifier.
 *
 * Uses crypto.randomUUID() when available (Node 19+), otherwise falls back
 * to a Math.random()-based implementation.
 */
function generateInstanceId(): string {
  try {
    // Node 19+ and modern browsers
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to fallback
  }

  // Math.random fallback for older Node versions
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Check whether telemetry is opted-out via environment variables.
 *
 * Respects the standard DO_NOT_TRACK convention and the AxonFlow-specific
 * AXONFLOW_TELEMETRY variable.
 */
function isOptedOut(): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return false;
  }
  if (process.env.DO_NOT_TRACK?.trim() === '1') {
    return true;
  }
  if (process.env.AXONFLOW_TELEMETRY?.trim().toLowerCase() === 'off') {
    return true;
  }
  return false;
}

/**
 * Resolve the checkpoint URL, allowing override via environment variable.
 */
function resolveCheckpointUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.AXONFLOW_CHECKPOINT_URL) {
    return process.env.AXONFLOW_CHECKPOINT_URL;
  }
  return DEFAULT_CHECKPOINT_URL;
}

/**
 * Determine whether telemetry should be sent based on mode and explicit config.
 *
 * Default behavior:
 * - explicitly-set sandbox mode: OFF
 * - all other modes: ON
 *
 * The explicit `telemetryEnabled` config field overrides the default when defined.
 */
function shouldSendTelemetry(
  explicitMode: string | undefined,
  telemetryEnabled?: boolean
): boolean {
  // Explicit config override takes priority
  if (telemetryEnabled !== undefined) {
    return telemetryEnabled;
  }

  // Default: ON everywhere except explicitly-set sandbox mode.
  return explicitMode !== 'sandbox';
}

export interface TelemetryPayload {
  sdk: string;
  sdk_version: string;
  platform_version: string | null;
  os: string;
  arch: string;
  runtime_version: string;
  deployment_mode: string;
  /**
   * Classification of the configured AxonFlow endpoint URL, derived on the
   * SDK side. One of: "localhost", "private_network", "remote", "unknown".
   * The raw URL is never sent. See issue #1525.
   */
  endpoint_type: EndpointType;
  features: string[];
  instance_id: string;
}

export type EndpointType = 'localhost' | 'private_network' | 'remote' | 'unknown';

/**
 * Classify the configured AxonFlow endpoint URL for analytics (#1525).
 *
 * Returns one of:
 *   - "localhost": localhost, 127.0.0.1, ::1, 0.0.0.0, *.localhost
 *   - "private_network": RFC1918 v4, link-local, *.internal, *.local, *.lan, *.intranet
 *   - "remote": everything else (public hostnames and IPs)
 *   - "unknown": on parse failure
 *
 * The raw URL is never sent to the checkpoint service — only the classification.
 */
export function classifyEndpoint(url: string | null | undefined): EndpointType {
  if (!url) return 'unknown';

  let host: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (!host) return 'unknown';

  // Node's URL parser returns IPv6 hostnames with surrounding brackets,
  // e.g. "[::1]". Strip them so the comparison below works.
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  // IPv6 addresses in URLs come back from URL().hostname with brackets
  // stripped, so ::1 and ::1 literal both pass through as "::1".
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost')
  ) {
    return 'localhost';
  }

  if (
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.intranet')
  ) {
    return 'private_network';
  }

  // IPv4 classification.
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [a, b] = [parseInt(ipv4Match[1], 10), parseInt(ipv4Match[2], 10)];
    if (a === 10) return 'private_network';
    if (a === 192 && b === 168) return 'private_network';
    if (a === 172 && b >= 16 && b <= 31) return 'private_network';
    if (a === 169 && b === 254) return 'private_network'; // link-local
    if (a === 127) return 'localhost'; // 127.0.0.0/8
    return 'remote';
  }

  // Anything else — a public hostname — is remote.
  return 'remote';
}

/**
 * Send an anonymous telemetry ping on client initialization.
 *
 * This is fire-and-forget: the returned promise is intentionally not awaited,
 * errors are silently swallowed, and a 3-second timeout prevents blocking.
 */
export function sendTelemetryPing(options: {
  mode: string;
  explicitMode?: string;
  endpoint: string;
  telemetryEnabled?: boolean;
  debug?: boolean;
}): void {
  // Check env-level opt-out first
  if (isOptedOut()) {
    return;
  }

  // Check mode-based default and config override.
  // Use explicitMode (user's original input) so auto-detected sandbox doesn't disable telemetry.
  if (!shouldSendTelemetry(options.explicitMode, options.telemetryEnabled)) {
    return;
  }

  if (typeof console !== 'undefined') {
    console.debug(
      '[AxonFlow] Anonymous telemetry enabled. Opt out: AXONFLOW_TELEMETRY=off | https://docs.getaxonflow.com/docs/telemetry'
    );
  }

  const checkpointUrl = resolveCheckpointUrl();

  const payload: TelemetryPayload = {
    sdk: 'typescript',
    sdk_version: VERSION,
    platform_version: null,
    os: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
    runtime_version: typeof process !== 'undefined' ? process.version.replace(/^v/, '') : 'unknown',
    deployment_mode: options.mode,
    endpoint_type: classifyEndpoint(options.endpoint),
    features: [],
    instance_id: generateInstanceId(),
  };

  // Fire-and-forget: detect platform version then send ping
  try {
    void (async () => {
      try {
        // Attempt to detect platform version from the health endpoint
        payload.platform_version = await detectPlatformVersion(options.endpoint);
      } catch {
        // Silent — platform version remains null
      }

      if (options.debug) {
        console.log('[AxonFlow] Sending telemetry ping', JSON.stringify(payload, null, 2));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);

      try {
        await fetch(checkpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    })().catch(() => {
      // Silent failure — telemetry should never affect SDK behavior
    });
  } catch {
    // Silent failure — fetch may be unavailable in some environments
  }
}

/**
 * Detect the platform version by calling the agent's /health endpoint.
 * Returns the version string or null on any failure.
 */
async function detectPlatformVersion(endpoint: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const resp = await fetch(`${endpoint}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;

    const body = await resp.json();
    return typeof body.version === 'string' && body.version ? body.version : null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
