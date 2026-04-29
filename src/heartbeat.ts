/**
 * 7-day delivered-heartbeat gate for AxonFlow TypeScript SDK telemetry.
 *
 * Implements the cross-SDK contract:
 *
 *   AxonFlow emits at most one anonymous heartbeat per environment every
 *   7 days during SDK activity.
 *
 * The gate is consulted at client construction and at every public HTTP
 * request site (via `_preRequestHook`). Each gate run:
 *
 *  1. Re-evaluates `AXONFLOW_TELEMETRY=off` cheaply (lock-free) so a
 *     mid-process opt-out toggle takes effect immediately.
 *  2. Checks an in-memory 1-hour cache to bound stat() syscall frequency
 *     on hot request paths.
 *  3. Reads the stamp file mtime as the source of truth for last
 *     successful delivery across process restarts.
 *  4. Sends the ping and writes the stamp ONLY on success — stamp-on-
 *     DELIVERY semantics. Failed POSTs leave the stamp unchanged so the
 *     next call after the 1-hour cache expires retries.
 *  5. Coalesces concurrent callers via an in-flight Promise so a stampede
 *     across the boundary fires exactly one POST.
 *
 * Cross-platform stamp file location (no external deps):
 *
 *   macOS:   ~/Library/Caches/axonflow/typescript-telemetry-last-sent
 *   Linux:   $XDG_CACHE_HOME/axonflow/...  or  ~/.cache/axonflow/...
 *   Windows: %LOCALAPPDATA%/axonflow/...
 *
 * If the cache dir cannot be resolved (e.g. AWS Lambda where HOME is
 * unset and LOCALAPPDATA is absent), the stamp path is null and the SDK
 * falls back to "one ping per process" — same as today's pre-heartbeat
 * behavior. No regression for that runtime.
 */

import { promises as fsPromises, statSync } from 'fs';
import * as path from 'path';

/** 7 days in milliseconds. */
export const HEARTBEAT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** 1 hour in milliseconds — bounds how often we stat() the stamp file. */
export const HEARTBEAT_GUARD_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Resolve the OS-native stamp file path, or `null` if no user cache
 * directory is available (Lambda etc.). Hand-rolled rather than via the
 * `env-paths` package to keep the SDK dependency-free.
 */
export function resolveStampPath(): string | null {
  const platform = process.platform;
  if (platform === 'darwin') {
    const home = process.env.HOME;
    if (!home) return null;
    return path.join(home, 'Library', 'Caches', 'axonflow', 'typescript-telemetry-last-sent');
  }
  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (!local) return null;
    return path.join(local, 'axonflow', 'typescript-telemetry-last-sent');
  }
  // Linux / *BSD / others — XDG.
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) {
    return path.join(xdg, 'axonflow', 'typescript-telemetry-last-sent');
  }
  const home = process.env.HOME;
  if (!home) return null;
  return path.join(home, '.cache', 'axonflow', 'typescript-telemetry-last-sent');
}

/** Sentinel: pass to HeartbeatState to opt into the auto-resolved default. */
export const USE_DEFAULT_CACHE_DIR = Symbol('axonflow.heartbeat.useDefaultCacheDir');

/**
 * Mutable state for the delivered-heartbeat gate.
 *
 * Shared as a module-level singleton across all clients in the process so
 * multiple AxonFlow instances coalesce onto a single ping. Single-threaded
 * Node.js runtime means no mutex is needed; an in-flight Promise is enough
 * to coalesce concurrent callers.
 *
 * `stampPath` semantics:
 *  - string  — use this exact location (typically used in tests).
 *  - null    — no persistence at all (Lambda / restricted env path).
 *  - default — auto-resolve via resolveStampPath().
 */
export class HeartbeatState {
  public lastCheckedMs: number | null = null;
  public inFlight: Promise<void> | null = null;
  public readonly stampPath: string | null;

  constructor(stampPath: string | null | typeof USE_DEFAULT_CACHE_DIR = USE_DEFAULT_CACHE_DIR) {
    this.stampPath = stampPath === USE_DEFAULT_CACHE_DIR ? resolveStampPath() : stampPath;
  }

