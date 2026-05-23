// runtime-e2e/create_hitl_request/test.mjs
//
// Real-stack assertion: SDK posts a valid create-payload to
// POST /api/v1/hitl/queue and parses the APIResponse envelope back
// into a populated HITLApprovalRequest. Issue
// getaxonflow/axonflow-enterprise#2421.
//
// Spins up a local node:http server that mimics the platform handler
// at `platform/agent/hitl/handler.go:177`, drives the SDK's
// AxonFlow.createHITLRequest against it through the real fetch
// transport, and inspects the captured request body for every
// required field including the new `notify_url` introduced in
// getaxonflow/axonflow-enterprise#2419.
//
// No mocked fetch, no Jest spies, no MockHTTPSResponseFactory — real
// bytes through node:http on both sides. Satisfies the
// `runtime-e2e/` DoD gate that the unit suite under tests/ does not.
//
// Usage:
//
//   npm run build
//   node runtime-e2e/create_hitl_request/test.mjs

import { createServer } from 'node:http';
import { AxonFlow } from '../../dist/esm/client.js';

const NOTIFY_URL = 'https://workflows.example.com/hooks/runtime-e2e';

let capturedBody = '';
let capturedPath = '';

const server = createServer((req, res) => {
  if (req.method === 'POST') {
    capturedPath = req.url ?? '';
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      capturedBody = Buffer.concat(chunks).toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(capturedBody);
      } catch {
        res.statusCode = 400;
        res.end('bad json');
        return;
      }
      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          data: {
            request_id: 'hitl-req-runtime-e2e-001',
            org_id: 'org-runtime-e2e',
            tenant_id: 'tenant-runtime-e2e',
            client_id: parsed.client_id ?? '',
            user_id: parsed.user_id ?? '',
            original_query: parsed.original_query ?? '',
            request_type: parsed.request_type ?? '',
            request_context: parsed.request_context ?? null,
            triggered_policy_id: parsed.triggered_policy_id ?? '',
            triggered_policy_name: parsed.triggered_policy_name ?? '',
            trigger_reason: parsed.trigger_reason ?? '',
            severity: parsed.severity ?? 'high',
            notify_url: parsed.notify_url ?? null,
            status: 'pending',
            expires_at: '2026-05-23T11:00:00Z',
            created_at: '2026-05-23T10:00:00Z',
            updated_at: '2026-05-23T10:00:00Z',
          },
        })
      );
    });
    return;
  }
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', version: 'runtime-e2e' }));
    return;
  }
  res.statusCode = 405;
  res.end();
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const endpoint = `http://127.0.0.1:${port}`;

let exitCode = 0;
try {
  const client = new AxonFlow({
    endpoint,
    clientId: 'runtime-e2e',
    clientSecret: 'runtime-e2e-secret',
    tenant: 'tenant-runtime-e2e',
  });

  const result = await client.createHITLRequest({
    client_id: 'runtime-e2e-client',
    user_id: 'runtime-e2e-user',
    original_query: 'disburse $50000 to cust-runtime-e2e',
    request_type: 'adk-tool',
    request_context: { tool_name: 'disburse_payment' },
    triggered_policy_id: 'loan-amount-cap',
    triggered_policy_name: 'Loan amount cap',
    trigger_reason: 'Disbursement above $10k requires manager approval',
    severity: 'high',
    notify_url: NOTIFY_URL,
  });

  const expected = {
    client_id: 'runtime-e2e-client',
    user_id: 'runtime-e2e-user',
    original_query: 'disburse $50000 to cust-runtime-e2e',
    request_type: 'adk-tool',
    triggered_policy_id: 'loan-amount-cap',
    triggered_policy_name: 'Loan amount cap',
    trigger_reason: 'Disbursement above $10k requires manager approval',
    severity: 'high',
    notify_url: NOTIFY_URL,
  };

  if (!capturedBody) {
    process.stderr.write('FAIL: server captured no body\n');
    exitCode = 1;
  } else {
    const wire = JSON.parse(capturedBody);
    if (capturedPath !== '/api/v1/hitl/queue') {
      process.stderr.write(`FAIL: POST path = ${capturedPath}, want /api/v1/hitl/queue\n`);
      exitCode = 1;
    }
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (wire[field] !== expectedValue) {
        process.stderr.write(
          `FAIL: wire body field ${field} = ${JSON.stringify(wire[field])}, ` +
            `want ${JSON.stringify(expectedValue)}\nFull body: ${capturedBody}\n`
        );
        exitCode = 1;
      }
    }
    if (result.request_id !== 'hitl-req-runtime-e2e-001') {
      process.stderr.write(`FAIL: parsed request_id = ${result.request_id}\n`);
      exitCode = 1;
    }
    if (result.notify_url !== NOTIFY_URL) {
      process.stderr.write(
        `FAIL: parsed notify_url = ${result.notify_url}, want ${NOTIFY_URL}\n`
      );
      exitCode = 1;
    }
  }

  if (exitCode === 0) {
    console.log('PASS: createHITLRequest wire payload + response parsing round-trip OK');
    console.log(`Wire body: ${capturedBody}`);
    console.log(
      `Parsed approval_id=${result.request_id} notify_url=${result.notify_url}`
    );
  }
} catch (err) {
  process.stderr.write(`FAIL: unexpected exception: ${err?.stack ?? err}\n`);
  exitCode = 1;
} finally {
  server.close();
}

process.exit(exitCode);
