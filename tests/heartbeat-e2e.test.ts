/**
 * End-to-end test for the 7-day delivered-heartbeat contract.
 *
 * Walks through the four-run cycle:
 *
 *   Run 1: cold start (no stamp)              → 1 ping;  stamp present
 *   Run 2: warm start (fresh stamp)           → 0 pings; stamp unchanged
 *   Run 3: backdate stamp 8d (fs.utimes)      → 1 ping;  stamp re-touched
 *   Run 4: stale stamp + ping returns false   → 0 successful pings;
 *                                                stamp NOT advanced;
 *                                                retry on success lands cleanly
 *
 * Validates stamp-on-DELIVERY semantics and cross-run behavior (the stamp
 * file is the source of truth across "process restarts" simulated by
 * fresh HeartbeatState construction with the same stamp path).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HeartbeatState,
  USE_DEFAULT_CACHE_DIR,
  maybeSendHeartbeat,
  replaceHeartbeatStateForTest,
} from '../src/heartbeat';

let stampPath: string;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axonflow-hb-e2e-'));
  stampPath = path.join(dir, 'stamp');
  delete process.env.AXONFLOW_TELEMETRY;
});

afterEach(() => {
  replaceHeartbeatStateForTest(USE_DEFAULT_CACHE_DIR);
});

function swapState(): HeartbeatState {
  return replaceHeartbeatStateForTest(stampPath) && new HeartbeatState(stampPath);
}

async function flush(): Promise<void> {
  // Wait until the in-flight Promise (if any) resolves on the current
  // singleton state.
  // The replaceHeartbeatStateForTest helper installs a fresh state, so we
  // re-read it after each swap.
  const state = (await import('../src/heartbeat')).getHeartbeatStateForTest();
  if (state.inFlight) {
    await state.inFlight;
  }
}

test('four-run cycle: cold → warm → stale → stale+failure → retry', async () => {
  // --- Run 1: cold start, no stamp -------------------------------------------
  swapState();
  const ping1 = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, ping1);
  await flush();
  expect(ping1).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(stampPath)).toBe(true);

  // --- Run 2: simulate fresh process — fresh state, same stamp file ----------
  swapState();
  const ping2 = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, ping2);
  await flush();
  expect(ping2).toHaveBeenCalledTimes(0);

  // --- Run 3: backdate stamp 8d ----------------------------------------------
  const eightDaysAgoSec = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(stampPath, eightDaysAgoSec, eightDaysAgoSec);

  swapState();
  const ping3 = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, ping3);
  await flush();
  expect(ping3).toHaveBeenCalledTimes(1);
  expect(Date.now() - fs.statSync(stampPath).mtimeMs).toBeLessThan(5000);

  // --- Run 4a: backdate again, ping returns failure --------------------------
  fs.utimesSync(stampPath, eightDaysAgoSec, eightDaysAgoSec);
  const mtimeBeforeFail = fs.statSync(stampPath).mtimeMs;

  swapState();
  const failingPing = jest.fn().mockResolvedValue(false);
  await maybeSendHeartbeat(true, failingPing);
  await flush();
  expect(failingPing).toHaveBeenCalledTimes(1);
  const mtimeAfterFail = fs.statSync(stampPath).mtimeMs;
  expect(mtimeAfterFail).toBe(mtimeBeforeFail); // stamp NOT advanced

  // --- Run 4b: retry against a successful mock -------------------------------
  swapState();
  const retryPing = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, retryPing);
  await flush();
  expect(retryPing).toHaveBeenCalledTimes(1);
  expect(Date.now() - fs.statSync(stampPath).mtimeMs).toBeLessThan(5000);
});