  /**
   * Returns the stamp file's mtime as wall-clock ms-since-epoch, or null
   * if absent / unreadable / no path. Tolerant of every failure mode — a
   * corrupted or missing stamp is treated as "never sent" so we re-attempt.
   */
  readStampMtimeMs(): number | null {
    if (!this.stampPath) return null;
    try {
      return statSync(this.stampPath).mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Atomically write a fresh timestamp to the stamp file via tmp+rename so
   * concurrent writers never observe torn state. Contents are advisory —
   * the SDK uses mtime as the source of truth, never the contents.
   * Errors are silently ignored — a failed write means the next process
   * retries on schedule.
   */
  async writeStampAtomic(): Promise<void> {
    if (!this.stampPath) return;
    const dir = path.dirname(this.stampPath);
    try {
      await fsPromises.mkdir(dir, { recursive: true });
    } catch {
      return;
    }
    const tmpName = path.join(dir, `telemetry-last-sent-${process.pid}-${Date.now()}.tmp`);
    try {
      await fsPromises.writeFile(tmpName, `last_sent=${new Date().toISOString()}\n`, { flag: 'w' });
      await fsPromises.rename(tmpName, this.stampPath);
    } catch {
      // tmp+rename failure is non-fatal; clean up the orphaned tmp file
      // if it was created.
      try {
        await fsPromises.unlink(tmpName);
      } catch {
        /* nothing to clean up */
      }
    }
  }
}

// Module-level singleton. Tests that need isolation override via
// `replaceHeartbeatStateForTest` and restore the previous state.
let _state: HeartbeatState = new HeartbeatState();

export function getHeartbeatStateForTest(): HeartbeatState {
  return _state;
}

export function replaceHeartbeatStateForTest(
  stampPath: string | null | typeof USE_DEFAULT_CACHE_DIR
): HeartbeatState {
  const previous = _state;
  _state = new HeartbeatState(stampPath);
  return previous;
}

/**
 * Test helper: restore a previously-saved singleton.
 *
 * Pair with `replaceHeartbeatStateForTest`:
 *
 *   const previous = replaceHeartbeatStateForTest(tempStamp);
 *   try { ... } finally { restoreHeartbeatStateForTest(previous); }
 */
export function restoreHeartbeatStateForTest(state: HeartbeatState): void {
  _state = state;
}

/**
 * Returns the in-flight heartbeat Promise, or `null` if no ping is in
 * progress. Use this from short-lived processes (CLI scripts, Lambda
 * boot) to await delivery before exit:
 *
 *   const client = new AxonFlow(config);
 *   // ... do work ...
 *   await flushHeartbeat();  // ensures the boot ping landed
 *
 * Long-running services don't need to call this — the Node event loop
 * keeps the process alive while the Promise is pending.
 */
export function flushHeartbeat(): Promise<void> | null {
  return _state.inFlight;
}

/**
 * Cheap opt-out check, re-evaluated on every gate run so a mid-process
 * `process.env.AXONFLOW_TELEMETRY = 'off'` toggle takes effect immediately
 * without restart.
 */
function isOptedOut(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return process.env.AXONFLOW_TELEMETRY?.trim().toLowerCase() === 'off';
}

/**
 * Central gate for telemetry pings. Called from the AxonFlow constructor
 * and from `_preRequestHook` on every public HTTP entry point.
 *
 * The `pingFn` callback returns a Promise<boolean> indicating delivery
 * success. The stamp is written ONLY when this resolves to true,
 * implementing the "stamp-on-delivery" contract.
 *
 * Never throws — heartbeat failures must not surface to the caller.
 */
export async function maybeSendHeartbeat(
  isTelemetryEnabled: boolean,
  pingFn: () => Promise<boolean>
): Promise<void> {
  // 1. Cheap opt-out check (lock-free, re-evaluated every call).
  if (isOptedOut()) return;
  if (!isTelemetryEnabled) return;

  const h = _state;

  // 2. In-flight Promise gate — coalesces concurrent callers in the
  //    single-threaded JS runtime. Awaiting it does not delay the caller
  //    because we don't await the returned Promise from public hot paths.
  if (h.inFlight) return;

  const nowMs = Date.now();

  // 3. In-memory 1-hour cache.
  if (h.lastCheckedMs !== null && nowMs - h.lastCheckedMs < HEARTBEAT_GUARD_INTERVAL_MS) {
    return;
  }
  h.lastCheckedMs = nowMs;

  // 4. Stamp file mtime gate.
  const mtimeMs = h.readStampMtimeMs();
  if (mtimeMs !== null && nowMs - mtimeMs < HEARTBEAT_INTERVAL_MS) {
    return;
  }

  // 5. Send + stamp-on-success. Stored as Promise on `inFlight` so any
  //    concurrent callers can fast-path out via the check above.
  h.inFlight = (async () => {
    try {
      const ok = await pingFn();
      if (ok) {
        await h.writeStampAtomic();
      }
    } catch {
      // pingFn must never throw in practice, but defend anyway.
    } finally {
      h.inFlight = null;
    }
  })();
}
