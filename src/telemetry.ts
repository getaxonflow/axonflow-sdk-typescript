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
 * Minimum remaining HTTP budget (milliseconds). Below this, skip the operation
 * rather than issue a request that is almost guaranteed to time out before any
 * useful work completes. Keeps the telemetry path from making "essentially zero
 * budget" calls when the shared deadline is nearly spent.
 */
const MIN_BUDGET_MS = 100;

/**
 * Health-probe budget ceiling. The /health probe should never consume more
 * than 1s of the total TELEMETRY_TIMEOUT_MS budget, so the checkpoint POST
 * always has enough room even when the probe hits a slow / blackholed endpoint.
 */
const HEALTH_BUDGET_CAP_MS = 1000;

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
 *
 * `DO_NOT_TRACK` is intentionally NOT honored. It is commonly inherited from
 * host tools and developer environments (CLIs like Codex and Claude Code
 * inject it unconditionally), which makes it an unreliable expression of
 * user intent for AxonFlow telemetry.
 */
function isOptedOut(): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return false;
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
 * Determine whether telemetry should be sent.
 *
 * `AXONFLOW_TELEMETRY=off` in the environment is the SOLE opt-out path.
 * Telemetry is otherwise ON by default, regardless of mode (sandbox / production
 * / anything else). Sandbox-mode pings are tagged `stream="sandbox"` in the
 * payload so analytics can still distinguish them — see TelemetryPayload.stream.
 *
 * Historical context: v7.x supported a `telemetry?: boolean` config field
 * and a `mode !== 'sandbox'` default-suppression rule. Both were removed in
 * v8.0 to leave a single, ops-controlled opt-out lever and avoid silent
 * suppression that masks real adoption signal. See CHANGELOG v8.0.0.
 */
function shouldSendTelemetry(): boolean {
  // AXONFLOW_TELEMETRY=off is the SOLE opt-out path.
  return process.env.AXONFLOW_TELEMETRY?.trim().toLowerCase() !== 'off';
}

export interface TelemetryPayload {
  /**
   * v1 telemetry-schema discriminator (axonflow-enterprise#2008). Always
   * `"sdk"` for clients of this package — the receiver routes SDK pings
   * vs plugin / platform / synthetic on this field.
   */
  telemetry_type: string;
  sdk: string;
  sdk_version: string;
  platform_version: string | null;
  os: string;
  arch: string;
  runtime_version: string;
  /**
   * v1 schema deployment-mode allowlist: `self_hosted | community_saas |
   * unknown`. Derived from the configured endpoint host plus
   * `AXONFLOW_TRY=1`; see `classifyDeploymentMode`.
   */
  deployment_mode: DeploymentMode;
  /**
   * Classification of the configured AxonFlow endpoint URL, derived on the
   * SDK side. One of: "localhost", "private_network", "remote", "unknown".
   * The raw URL is never sent. See issue #1525.
   */
  endpoint_type: EndpointType;
  features: string[];
  instance_id: string;
  /**
   * Heartbeat sub-stream classifier. Sandbox-mode clients emit `"sandbox"`
   * so analytics can distinguish dev/test pings from production heartbeat;
   * production-mode clients omit the field and the server defaults the row
   * to `stream="heartbeat"`. The wire-allowlist is enforced server-side —
   * see checkpoint-service IsValidIncomingStream.
   */
  stream?: string;
}

export type EndpointType = 'localhost' | 'private_network' | 'remote' | 'unknown';

export type DeploymentMode = 'self_hosted' | 'community_saas' | 'unknown';

/**
 * Classify the configured AxonFlow endpoint into the v1 deployment-mode
 * allowlist (`self_hosted | community_saas | unknown`). Community-SaaS
 * fires on either an `*.try.getaxonflow.com` host or `AXONFLOW_TRY=1`
 * (the explicit override path for tenants behind a custom hostname
 * proxying try.getaxonflow.com). Empty/unparseable endpoints resolve to
 * `"unknown"` rather than defaulting to `"self_hosted"` — keeps the
 * self-hosted bucket clean of config gaps.
 */
export function classifyDeploymentMode(url: string | null | undefined): DeploymentMode {
  if (process.env.AXONFLOW_TRY === '1') {
    return 'community_saas';
  }
  if (!url) return 'unknown';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (!host) return 'unknown';
  if (host === 'try.getaxonflow.com' || host.endsWith('.try.getaxonflow.com')) {
    return 'community_saas';
  }
  return 'self_hosted';
}

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
/**
 * As of v8.0 the legacy `"community-saas"` return value is removed —
 * deployment topology lives on `deployment_mode` (see
 * `classifyDeploymentMode`) per the v1 schema (axonflow-enterprise#2008).
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
 * Send an anonymous telemetry ping and return whether it landed.
 *
 * Returns `true` only when the POST received a 2xx response. Network
 * failures, timeouts, and non-2xx responses all return `false`. Used by
 * the heartbeat orchestrator (see `heartbeat.ts`) where the boolean
 * drives stamp-on-DELIVERY semantics: only successful POSTs advance the
 * stamp file.
 *
 * The caller is responsible for the gating decision — this function does
 * NOT consult `AXONFLOW_TELEMETRY`, the stamp file, or any rate-limit
 * state.
 */
