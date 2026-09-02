// Real-wire proof of the read-path per-user identity (platform #2922) through
// the TypeScript SDK's own runtime, against a LIVE enterprise stack.
//
// Driven by test.sh, which links the LOCAL build (the npm registry is blocked).
//
// What this asserts, and why each assertion cannot pass vacuously:
//
//   1. WRITE       three decisions through the SDK's own `decide`, as dev-a.
//   2. LIST        as dev-a: the page must contain AT LEAST the three ids this
//                  run wrote, each checked BY ID. Then DEV-B writes one and
//                  dev-a's page must NOT grow — which is what separates
//                  own-rows from a broken narrowing that returns the tenant.
//   3. EXPLAIN     as dev-a: must carry the id asked for AND the context value
//                  THIS RUN chose, so a populated-looking stub cannot satisfy it.
//   4. NO IDENTITY the same list, unscoped: must be REFUSED as a typed
//                  ReadScopeError with identityMissing, not answered [].
//   5. OTHER USER  explain dev-a's decision as dev-b: must be refused, and must
//                  NOT report a missing identity — dev-b presented one.
//   6. MALFORMED / EXPIRED / WRONG-ORG: each must fail CLOSED (401), never
//                  degrade to the tenant credential's visibility.
//   7. TENANT-WIDE as admin: must see dev-a's decision, which is what makes
//                  step 5 falsifiable — a read broken for everyone also
//                  "refuses dev-b".
//   8. AS_USER     a derived client must be scoped to the identity it was
//                  derived FOR, on a method that takes no per-call option.
//   9. NO LEAK     the token must appear in NO captured log line and in NO
//                  request reaching the telemetry collector this driver hosts.
//                  A positive control asserts SDK output IS present first.
//  10. OBSERVABLE  the platform must leave a record of the unscoped read.
//
// Identities are minted at @example.com, never @axonflow.local: the platform
// reserves that whole domain (and @axonflow.internal) for SHARED, non-personal
// identities and censuses them to nothing before scoping, so a perfectly valid
// developer token minted there reads ZERO rows and reports scope `none` —
// identical to presenting no token at all. generate-jwt.sh's own default
// (demo-user@axonflow.local) lands in the reserved domain.

import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';

import { AuthenticationError, AxonFlow, ReadScopeError } from '@axonflow/sdk';
import { existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Mirrors src/heartbeat.ts resolveStampPath, which the package does not export
 * (`exports` exposes only "."). Duplicated rather than reached into, because a
 * driver that imports a package's internal file path is broken by any layout
 * change; if this ever drifts, step 9's collector goes empty and the step FAILS
 * loudly rather than passing on an unasserted absence.
 */
function stampPath() {
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Caches', 'axonflow', 'typescript-telemetry-last-sent');
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    return local ? path.join(local, 'axonflow', 'typescript-telemetry-last-sent') : null;
  }
  const xdg = process.env.XDG_CACHE_HOME;
  return xdg
    ? path.join(xdg, 'axonflow', 'typescript-telemetry-last-sent')
    : path.join(homedir(), '.cache', 'axonflow', 'typescript-telemetry-last-sent');
}

const AGENT_URL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const CLIENT_ID = process.env.AXONFLOW_CLIENT_ID;
const SECRET = process.env.AXONFLOW_CLIENT_SECRET;
const JWT_SECRET = process.env.AXONFLOW_JWT_SECRET;
const ORCH = process.env.AXONFLOW_ORCH_CONTAINER || 'axonflow-orchestrator';
const RUN_TAG = process.env.RUN_TAG || `s3-ts-${Date.now()}`;
const WROTE = 3;

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

// ---- capture every line the SDK logs, for step 9 -------------------------
const logged = [];
for (const stream of ['log', 'error', 'warn', 'debug', 'info']) {
  const original = console[stream].bind(console);
  console[stream] = (...args) => {
    logged.push(args.map(String).join(' '));
    original(...args);
  };
}

// ---- a real listener standing in for the telemetry checkpoint ------------
// allow-mocks-here: not a stand-in for the system under test. It is the far end
// of a request the SDK sends on its own initiative to a THIRD PARTY, and the
// assertion is about what actually arrives there — unobservable without owning
// that end.
const collected = [];
const collector = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    collected.push(JSON.stringify(req.headers) + body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
  });
});
await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
process.env.AXONFLOW_CHECKPOINT_URL = `http://127.0.0.1:${collector.address().port}/telemetry`;
process.env.AXONFLOW_TELEMETRY = 'on';

