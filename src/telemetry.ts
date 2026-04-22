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
 * `AXONFLOW_TELEMETRY=off` is the canonical AxonFlow-specific opt-out.
 * `DO_NOT_TRACK=1` is **deprecated** as an AxonFlow opt-out and will be
 * removed after 2026-05-05 in the next major release — when it's the only
 * thing disabling telemetry, a one-line warning is emitted so operators can
 * migrate to `AXONFLOW_TELEMETRY=off`. If both are set, the caller has
 * already migrated and no warning fires.
 *
 * Consistent with the Go, Python, and Java SDKs — the warning fires on
 * every opt-out check, not once per process, so any downstream log sink
 * sees every invocation (cron jobs, per-request child processes).
 */
function isOptedOut(): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return false;
  }
  if (process.env.DO_NOT_TRACK?.trim() === '1') {
    // Only warn when DO_NOT_TRACK is the active control. If AXONFLOW_TELEMETRY=off
    // is also set, the caller has already migrated.
    if (process.env.AXONFLOW_TELEMETRY?.trim().toLowerCase() !== 'off') {
      console.warn(
        '[AxonFlow] DO_NOT_TRACK=1 is deprecated as an AxonFlow telemetry opt-out and will be removed after 2026-05-05 in the next major release. Set AXONFLOW_TELEMETRY=off to opt out going forward. See https://docs.getaxonflow.com/docs/telemetry for details.'
      );
    }
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

export type EndpointType =
  | 'localhost'
  | 'private_network'
  | 'remote'
  | 'unknown'
  | 'community-saas';

/**
 * Classify the configured AxonFlow endpoint URL for analytics (#1525).
 *
 * Returns one of:
 *   - "localhost": localhost, 127.0.0.0/8, ::1, any expanded IPv6 loopback
 *                  (e.g. 0:0:0:0:0:0:0:1), 0.0.0.0, *.localhost
 *   - "private_network": RFC1918 v4 (10/8, 172.16-31, 192.168/16), link-local
 *                        (169.254/16), IPv6 ULA (fc00::/7, RFC4193), IPv6
 *                        link-local (fe80::/10), *.internal, *.local, *.lan,
 *                        *.intranet
 *   - "remote": everything else (public hostnames and IPs)
 *   - "unknown": on parse failure
 *
 * The raw URL is never sent to the checkpoint service — only the classification.
 *
 * v5.3.0: IPv6 ULA + link-local + expanded loopback forms added to match
 * the Python and Go SDK classifiers. Previously IPv6 private addresses like
 * http://[fd00::1]:8080 fell through to "remote" (review finding P3).
 */
export function classifyEndpoint(url: string | null | undefined): EndpointType {
  if (process.env.AXONFLOW_TRY === '1') {
    return 'community-saas';
  }

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

  // Hostname aliases + special-case IPv4 shortcuts.
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost')
  ) {
    return 'localhost';
  }

  // Private/internal hostname suffixes.
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
    if (a === 127) return 'localhost'; // 127.0.0.0/8
    if (a === 10) return 'private_network';
    if (a === 192 && b === 168) return 'private_network';
    if (a === 172 && b >= 16 && b <= 31) return 'private_network';
    if (a === 169 && b === 254) return 'private_network'; // link-local
    return 'remote';
  }

  // IPv6 classification.
  //
  // Any host that contains ':' is treated as IPv6 (URL hostname never has
  // ':' for non-IPv6). We compare against the fully-expanded form for
  // loopback ('::1' → '0:0:0:0:0:0:0:1') and against high-order hex
  // prefixes for ULA and link-local.
  if (host.includes(':')) {
    // Expanded loopback: any form equivalent to ::1.
    const expanded = expandIPv6(host);
    if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') {
      return 'localhost';
    }
    // Unspecified address :: is commonly used as a "listen-all" marker;
    // treat it like 0.0.0.0 for symmetry.
    if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') {
      return 'localhost';
    }
    // ULA fc00::/7 — first byte has high nibble 0xfc or 0xfd (first 7 bits
    // are 1111110, so the first hex pair is fc or fd).
    const firstHextet = expanded.slice(0, 4);
    if (firstHextet.startsWith('fc') || firstHextet.startsWith('fd')) {
      return 'private_network';
    }
    // Link-local fe80::/10 — first 10 bits are 1111111010, so first hextet
    // is in [fe80..febf].
    if (firstHextet >= 'fe80' && firstHextet <= 'febf') {
      return 'private_network';
    }
    return 'remote';
  }

  // Anything else — a public hostname — is remote.
  return 'remote';
}

/**
 * Expand an IPv6 address to its full 8-hextet form with every hextet
 * zero-padded to 4 hex digits. Returns the original string on parse failure.
 *
 * Examples:
 *   ::1        → 0000:0000:0000:0000:0000:0000:0000:0001
 *   fd00::1    → fd00:0000:0000:0000:0000:0000:0000:0001
 *   fe80::a    → fe80:0000:0000:0000:0000:0000:0000:000a
 *
 * This is NOT a general-purpose IPv6 parser — it assumes the input came
 * from URL().hostname after brackets are stripped, which means it's
 * already a valid compressed or uncompressed form.
 */
function expandIPv6(addr: string): string {
  // Split on the '::' separator (at most one occurrence per RFC 4291).
  let head: string[] = [];
  let tail: string[] = [];
  if (addr.includes('::')) {
    const parts = addr.split('::');
    if (parts.length !== 2) return addr;
    head = parts[0] === '' ? [] : parts[0].split(':');
    tail = parts[1] === '' ? [] : parts[1].split(':');
  } else {
    head = addr.split(':');
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return addr;
  const zeros = new Array(missing).fill('0');
  const full = [...head, ...zeros, ...tail];
  if (full.length !== 8) return addr;
  return full.map(h => h.padStart(4, '0')).join(':');
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
