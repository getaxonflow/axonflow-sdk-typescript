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
 * - all other modes (including auto-detected sandbox): ON
 *
 * The explicit `telemetryEnabled` config field overrides the default when defined.
 */
function shouldSendTelemetry(
  explicitMode: string | undefined,
  telemetryEnabled?: boolean,
): boolean {
  // Explicit config override takes priority
  if (telemetryEnabled !== undefined) {
    return telemetryEnabled;
  }

  // Default: ON everywhere except explicitly-set sandbox mode.
  // When mode is undefined (auto-detected), telemetry stays ON.
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
  features: string[];
  instance_id: string;
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
    console.log(
      '[AxonFlow] Anonymous telemetry enabled. Opt out: AXONFLOW_TELEMETRY=off | https://docs.getaxonflow.com/telemetry'
    );
  }

  const checkpointUrl = resolveCheckpointUrl();

  const payload: TelemetryPayload = {
    sdk: 'typescript',
    sdk_version: VERSION,
    platform_version: null,
    os: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
    runtime_version: typeof process !== 'undefined' ? process.version : 'unknown',
    deployment_mode: options.mode,
    features: [],
    instance_id: generateInstanceId(),
  };

  if (options.debug) {
    console.log('[AxonFlow] Sending telemetry ping', JSON.stringify(payload, null, 2));
  }

  // Fire-and-forget with AbortController timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);

    void fetch(checkpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(() => {
        clearTimeout(timeoutId);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        // Silent failure — telemetry should never affect SDK behavior
      });
  } catch {
    // Silent failure — fetch may be unavailable in some environments
  }
}