// The 7-day stamp is PARKED for this run, then restored — not deleted. It lives
// in the developer's real cache dir, and deleting it would make their next
// unrelated SDK run fire a genuine ping at the production checkpoint: a test
// reaching outside its own sandbox to change the machine's state. Without this,
// step 9's collector stays empty and its leak assertions assert nothing, which
// is why step 9 fails loudly on an empty collector rather than passing.
let restoreStamp = () => {};
{
  const stamp = stampPath();
  if (stamp && existsSync(stamp)) {
    const parked = `${stamp}.s3-parked`;
    renameSync(stamp, parked);
    restoreStamp = () => {
      if (existsSync(parked)) renameSync(parked, stamp);
    };
    process.on('exit', restoreStamp);
  }
}

// ---- identities ---------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function mintUserToken(email, orgId, role, validForSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: 'axonflow-user-token-mint',
      sub: email,
      email,
      user_id: email,
      tenant_id: orgId,
      org_id: orgId,
      role,
      region: 'local',
      jti: `${RUN_TAG}-${Math.random().toString(36).slice(2)}`,
      permissions: ['query', 'llm', 'mcp_query'],
      iat: now - 60,
      nbf: now - 60,
      exp: now + validForSeconds,
    })
  );
  const signing = `${header}.${payload}`;
  const signature = createHmac('sha256', JWT_SECRET).update(signing).digest('base64url');
  return `${signing}.${signature}`;
}

const devA = mintUserToken(`dev-a-${RUN_TAG}@example.com`, CLIENT_ID, 'developer', 3600);
const devB = mintUserToken(`dev-b-${RUN_TAG}@example.com`, CLIENT_ID, 'developer', 3600);
const admin = mintUserToken(`admin-${RUN_TAG}@example.com`, CLIENT_ID, 'admin', 3600);
const expired = mintUserToken(`old-${RUN_TAG}@example.com`, CLIENT_ID, 'developer', -3600);
const wrongOrg = mintUserToken(`out-${RUN_TAG}@example.com`, `other-org-${RUN_TAG}`, 'admin', 3600);
const malformed = 'not.a.jwt';

const client = (userToken) =>
  new AxonFlow({
    endpoint: AGENT_URL,
    clientId: CLIENT_ID,
    clientSecret: SECRET,
    userToken: userToken || undefined,
    // Debug is ON deliberately, and step 9 depends on it: every log line in
    // this SDK is behind this flag, so with it off the "the token does not
    // appear in the log" grep runs against a stream containing no SDK output at
    // all — a negative assertion over an empty haystack, true of every string.
    debug: true,
    timeout: 30000,
  });

/**
 * Drive the real /decide plane THROUGH THE SDK, as a given identity.
 *
 * Through client.decide rather than a hand-rolled POST, because a driver that
 * hand-posts the write leg is testing fetch on that leg. It is also the
 * evidence for the "inert on the write path" claim: /api/v1/decide is NOT
 * proxied, so the X-User-Token a client stamps is genuinely ignored there and
 * attribution comes from the BODY's userToken — hence a client with no
 * client-level identity.
 */
