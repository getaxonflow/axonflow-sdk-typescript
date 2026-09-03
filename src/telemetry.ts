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
 * Bounds every value this SDK puts on the telemetry wire that it did not
 * author itself — every string promoted out of a `/health` response, and every
 * adapter name handed to `registerAdapter`.
 *
 * WHY A DROP AND NOT A TRUNCATION. The checkpoint refuses a request body over
 * 64 KiB. A single 70 KB value from a hostile or broken `/health` therefore
 * produces a ping that is rejected WHOLE — the version, the tier, the org id,
 * every dimension lost, not just the oversized one — and because the stamp is
 * only written on a 2xx, the SDK retries that same doomed request at every
 * gate run for as long as `/health` keeps answering that way. Dropping the
 * offending value alone keeps the ping under the limit and preserves every
 * other dimension.
 *
 * It is dropped rather than truncated because a truncated value is a value
 * nobody reported: 64 bytes of a 70 KB string is not a licence tier and not an
 * adapter name, and relaying it would put a fabricated observation on the
 * wire. Absent is the honest answer.
 *
 * BYTES, NOT CHARACTERS — and in JavaScript that has to be said out loud,
 * because `String.length` counts UTF-16 CODE UNITS. Every check against this
 * bound uses `Buffer.byteLength(s, 'utf8')`. The three disagree: '😀' is
 * length 2, one code point, and four bytes. The bound is bytes because the
 * thing being bounded — the serialized request body — is bytes.
 *
 * Same bound the receiver applies to these coarse enums (checkpoint-service
 * `MaxCoarseEnumValueBytes`), and ~3.5x the longest legitimate value.
 */
const MAX_RELAYED_VALUE_BYTES = 64;

/**
 * Bounds on the `features` array itself, mirroring the receiver's own
 * `MaxFeatures` / `MaxFeatureBytes`. Applying them client-side means an
 * over-long array is shaped HERE, where the SDK still knows what it dropped,
 * rather than silently at ingest.
 *
 * READ WHAT THESE TWO ACTUALLY REACH. The entry cap is live: register 33
 * adapters and the 33rd does not reach the wire. The byte cap is a BACKSTOP
 * that today's only producer cannot trigger — `registerAdapter` already
 * refuses a name over `MAX_RELAYED_VALUE_BYTES`, so the longest entry it can
 * emit is `'adapter:'.length + 64 === 72` bytes. It is tested directly on
 * `boundFeatures` rather than through the registry, because a test driven
 * through the registry could not express it.
 */
const MAX_FEATURES = 32;
const MAX_FEATURE_BYTES = 128;

/**
 * Marks a `features[]` entry as an adapter identifier. The vocabulary is
 * SERVER-DEFINED (checkpoint-service `FeatureAdapterPrefix`) and is not this
 * SDK's to extend.
 */
const FEATURE_ADAPTER_PREFIX = 'adapter:';

/**
 * Length of `value` in UTF-8 BYTES.
 *
 * Its own function so every bound in this module is measured the same way and
 * no call site can quietly fall back to `.length`, which counts UTF-16 code
 * units. `Buffer` is Node-only; the `TextEncoder` fallback keeps this correct
 * in a non-Node runtime rather than silently reverting to code units.
 */
function byteLength(value: string): number {
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(value, 'utf8');
  }
  return new TextEncoder().encode(value).length;
}

// ---------------------------------------------------------------------------
// The adapter registry — the ONLY producer of `features` entries.
// ---------------------------------------------------------------------------

/**
 * A Set, so a framework that registers on every wrapper construction — the
 * ordinary case for an adapter whose constructor runs per request — declares
 * itself once on the wire rather than N times.
 */
const adapterRegistry = new Set<string>();

