/**
 * Tests for the 7-day delivered-heartbeat gate.
 *
 * The matrix mirrors the cross-SDK reference (see Go SDK heartbeat_test.go):
 *
 *   1. cold start, no stamp           → 1 ping fires, stamp written
 *   2. fresh stamp (1d old)           → 0 pings
 *   3. stale stamp (8d old)           → 1 ping, stamp updated
 *   4. 5 calls within 1h cache        → exactly 1 ping
 *   5. cache expired + stale stamp    → 2nd ping fires
 *   6. AXONFLOW_TELEMETRY=off mid-run → 0 pings, stamp unchanged
 *   7. 100 concurrent callers         → exactly 1 ping (stampede coalesced)
 *   8. no cache dir (stamp_path=null) → 1 ping per "process", no crash
 *   9. ping returns false             → stamp NOT written; retry on success works
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HeartbeatState,
  getHeartbeatStateForTest,
  maybeSendHeartbeat,
  replaceHeartbeatStateForTest,
  restoreHeartbeatStateForTest,
} from '../src/heartbeat';

let tempStampPath: string;
let originalState: HeartbeatState;

beforeEach(() => {
  // Each test gets an isolated temp stamp file location.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axonflow-hb-'));
  tempStampPath = path.join(dir, 'stamp');
  originalState = replaceHeartbeatStateForTest(tempStampPath);
  delete process.env.AXONFLOW_TELEMETRY;
});

afterEach(() => {
  // Restore the original state captured in beforeEach so we don't leak
  // test state into other test files.
  restoreHeartbeatStateForTest(originalState);
});

// Helper to wait for the in-flight Promise to resolve so the test can
// inspect post-state (mock counts, stamp file presence) deterministically.
async function flushHeartbeat(): Promise<void> {
  const state = getHeartbeatStateForTest();
  if (state.inFlight) {
    await state.inFlight;
  }
}

// --- 9-case matrix -------------------------------------------------------

test('Case 1: cold start, no stamp → 1 ping, stamp written', async () => {
  const ping = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(tempStampPath)).toBe(true);
});

test('Case 2: fresh stamp (1d old) → 0 pings', async () => {
  fs.mkdirSync(path.dirname(tempStampPath), { recursive: true });
  fs.writeFileSync(tempStampPath, 'last_sent=test\n');
  const oneDayAgoSec = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(tempStampPath, oneDayAgoSec, oneDayAgoSec);

  const ping = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(0);
});

test('Case 3: stale stamp (8d old) → 1 ping, stamp updated', async () => {
  fs.mkdirSync(path.dirname(tempStampPath), { recursive: true });
  fs.writeFileSync(tempStampPath, 'last_sent=test\n');
  const eightDaysAgoSec = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(tempStampPath, eightDaysAgoSec, eightDaysAgoSec);

  const ping = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);

  const newMtimeMs = fs.statSync(tempStampPath).mtimeMs;
  expect(Date.now() - newMtimeMs).toBeLessThan(5000);
});

test('Case 4: 5 calls within 1h cache → exactly 1 ping', async () => {
  const ping = jest.fn().mockResolvedValue(true);
  for (let i = 0; i < 5; i++) {
    await maybeSendHeartbeat(true, ping);
  }
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);
});

test('Case 5: cache expired + stale stamp → 2nd ping fires', async () => {
  const ping = jest.fn().mockResolvedValue(true);

  // First call: fires, stamp written.
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);

  // Backdate the in-memory cache (2h ago), the in-memory DELIVERY record
  // (8d ago) AND the stamp file (8d ago).
  //
  // `lastDeliveredMs` joined this list with the in-memory 7-day cadence
  // (axonflow-enterprise#3682). It is not an extra knob for the test's
  // convenience: "eight days have passed" is a statement about all three
  // records, and a fixture that moved only two of them was modelling a state
  // the process cannot actually be in.
  const state = getHeartbeatStateForTest();
  state.lastCheckedMs = Date.now() - 2 * 60 * 60 * 1000;
  state.lastDeliveredMs = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const eightDaysAgoSec = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(tempStampPath, eightDaysAgoSec, eightDaysAgoSec);

  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(2);
});

test('Case 6: AXONFLOW_TELEMETRY=off mid-run → 0 pings, stamp unchanged', async () => {
  const ping = jest.fn().mockResolvedValue(true);

  // First call: fires.
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);

  // Toggle opt-out, force gates open. Snapshot mtime AFTER manipulation.
  process.env.AXONFLOW_TELEMETRY = 'off';
  const state = getHeartbeatStateForTest();
  state.lastCheckedMs = Date.now() - 2 * 60 * 60 * 1000;
  const eightDaysAgoSec = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(tempStampPath, eightDaysAgoSec, eightDaysAgoSec);
  const mtimeBefore = fs.statSync(tempStampPath).mtimeMs;

  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();

  expect(ping).toHaveBeenCalledTimes(1); // still 1
  const mtimeAfter = fs.statSync(tempStampPath).mtimeMs;
  expect(mtimeAfter).toBe(mtimeBefore);
});

test('Case 7: 100 concurrent callers → exactly 1 ping', async () => {
  const ping = jest.fn().mockImplementation(async () => {
    // Slight delay to encourage stampede behavior.
    await new Promise(r => setTimeout(r, 10));
    return true;
  });

  const calls = Array.from({ length: 100 }, () => maybeSendHeartbeat(true, ping));
  await Promise.all(calls);
  await flushHeartbeat();

  expect(ping).toHaveBeenCalledTimes(1);
});

test('Case 8: no cache dir (stampPath=null) → ping ONCE, then bounded in memory', async () => {
  // Replace state with stampPath=null to simulate Lambda / restricted env.
  replaceHeartbeatStateForTest(null);
  const ping = jest.fn().mockResolvedValue(true);

  // First call fires.
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);

  // 1h cache holds within the same "process" even without a stamp file.
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);

  // ASSERTION INVERTED IN #3682, AND THE OLD ONE WAS THE DEFECT.
  //
  // This block used to backdate the cache and assert a SECOND ping "because no
  // stamp gate exists". That is precisely the bug: in a runtime with no usable
  // cache dir — distroless and scratch containers, Lambda custom runtimes, a
  // read-only root filesystem — the stamp can never be written, so nothing
  // bounded the cadence and a SUCCESSFUL ping recurred every hour, forever. 168
  // pings a week against a contract that discloses one, in exactly the
  // environments least able to notice, and the failure backoff cannot help
  // because these deliveries succeed.
  //
  // The in-memory `lastDeliveredMs` record is the bound. An hour after a
  // delivery the gate must now REFUSE.
  const state = getHeartbeatStateForTest();
  state.lastCheckedMs = Date.now() - 2 * 60 * 60 * 1000;
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(1);

  // And the other direction, so the bound cannot pass as a permanent mute:
  // past the 7-day interval it must fire again.
  state.lastCheckedMs = Date.now() - 2 * 60 * 60 * 1000;
  state.lastDeliveredMs = Date.now() - 8 * 24 * 60 * 60 * 1000;
  await maybeSendHeartbeat(true, ping);
  await flushHeartbeat();
  expect(ping).toHaveBeenCalledTimes(2);
});

test('Case 9: ping returns false → stamp NOT written; retry on success works', async () => {
  const failingPing = jest.fn().mockResolvedValue(false);
  await maybeSendHeartbeat(true, failingPing);
  await flushHeartbeat();
  expect(failingPing).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(tempStampPath)).toBe(false);

  // Backdate cache, swap to success.
  const state = getHeartbeatStateForTest();
  state.lastCheckedMs = Date.now() - 2 * 60 * 60 * 1000;

  const successPing = jest.fn().mockResolvedValue(true);
  await maybeSendHeartbeat(true, successPing);
  await flushHeartbeat();
  expect(successPing).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(tempStampPath)).toBe(true);
});