export async function sendTelemetryPingNow(options: {
  mode: string;
  endpoint: string;
  debug?: boolean;
}): Promise<boolean> {
  const checkpointUrl = resolveCheckpointUrl();

  // Stream classifier: sandbox-mode clients self-tag so analytics can
  // distinguish dev/test pings from production. Production-mode clients
  // omit the field entirely and the server defaults to "heartbeat". The
  // optional-property pattern preserves byte-identical wire shape for the
  // production case relative to v7.x.
  // v1 telemetry-schema (axonflow-enterprise#2008): deployment_mode classified
  // from endpoint host (prior config.Mode-based dimension removed; now
  // reflects topology only).
  const payload: TelemetryPayload = {
    telemetry_type: 'sdk',
    sdk: 'typescript',
    sdk_version: VERSION,
    platform_version: null,
    os: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
    runtime_version: typeof process !== 'undefined' ? process.version.replace(/^v/, '') : 'unknown',
    deployment_mode: classifyDeploymentMode(options.endpoint),
    endpoint_type: classifyEndpoint(options.endpoint),
    features: [],
    instance_id: generateInstanceId(),
    ...(options.mode === 'sandbox' ? { stream: 'sandbox' } : {}),
  };

  try {
    const deadline = Date.now() + TELEMETRY_TIMEOUT_MS;

    try {
      const healthBudget = Math.min(HEALTH_BUDGET_CAP_MS, Math.max(0, deadline - Date.now()));
      if (options.endpoint && healthBudget > MIN_BUDGET_MS) {
        payload.platform_version = await detectPlatformVersion(options.endpoint, healthBudget);
      }
    } catch {
      /* platform_version remains null on failure */
    }

    if (options.debug) {
      console.log('[AxonFlow] Sending telemetry ping', JSON.stringify(payload, null, 2));
    }

    const postBudget = Math.max(0, deadline - Date.now());
    if (postBudget < MIN_BUDGET_MS) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), postBudget);

    try {
      const response = await fetch(checkpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/**
 * Send an anonymous telemetry ping on client initialization (compat shim).
 *
 * Kept for the existing test surface. Production code goes through
 * `maybeSendHeartbeat` in heartbeat.ts instead. This shim performs the
 * gating + fire-and-forget POST without consulting the 7-day stamp file.
 *
 * v8.0: `AXONFLOW_TELEMETRY=off` is the sole gate. The v7.x `explicitMode`
 * and `telemetryEnabled` parameters were removed — the latter together with
 * the `AxonFlowConfig.telemetry` field, the former together with the
 * mode-based default-suppression rule.
 */
export function sendTelemetryPing(options: {
  mode: string;
  endpoint: string;
  debug?: boolean;
}): void {
  // Check env-level opt-out first
  if (isOptedOut()) {
    return;
  }

  if (!shouldSendTelemetry()) {
    return;
  }

  if (typeof console !== 'undefined') {
    console.debug(
      '[AxonFlow] Anonymous telemetry enabled. Opt out: AXONFLOW_TELEMETRY=off | https://docs.getaxonflow.com/docs/telemetry'
    );
  }

  const checkpointUrl = resolveCheckpointUrl();

  // Stream classifier: sandbox-mode clients self-tag so analytics can
  // distinguish dev/test pings from production. Production-mode clients
  // omit the field entirely and the server defaults to "heartbeat".
  // v1 telemetry-schema (axonflow-enterprise#2008): deployment_mode classified
  // from endpoint host (prior config.Mode-based dimension removed; now
  // reflects topology only).
  const payload: TelemetryPayload = {
    telemetry_type: 'sdk',
    sdk: 'typescript',
    sdk_version: VERSION,
    platform_version: null,
    os: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
    runtime_version: typeof process !== 'undefined' ? process.version.replace(/^v/, '') : 'unknown',
    deployment_mode: classifyDeploymentMode(options.endpoint),
    endpoint_type: classifyEndpoint(options.endpoint),
    features: [],
    instance_id: generateInstanceId(),
    ...(options.mode === 'sandbox' ? { stream: 'sandbox' } : {}),
  };

  // Fire-and-forget: detect platform version then send ping.
  //
  // Both network operations share a single monotonic deadline so the total
  // time bounded at TELEMETRY_TIMEOUT_MS covers the WHOLE telemetry path
  // (/health probe + checkpoint POST). Previously the two had independent
  // timeouts that stacked to ~5s on unreachable endpoints — defeating the
  // "bounded at TELEMETRY_TIMEOUT_MS" invariant this function's docstring
  // and the surrounding sync-expectations assume. Matches the pattern
  // already shipped for python/go/java SDKs. See enterprise#1707.
  try {
    void (async () => {
      const deadline = Date.now() + TELEMETRY_TIMEOUT_MS;

      try {
        // Health probe gets up to HEALTH_BUDGET_CAP_MS of the remaining budget
        // so the POST always has room, even when /health hits a slow or
        // blackholed endpoint and consumes the full probe budget.
        const healthBudget = Math.min(HEALTH_BUDGET_CAP_MS, Math.max(0, deadline - Date.now()));
        if (options.endpoint && healthBudget > MIN_BUDGET_MS) {
          payload.platform_version = await detectPlatformVersion(options.endpoint, healthBudget);
        }
      } catch {
        // Silent — platform version remains null
      }

      if (options.debug) {
        console.log('[AxonFlow] Sending telemetry ping', JSON.stringify(payload, null, 2));
      }

      // POST uses all remaining budget, bounded at the shared deadline.
      const postBudget = Math.max(0, deadline - Date.now());
      if (postBudget < MIN_BUDGET_MS) {
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), postBudget);

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
 *
 * @param timeoutMs — derived from the shared telemetry deadline so the health
 * probe and the checkpoint POST don't stack into a larger combined budget.
 * See enterprise#1707.
 */
async function detectPlatformVersion(endpoint: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