/**
 * Declare that a framework adapter is driving this SDK, so the next telemetry
 * heartbeat carries `adapter:<name>` in its `features` array.
 *
 * A framework adapter (LangChain, LangGraph, LiteLLM, …) wrapping this SDK is
 * indistinguishable from bare SDK use on every other telemetry dimension —
 * same `sdk`, same `sdk_version`, same endpoint. This is the one call that
 * makes the difference visible, and it is adoption signal only.
 *
 * IT ADDS NO REQUEST. The name rides the `features` array of the heartbeat
 * that already fires; there is no second ping, no second endpoint and no new
 * configuration surface. Calling it does not itself send anything.
 *
 * CALL IT BEFORE CONSTRUCTING THE CLIENT for day-one attribution: the client
 * consults the heartbeat gate at construction, so a name registered afterwards
 * rides the NEXT heartbeat rather than the first.
 *
 * Idempotent. Repeat registrations of the same name collapse to one entry.
 *
 * THE NAME IS NOT VALIDATED AGAINST A LIST, DELIBERATELY. The canonical
 * vocabulary lives on the receiver (checkpoint-service
 * `NormalizeAdapterFeature`, which folds an unrecognised name into
 * `adapter:unknown` at READ time while keeping the raw name on the row). An
 * allowlist here would be a second vocabulary that drifts from the first: a
 * name this SDK build predates would be dropped at the client instead of
 * arriving and rendering as "someone is using an adapter we do not know
 * about" — precisely the signal the unknown bucket exists to preserve.
 *
 * So the only transformations are the two the receiver also applies before
 * matching: trim surrounding whitespace, and lowercase. What is refused is
 * refused for a reason that is not about vocabulary: a name empty after
 * trimming (there is nothing to declare, and `adapter:` alone is not an
 * identifier), and a name longer than `MAX_RELAYED_VALUE_BYTES` (dropped
 * WHOLE, never truncated). A non-string is refused the same way rather than
 * coerced — `String(undefined)` would put the literal text `undefined` on the
 * wire as an adapter name.
 *
 * Both refusals are silent: this is a telemetry declaration on a
 * fire-and-forget path, and throwing would invite a caller to fail their own
 * startup over an analytics detail.
 */
export function registerAdapter(name: string): void {
  if (typeof name !== 'string') return;
  const normalized = name.trim().toLowerCase();
  if (normalized === '' || byteLength(normalized) > MAX_RELAYED_VALUE_BYTES) return;
  adapterRegistry.add(normalized);
}

/**
 * Apply the receiver's array bounds: at most `MAX_FEATURES` entries, none over
 * `MAX_FEATURE_BYTES` bytes.
 *
 * An over-long entry is DROPPED rather than truncated, which is where this
 * deliberately differs from the receiver's own `BoundFeatures`. The receiver
 * truncates because it is defending storage against arbitrary clients and a
 * truncated entry harmlessly folds into its unknown bucket. Here the entry is
 * something this process declared about itself, and a truncated adapter name
 * is a name nothing is running.
 */
export function boundFeatures(features: string[]): string[] {
  const out: string[] = [];
  for (const feature of features) {
    if (byteLength(feature) > MAX_FEATURE_BYTES) continue;
    out.push(feature);
    if (out.length === MAX_FEATURES) break;
  }
  return out;
}

/**
 * Render the registry as the `features` array for one ping.
 *
 * Sorted so the wire is deterministic — two processes that registered the same
 * adapters in a different order produce the same array, which is what lets a
 * test assert on the whole field, and what makes "which 32 survive" a defined
 * answer rather than a Set-iteration accident.
 */
export function registeredFeatures(): string[] {
  const names = [...adapterRegistry].sort();
  return boundFeatures(names.map(name => FEATURE_ADAPTER_PREFIX + name));
}

/** Test-only: empty the registry and return what was there, so the caller can
 * restore it. The registry is module-global by design, so a test that
 * registers an adapter would otherwise leak it into every later test's ping. */
export function _resetAdapterRegistryForTest(): string[] {
  const previous = [...adapterRegistry];
  adapterRegistry.clear();
  return previous;
}

/** Test-only: restore a registry saved by `_resetAdapterRegistryForTest`. */
export function _restoreAdapterRegistryForTest(previous: string[]): void {
  adapterRegistry.clear();
  for (const name of previous) adapterRegistry.add(name);
}

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

/**
 * Is this a 3xx?
 *
 * Distinguished from an ordinary non-2xx so a REFUSED REDIRECT is observable.
 * It is the one failure on this path that would otherwise look like success.
 */
function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