async function decideAs(userToken, index) {
  // DecideRequest/DecideResponse mirror the platform's SNAKE_CASE wire shape
  // (src/pep.ts), unlike the read types, which are camelCase.
  const response = await client(undefined).decide({
    stage: 'llm',
    query: `summarize support ticket ${index} for run ${RUN_TAG}`,
    user_token: userToken,
    target: { type: 'llm', model: 'gpt-4', provider: 'openai' },
    context: { 'x-session-id': RUN_TAG, 'x-ai-agent': 'read-path-identity-e2e' },
  });
  if (!response.decision_id) {
    fail(`the /decide response carried no decision_id (verdict=${response.verdict})`);
  }
  return response.decision_id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================ 1. WRITE
// Three, not one: the floor in step 2 is "at least the number this run wrote",
// and a floor of one is satisfied by almost any page.
const written = [];
for (let i = 0; i < WROTE; i++) written.push(await decideAs(devA, i));
console.log(`step 1 PASS: wrote ${written.length} decisions as dev-a: ${written.join(', ')}`);

// The audit write is asynchronous; bound the wait and say so rather than
// sleeping silently, so a later assertion fails on SCOPE, not on timing.
const asDevA = client(devA);
{
  const deadline = Date.now() + 45000;
  let visible = false;
  while (Date.now() < deadline && !visible) {
    try {
      await asDevA.explainDecision(written[0]);
      visible = true;
    } catch {
      await sleep(2000);
    }
  }
  if (!visible) {
    fail(
      `the decision ${written[0]} never became visible to the identity that wrote it within 45s — ` +
        `the audit write did not land, so every read assertion below would be about timing, not scope`
    );
  }
}

// ============================================================= 2. LIST
const rows = await asDevA.listDecisions({ limit: 50 });
if (rows.length < WROTE) {
  fail(
    `step 2: dev-a's page has ${rows.length} rows, want at least the ${WROTE} this run wrote — ` +
      `a page smaller than what we just wrote cannot be a correctly-scoped read`
  );
}
for (const id of written) {
  if (!rows.some((r) => r.decisionId === id)) {
    fail(`step 2: dev-a's page does not contain ${id}, which dev-a wrote in this run`);
  }
}
// The floor alone cannot tell own-rows from tenant-wide: a broken narrowing
// returning the WHOLE tenant would clear it comfortably.
await decideAs(devB, 99);
await sleep(3000);
const rowsAfter = await asDevA.listDecisions({ limit: 50 });
if (rowsAfter.length !== rows.length) {
  fail(
    `step 2: dev-a's page grew from ${rows.length} to ${rowsAfter.length} rows after DEV-B wrote ` +
      `one — the read is not narrowed to dev-a's own rows, so every scoping assertion below is vacuous`
  );
}
console.log(`step 2 PASS: dev-a's page (${rows.length} rows) is exactly its own; dev-b's write did not appear`);

// ========================================================== 3. EXPLAIN
const explanation = await asDevA.explainDecision(written[0]);
if (explanation.decisionId !== written[0]) {
  fail(`step 3: explanation decision_id = ${explanation.decisionId}, want ${written[0]}`);
}
// A field THIS RUN controls. "Non-empty" would pass on any stub.
if (explanation.context?.x_session_id !== RUN_TAG) {
  fail(
    `step 3: explanation context[x_session_id] = ${explanation.context?.x_session_id}, want ` +
      `${RUN_TAG} — the explanation must carry the value this run wrote, not merely be non-empty`
  );
}
console.log(
  `step 3 PASS: explanation for ${written[0]} is populated and carries this run's context ` +
    `(x_session_id=${RUN_TAG}, decision=${explanation.decision})`
);

// ====================================================== 4. NO IDENTITY
try {
  const anonRows = await client(undefined).listDecisions({ limit: 50 });
  if (anonRows.length > 0) {
    fail(
      `step 4: the unscoped list returned ${anonRows.length} rows — this stack is not enforcing ` +
        `role-scoped reads, so every scoping assertion in this driver is vacuous`
    );
  }
  fail(
    'step 4: the unscoped list returned 0 rows and NO error. That is the defect: the read could ' +
      'not have returned a row, and reporting it as an empty page is a confident lie'
  );
} catch (err) {
  if (!(err instanceof ReadScopeError)) fail(`step 4: failed with ${err}, want a typed ReadScopeError`);
  if (!err.identityMissing) fail(`step 4: refused with scope ${err.scope}, want none`);
  console.log(`step 4 PASS: the unscoped list is refused, not answered empty: ${err.message}`);
}

// ======================================================= 5. OTHER USER
try {
  await client(devB).explainDecision(written[0]);
  fail(`step 5: dev-b explained dev-a's decision ${written[0]} — that is the cross-user leak #2922 closed`);
} catch (err) {
  if (!(err instanceof ReadScopeError)) fail(`step 5: dev-b's refusal is ${err}, want a typed ReadScopeError`);
  if (err.identityMissing) {
    fail(
      `step 5: dev-b's refusal reports a MISSING identity; dev-b presented one. Reporting the ` +
        `wrong cause is the confidently-wrong-diagnosis class (scope=${err.scope})`
    );
  }
  if (err.scope !== 'own-rows') fail(`step 5: dev-b's refusal reports scope ${err.scope}, want own-rows`);
  console.log(`step 5 PASS: dev-b is refused dev-a's decision, with the RIGHT cause`);
}

// ====================================== 6. MALFORMED / EXPIRED / WRONG-ORG
// The common real-world state, not the exception. Each must fail CLOSED: a
// rejected token must never degrade into "no token", which would hand the
// caller the tenant credential's visibility.
for (const [name, bad] of [
  ['malformed', malformed],
  ['expired', expired],
  ['another org', wrongOrg],
]) {
  try {
    await client(bad).listDecisions({ limit: 5 });
    fail(
      `step 6 (${name}): a rejected per-user token produced a SUCCESSFUL read. A ` +
        `present-but-invalid identity must fail closed, never degrade to the unscoped path`
    );
  } catch (err) {
    const text = String(err);
    // This SDK maps 401 to AuthenticationError, so the status lives in the TYPE
    // rather than in the message — unlike the Go and Python siblings, whose
    // errors carry "HTTP 401". Asserting on the platform's own words plus the
    // type is the equivalent check, and it is a STRONGER one than a status
    // match: it proves the PLATFORM rejected the token rather than the SDK
    // degrading to the unscoped path, which is the failure that matters.
    if (!(err instanceof AuthenticationError)) {
      fail(`step 6 (${name}): want AuthenticationError (the 401 mapping), got: ${text}`);
    }
    if (err instanceof ReadScopeError) {
      fail(
        `step 6 (${name}): a REJECTED token was reported as a scoping outcome, which means it ` +
          `degraded to the unscoped path instead of failing closed`
      );
    }
    if (!/invalid user token/i.test(text)) {
      fail(`step 6 (${name}): the refusal is not the platform's token rejection: ${text}`);
    }
    if (text.includes(bad)) fail(`step 6 (${name}): the error message echoes the rejected credential`);
    console.log(`step 6 PASS (${name}): rejected fail-closed by the platform, credential not echoed`);
  }
}

// ======================================================= 7. TENANT-WIDE
// Without this, step 5 is unfalsifiable: a read broken for everyone would also
// "refuse dev-b".
const asAdmin = client(admin);
const adminExplanation = await asAdmin.explainDecision(written[0]);
if (adminExplanation.decisionId !== written[0]) {
  fail(`step 7: admin explanation decision_id = ${adminExplanation.decisionId}`);
}
console.log('step 7 PASS: an admin identity reads tenant-wide — step 5\'s refusal is scoping, not breakage');

// =========================================================== 8. AS_USER
// A derived client must be scoped to the identity it was derived FOR. This is
// the step that catches a derived client silently keeping the ORIGINAL
// identity — the Python sibling had exactly that bug.
try {
  await asAdmin.asUser(devB).explainDecision(written[0]);
  fail(
    'step 8: asUser(dev-b) read dev-a\'s decision — the derived client kept the ADMIN identity, ' +
      'which is the silent widening asUser exists to prevent'
  );
} catch (err) {
  if (!(err instanceof ReadScopeError) || err.scope !== 'own-rows') {
    fail(`step 8: asUser(dev-b) failed with ${err}, want a ReadScopeError with scope own-rows`);
  }
  console.log('step 8 PASS: asUser(dev-b) is scoped to dev-b, not to the admin it derived from');
}
// ...and the client it came from is unchanged.
if ((await asAdmin.explainDecision(written[0])).decisionId !== written[0]) {
  fail('step 8: asUser mutated the client it was derived from');
}

// ========================================================== 9. NO LEAK
await sleep(1000);
const logText = logged.join('\n');
// POSITIVE CONTROL. Without it the greps below are a negative assertion over a
// haystack that may be empty, which passes for every string.
if (!/axonflow/i.test(logText)) {
  fail(
    `step 9: the captured log contains no SDK output at all (${logText.length} chars), so ` +
      `asserting the token is absent from it asserts nothing. Debug must be on.`
  );
}
for (const [name, token] of [
  ['dev-a', devA],
  ['dev-b', devB],
  ['admin', admin],
]) {
  if (logText.includes(token)) fail(`step 9: the ${name} token appears in the SDK's log output`);
  collected.forEach((request, i) => {
    if (request.includes(token)) fail(`step 9: the ${name} token reached the telemetry collector in request ${i}`);
  });
}
if (collected.length === 0) {
  fail(
    'step 9: the telemetry collector received NOTHING, so its leak assertions asserted nothing. ' +
      'AXONFLOW_TELEMETRY must be on and the heartbeat must have fired.'
  );
}
console.log(
  `step 9 PASS: no token in ${logText.length} captured log chars (SDK output present) or in any ` +
    `of ${collected.length} telemetry requests`
);

// ======================================================= 10. OBSERVABLE
// A fail-closed read the platform leaves no trace of is a read nobody can
// audit; "it failed closed" is only half the property.
try {
  const { stdout, stderr } = await promisify(execFile)('docker', ['logs', '--tail', '500', ORCH], {
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!`${stdout}${stderr}`.includes('[read-scope]')) {
    fail(
      'step 10: the orchestrator logged no [read-scope] line for the unscoped read in step 4. The ' +
        'read failed closed but left no platform-side record of having done so'
    );
  }
} catch (err) {
  // Loudly inconclusive, never a silent pass.
  fail(
    `step 10: could not read ${ORCH}'s logs to confirm the platform recorded the unscoped read ` +
      `(${err}). Set AXONFLOW_ORCH_CONTAINER, or run where the stack's logs are reachable — an ` +
      `unverified observability claim is not evidence`
  );
}
console.log('step 10 PASS: the orchestrator recorded the unscoped read ([read-scope] present)');

restoreStamp();
collector.close();
process.exit(0);
