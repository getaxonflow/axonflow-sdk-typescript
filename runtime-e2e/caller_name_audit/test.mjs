// runtime-e2e/caller_name_audit/test.mjs
//
// Real-wire test of AuditToolCallRequest.callerName (#2912, sub-issue of
// epic #2905) against a real running agent+orchestrator stack.
//
// getaxonflow/axonflow-enterprise PR #2953 (merged; shipped in platform
// v9.11.0) added a `caller_name` field to the orchestrator's tool-call
// audit path alongside the legacy `tool_type` field (kept as a deprecated
// input fallback). The server resolves caller identity as: caller_name if
// supplied -> legacy tool_type if supplied -> "unknown" as the default
// when neither is supplied (#2903, folded into the same merge — an
// unidentified caller is no longer silently attributed to the specific
// client "claude_code", which was the pre-#2903 default). This test
// proves both halves of that contract land on a real audit_logs row —
// not just that the SDK serializes callerName correctly (that's covered
// by the Jest suite in tests/audit-tool-call.test.ts):
//
//   1. Explicit callerName -> policy_details.caller_name equals it.
//   2. Neither callerName nor toolType supplied -> policy_details.caller_name
//      is "unknown" (regression guard for #2903 — must NOT be "claude_code").
//
// Steps per scenario:
//  1. Call the real SDK's client.auditToolCall() and inspect the wire
//     response for a real audit_id.
//  2. The orchestrator's AuditLogger batches writes (flush every 10s), so
//     poll GET /api/v1/audit/{audit_id} until the row lands.
//  3. The SDK's typed AuditLogEntry does not surface policy_details (it's
//     an internal JSONB blob never decoded client-side), so this step reads
//     the raw JSON body directly — the only way to observe
//     policy_details.caller_name from outside the platform — and asserts
//     it equals what's expected.
//
// A caller lacking per-user read authority is fail-closed to zero rows on
// this stack (ADR/#2922 role-scoped audit reads), so every write and its
// verification read carry an `X-User-Email` identity header. This is
// trusted for AUDIT ATTRIBUTION ONLY (never authz/verdicts) when the
// deployment opts in via AXONFLOW_TRUST_IDENTITY_HEADERS=true — this
// repo's documented local-dev default (axonflow-enterprise/.env, per
// docker-compose.yml's `identity_header_attribution` feature, v9.9.0). The
// header is added by wrapping the real `fetch` used by the SDK's _fetch —
// no response is faked or intercepted; every request and response here
// really crosses the wire to the live stack.
//
// Run via (after `npm run build`; see ../README.md for how to bring up a
// local stack and register/derive tenant credentials):
//
//   export AXONFLOW_AGENT_URL=http://localhost:8080
//   export AXONFLOW_CLIENT_ID=local-dev-org
//   export AXONFLOW_CLIENT_SECRET=<its secret>
//   node runtime-e2e/caller_name_audit/test.mjs

import { AxonFlow } from '../../dist/esm/client.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const clientId =
  process.env.AXONFLOW_CLIENT_ID || process.env.AXONFLOW_TENANT_ID || 'local-dev-org';
const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || process.env.AXONFLOW_TENANT_SECRET;

if (!clientSecret) {
  console.error(
    'AXONFLOW_CLIENT_SECRET (or AXONFLOW_TENANT_SECRET) must be set; see ../README.md'
  );
  process.exit(2);
}

const client = new AxonFlow({ endpoint, clientId, clientSecret });
const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
const realFetch = globalThis.fetch;

// Wrap the real global fetch (what the SDK's private _fetch() calls) so
// every outbound request also carries the trust-gated X-User-Email
// identity header. This is the ONLY modification to the transport — no
// mocked/stubbed responses, no intercepted body. Restored immediately
// after the SDK call so later raw fetches in this file are unaffected.
function withUserEmailHeader(email, fn) {
  globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('X-User-Email', email);
    return realFetch(input, { ...init, headers });
  };
  return fn().finally(() => {
    globalThis.fetch = realFetch;
  });
}

// Runs one auditToolCall() through the real SDK, polls the row back, and
// asserts policy_details.caller_name === want. Returns true on PASS.
async function runScenario(name, { toolName, callerName, toolType }, want) {
  const probeEmail = `runtime-e2e-caller-name-${name}-${Date.now()}@example.com`;

  const request = { toolName };
  if (callerName !== undefined) request.callerName = callerName;
  if (toolType !== undefined) request.toolType = toolType;

  const result = await withUserEmailHeader(probeEmail, () => client.auditToolCall(request));
  console.log(
    `[${name}] SDK auditToolCall recorded -> audit_id=${result.auditId} status=${result.status}`
  );

  if (!result.auditId) {
    console.error(`FAIL [${name}]: SDK auditToolCall returned no audit_id`);
    return false;
  }

  const deadline = Date.now() + 25000;
  let policyDetails = null;
  let lastStatus = 0;

  while (Date.now() < deadline && !policyDetails) {
    const resp = await realFetch(
      `${endpoint}/api/v1/audit/${encodeURIComponent(result.auditId)}`,
      {
        headers: {
          Authorization: authHeader,
          'X-User-Email': probeEmail,
        },
      }
    );
    lastStatus = resp.status;
    if (resp.ok) {
      const body = await resp.json();
      if (body.policy_details && typeof body.policy_details === 'object') {
        policyDetails = body.policy_details;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!policyDetails) {
    console.error(
      `FAIL [${name}]: audit row ${result.auditId} did not surface policy_details within 25s (last GET status=${lastStatus})`
    );
    return false;
  }
  if (!('caller_name' in policyDetails)) {
    console.error(
      `FAIL [${name}]: policy_details missing caller_name key entirely: ${JSON.stringify(policyDetails)}`
    );
    return false;
  }
  if (policyDetails.caller_name !== want) {
    console.error(
      `FAIL [${name}]: policy_details.caller_name = ${JSON.stringify(policyDetails.caller_name)}, ` +
        `want ${JSON.stringify(want)} (full policy_details: ${JSON.stringify(policyDetails)})`
    );
    return false;
  }

  console.log(
    `PASS [${name}]: policy_details.caller_name = ${JSON.stringify(policyDetails.caller_name)} reached the audit_logs row via the real agent+orchestrator stack`
  );
  console.log(`[${name}] Wire policy_details: ${JSON.stringify(policyDetails)}`);
  return true;
}

let exitCode = 0;
try {
  const wantCallerName = `e2e-caller-name-probe-${Date.now()}`;

  const explicitOk = await runScenario(
    'explicit-caller-name',
    { toolName: 'runtimeE2eCallerNameProbe', callerName: wantCallerName },
    wantCallerName
  );

  // #2903 regression guard: neither callerName nor toolType supplied must
  // default to "unknown", NOT the specific client "claude_code".
  const defaultOk = await runScenario(
    'neither-supplied-defaults-to-unknown',
    { toolName: 'runtimeE2eCallerNameDefaultProbe' },
    'unknown'
  );

  if (!explicitOk || !defaultOk) {
    exitCode = 1;
  }
} catch (err) {
  console.error(`FAIL: unexpected exception: ${err?.stack ?? err}`);
  exitCode = 1;
} finally {
  globalThis.fetch = realFetch;
}

process.exit(exitCode);