/**
 * `redirect: 'manual'`, and the choice between the three modes was measured
 * rather than assumed.
 *
 * `fetch` FOLLOWS redirects by default, and on this path that is a live defect
 * in two different ways:
 *
 *   * on `/health`, every value promoted out of the response would describe the
 *     REDIRECT TARGET rather than the endpoint the caller configured — a
 *     captive portal, a misconfigured proxy or an http->https hop is enough to
 *     make the heartbeat report a platform the user never pointed at;
 *   * on the checkpoint POST it is worse: a redirected POST is re-issued as a
 *     BODYLESS GET, so a 302 yields a 200 for a request that carried NOTHING,
 *     the SDK reads that 200 as delivery, and the 7-day stamp advances on a
 *     ping that was never sent. The installation then goes silent for a week,
 *     and a 200 meaning "we delivered nothing" is indistinguishable from
 *     success at every layer above.
 *
 * Measured on Node 25: `redirect: 'follow'` turns a 302 into `status=200
 * ok=true`; `'manual'` yields `status=302 ok=false`; `'error'` throws a generic
 * `TypeError: fetch failed`. `'manual'` is used because it is the only one that
 * lets the refusal be REPORTED — `'error'` is indistinguishable from an
 * ordinary network failure, so a refused redirect would be silent.
 */
const NO_REDIRECTS = 'manual' as const;

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
  /**
   * Deployment-organization identifier (#2277). Two sources, precedence
   * order: the `ORG_ID` env var when set (the operator's explicit
   * configuration on self-hosted deployments, or the `cs_<uuid>` tenant
   * identifier on Community SaaS); otherwise the `"local-dev-org"`
   * sentinel. Always emitted. See
   * axonflow-landing/content/privacy.html for the customer-facing
   * commitment that covers this field.
   */
  org_id: string;
  /**
   * Licence tier the connected platform reported on its own `/health`
   * response — `"community"`, `"evaluation"`, `"Enterprise"`, the csaas
   * `"Plus"` alias for EnterprisePlus, or the transient `"starting"`.
   * Coarse adoption signal only: no licence key, no expiry, no seat count,
   * no customer name. Issue #3619.
   *
   * THREE SIMILARLY-NAMED CONCEPTS LIVE NEARBY. Do not merge them:
   *
   * 1. `deployment_mode` (this interface) — SDK-derived TOPOLOGY:
   *    `self_hosted | community_saas | unknown`, classified from the
   *    endpoint URL. Says WHERE the platform runs.
   * 2. The platform's own `DEPLOYMENT_MODE` env var — a server-side
   *    setting deciding which schema/tables the binary uses. Never read by
   *    this SDK and never sent on this field.
   * 3. `license_tier` (this field) — what the platform REPORTED about its
   *    own licensing, for adoption analytics.
   *
   * ITEM 3 IS NOT AN ENTITLEMENT FACT. This SDK relays whatever `/health`
   * returned, and the receiver cannot verify the relay: whoever operates
   * the endpoint the client was pointed at controls the value completely.
   * It must never gate entitlement, unlock a feature, or enter any
   * authorization or billing decision. See axonflow-enterprise#3619.
   *
   * A community-mode binary can run on any topology and vice versa, so
   * neither field is derivable from the other.
   *
   * Sent verbatim. Casing and alias folding is the receiver's job
   * (checkpoint-service `NormalizeLicenseTier`) and is deliberately NOT
   * duplicated here — a client that folded locally would silently mask a
   * tier this SDK build predates.
   *
   * ABSENT (property omitted) means NOT LEARNED — `/health` unreachable,
   * non-2xx, unparseable, or carrying no `tier` key. Absent must never
   * become a known value: emitting `"community"` for a platform we could
   * not reach would be a false claim about a customer's deployment. The
   * receiver preserves omission for legacy pings, so an omitted field
   * reads as "unknown", not as any particular tier.
   */
  license_tier?: string;
  /**
   * The BUILD the connected platform reported on its own `/health`:
   * `community` or `enterprise`. Relayed verbatim, and it rides the SAME
   * `/health` response the version and the tier already come from — no new
   * request. Issue axonflow-enterprise#3660.
   *
   * NOT an entitlement fact, on the same terms as `license_tier` above:
   * whoever operates the configured endpoint controls the value completely and
   * this SDK relays it unverified.
   *
   * NOT derivable from anything else here either — the Community-SaaS fleet
   * runs the ENTERPRISE build against the community-saas schema, so neither
   * `deployment_mode` nor `license_tier` implies it.
   *
   * ABSENT (property omitted) means NOT LEARNED.
   */
  edition?: string;
  /**
   * The connected platform's OWN deployment mode, as it reported it on
   * `/health` under the member name `deployment_mode`.
   *
   * READ THE FIELD NAMES CAREFULLY — THIS IS THE TRAP THIS CONTRACT IS MOST
   * LIKELY TO BE GOT WRONG ON. The `/health` member is called
   * `deployment_mode` because there the platform is describing ITSELF. On this
   * ping, `deployment_mode` already means something else entirely: the
   * TOPOLOGY bucket this SDK derives from the endpoint URL it was configured
   * with. They are different dimensions, and mapping `/health`'s member onto
   * the topology field would overwrite a value every existing dashboard reads.
   */
  platform_deployment_mode?: string;
}

/**
 * Sentinel emitted on the telemetry wire when `ORG_ID` is unset — the
 * default-config Community-mode developer case. See #2277.
 */
export const ORG_ID_LOCAL_DEV_SENTINEL = 'local-dev-org';

/**
 * Return the `org_id` value to emit on the next telemetry ping. Reads
 * `ORG_ID` from the environment (the operator's explicit configuration
 * for self-hosted deployments, or the `cs_<uuid>` tenant identifier on
 * Community SaaS) and falls back to `ORG_ID_LOCAL_DEV_SENTINEL` when
 * unset. Always returns a non-empty string. See #2277.
 */
export function telemetryOrgID(): string {
  const value = typeof process !== 'undefined' ? (process.env.ORG_ID ?? '') : '';
  return value === '' ? ORG_ID_LOCAL_DEV_SENTINEL : value;
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
 * Send a telemetry ping and return whether it landed.
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
/**
 * The single definition of "the platform told us this".
 *
 * A value counts as learned only when it is a NON-EMPTY string. Used by the
 * probe, which is where it is load-bearing: it decides what gets promoted out
 * of the `/health` body, and a mutant relaxing it is killed.
 *
 * `applyHealthProbe` also calls it, but there it is belt-and-braces that NO
 * test can pin: `applyHealthProbe` is module-private, its only two call sites
 * pass a probe built by `probePlatformHealth`, and that already maps `""` to
 * `null`. A mutant relaxing the check there survives by construction. It is
 * kept so the omit-vs-populate rule reads the same at both levels, not
 * because a test proves it — said plainly so a reader does not assume it is
 * covered. (Java differs: `buildPayload` there is genuinely package-visible,
 * so the equivalent check IS reachable and its mutant IS killed.)
 */
function isLearned(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Promote one `/health` member to a relayable value, or `null`.
 *
 * Learned only when the member is present, is a string, is non-empty, and is
 * within `MAX_RELAYED_VALUE_BYTES`. An absent key, a non-string value, an
 * explicit `''` and an over-long string are all NOT LEARNED — the field stays
 * `null` rather than becoming a value the platform did not report.
 *
 * A non-string is refused rather than coerced: `{"tier": 42}` becoming `"42"`
 * would land in the receiver's unknown bucket as though the platform had
 * reported a tier.
 */
function learned(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (!isLearned(value)) return null;
  if (byteLength(value) > MAX_RELAYED_VALUE_BYTES) {
    // The VALUE is deliberately not logged: it is remote-controlled text, and
    // the diagnostic exists to say which field was dropped and why.
    if (typeof console !== 'undefined') {
      console.debug(
        `[AxonFlow] Telemetry: /health field '${key}' exceeded ${MAX_RELAYED_VALUE_BYTES} ` +
          `bytes (${byteLength(value)} bytes); omitted`
      );
    }
    return null;
  }
  return value;
}

/**
 * Apply a health-probe result onto a telemetry payload.
 *
 * This module has TWO ping paths (`sendTelemetryPingNow` and
 * `sendTelemetryPing`) that build the same payload independently. Both call
 * THIS function so the omit-vs-populate rule cannot drift between them —
 * patching one copy of a duplicated decision is how the two paths come to
 * disagree.
 *
 * `platform_version` is an explicit `null` when unlearned (its long-standing
 * wire shape); `license_tier` is OMITTED entirely, never set to `""` and
 * never defaulted to a guessed tier.
 */
function applyHealthProbe(payload: TelemetryPayload, probe: PlatformHealthProbe): void {
  payload.platform_version = probe.platformVersion;
  // Both ping paths build `payload` fresh per call, so there is never a stale
  // value to remove — assign only when learned. Assigning `undefined` would
  // still create the property, and `JSON.stringify` drops it, but "the key is
  // absent" is the contract and it should be structural rather than incidental.
  if (isLearned(probe.licenseTier)) {
    payload.license_tier = probe.licenseTier;
  }
  if (isLearned(probe.edition)) {
    payload.edition = probe.edition;
  }
  if (isLearned(probe.platformDeploymentMode)) {
    payload.platform_deployment_mode = probe.platformDeploymentMode;
  }
}

/**
 * Build the base telemetry payload.
 *
 * ONE builder for BOTH ping paths. This module has two — `sendTelemetryPingNow`
 * and the `sendTelemetryPing` compat shim — and they previously built the same
 * object literal independently. `applyHealthProbe` already exists for exactly
 * this reason: patching one copy of a duplicated decision is how the two paths
 * come to disagree. Adding `features` to one literal and not the other would
 * have been that bug, so the literal itself is now shared.
 */
function buildBasePayload(options: { mode: string; endpoint: string }): TelemetryPayload {
  return {
    telemetry_type: 'sdk',
    sdk: 'typescript',
    sdk_version: VERSION,
    platform_version: null,
    os: typeof process !== 'undefined' ? process.platform : 'unknown',
    arch: typeof process !== 'undefined' ? process.arch : 'unknown',
    runtime_version: typeof process !== 'undefined' ? process.version.replace(/^v/, '') : 'unknown',
    deployment_mode: classifyDeploymentMode(options.endpoint),
    endpoint_type: classifyEndpoint(options.endpoint),
    // The adapter registry is the ONLY producer of this array. Read here rather
    // than snapshotted at module load so an adapter that registers after the
    // first client is built still reaches the next heartbeat.
    features: registeredFeatures(),
    instance_id: generateInstanceId(),
    org_id: telemetryOrgID(),
    ...(options.mode === 'sandbox' ? { stream: 'sandbox' } : {}),
  };
}

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
  const payload: TelemetryPayload = buildBasePayload(options);

  try {
    const deadline = Date.now() + TELEMETRY_TIMEOUT_MS;

    try {
      const healthBudget = Math.min(HEALTH_BUDGET_CAP_MS, Math.max(0, deadline - Date.now()));
      if (options.endpoint && healthBudget > MIN_BUDGET_MS) {
        applyHealthProbe(payload, await probePlatformHealth(options.endpoint, healthBudget));
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
        redirect: NO_REDIRECTS,
      });
      if (isRedirect(response.status) && typeof console !== 'undefined') {
        console.debug(
          `[AxonFlow] Telemetry: checkpoint answered ${response.status} (a redirect); ` +
            'refused, ping NOT delivered and the stamp will not advance'
        );
      }
      // `response.ok` is already false for a 3xx under redirect: 'manual', so
      // the stamp cannot advance. The branch above exists to make the refusal
      // visible, not to change the outcome.
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/**
 * Send a telemetry ping on client initialization (compat shim).
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
      '[AxonFlow] Telemetry enabled. Opt out: AXONFLOW_TELEMETRY=off | https://docs.getaxonflow.com/docs/telemetry'
    );
  }

  const checkpointUrl = resolveCheckpointUrl();

  // Stream classifier: sandbox-mode clients self-tag so analytics can
  // distinguish dev/test pings from production. Production-mode clients
  // omit the field entirely and the server defaults to "heartbeat".
  // v1 telemetry-schema (axonflow-enterprise#2008): deployment_mode classified
  // from endpoint host (prior config.Mode-based dimension removed; now
  // reflects topology only).
  const payload: TelemetryPayload = buildBasePayload(options);

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
          applyHealthProbe(payload, await probePlatformHealth(options.endpoint, healthBudget));
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
          redirect: NO_REDIRECTS,
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
 * What a single `/health` fetch established. Each field is INDEPENDENT: a
 * response carrying one but not the other yields a partially-populated
 * result rather than discarding both. `null` means "not learned" — it never
 * degrades to a default (see `TelemetryPayload.license_tier`).
 */
export interface PlatformHealthProbe {
  platformVersion: string | null;
  licenseTier: string | null;
  /** `/health` → `edition`. */
  edition: string | null;
  /** `/health` → `deployment_mode`, relayed as `platform_deployment_mode`. */
  platformDeploymentMode: string | null;
}

/**
 * Probe the agent's `/health` endpoint ONCE and extract every telemetry
 * dimension it carries. Returns both fields null on any failure —
 * unreachable endpoint, non-2xx, unparseable body, or a body that stalls
 * past the supplied budget — so
 * telemetry degrades to omitting the fields and never fails the ping or
 * surfaces an error to the caller.
 *
 * This is the SDK's only `/health` fetch on the telemetry path; the licence
 * tier rides along on the response already being fetched for the version.
 * Adding a second request here would double the telemetry path's blocking
 * budget and its failure surface — do not.
 *
 * @param timeoutMs — derived from the shared telemetry deadline so the health
 * probe and the checkpoint POST don't stack into a larger combined budget.
 * See enterprise#1707.
 */
export async function probePlatformHealth(
  endpoint: string,
  timeoutMs: number
): Promise<PlatformHealthProbe> {
  const empty: PlatformHealthProbe = {
    platformVersion: null,
    licenseTier: null,
    edition: null,
    platformDeploymentMode: null,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Belt to the `finally`'s braces. If this timer were ever left pending it
  // would hold the Node event loop open for its full duration after an
  // otherwise-finished ping — the "telemetry delays process exit" symptom in
  // a CLI or Lambda. unref() means a pending timer can never be the reason
  // the process stays alive. Node-only API, hence the optional call.
  (timeoutId as unknown as { unref?: () => void }).unref?.();

  // The timer is cleared in `finally`, NOT as soon as fetch() resolves.
  // fetch() resolves on HEADERS, so clearing it there disarmed the only
  // bound on `resp.json()` and left the AbortController unable to fire
  // again: a platform that answered 200 + headers and then stalled
  // mid-body blocked this call FOREVER, measured at 4s+ against a 400ms
  // budget. That defeats the shared-deadline contract (enterprise#1707)
  // and can hang a caller awaiting `client.heartbeatReady`.
  try {
    const resp = await fetch(`${endpoint}/health`, {
      method: 'GET',
      signal: controller.signal,
      redirect: NO_REDIRECTS,
    });

    if (!resp.ok) {
      if (isRedirect(resp.status) && typeof console !== 'undefined') {
        // Named separately from an ordinary non-2xx so a refused redirect is
        // OBSERVABLE rather than silent. The Location value is deliberately
        // NOT logged: it is remote-controlled text.
        console.debug(
          `[AxonFlow] Telemetry: /health answered ${resp.status} (a redirect); refused, ` +
            'relayed fields omitted'
        );
      }
      return empty;
    }

    // Still covered by the abort signal above — an abort here rejects, and
    // the catch below turns it into the ordinary not-learned result.
    const body: unknown = await resp.json();
    if (typeof body !== 'object' || body === null) return empty;
    const record = body as Record<string, unknown>;

    // Each field is promoted independently and only when it is a non-empty
    // string. A TypeScript interface is erased at runtime, so the shape of a
    // parsed body is a claim, not a check — these guards are the check. An
    // absent key, a non-string value and an explicit "" are all "not learned",
    // leaving null rather than putting a meaningless value on the wire.
    // Each member is promoted through ONE helper. Four copies of the same two
    // conditions is the shape that gets found in production by the field the
    // bound was not applied to.
    return {
      platformVersion: learned(record, 'version'),
      // Verbatim, including the transient "starting" the agent returns
      // before its licence is validated. "starting" is a real signal the
      // receiver buckets deliberately, not an error to filter client-side.
      licenseTier: learned(record, 'tier'),
      edition: learned(record, 'edition'),
      // NOTE THE NAME CHANGE, AND THAT IT IS DELIBERATE. The /health member is
      // `deployment_mode` (the platform describing itself); the wire field is
      // `platform_deployment_mode`. This SDK's OWN `deployment_mode` is a
      // different dimension and promoting /health's member into it would
      // overwrite a value every existing dashboard reads.
      platformDeploymentMode: learned(record, 'deployment_mode'),
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(timeoutId);
  }
}
