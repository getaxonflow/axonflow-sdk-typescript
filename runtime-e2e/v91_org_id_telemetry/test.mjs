// runtime-e2e/v91_org_id_telemetry/test.mjs
//
// Real-stack assertion: the SDK's telemetry heartbeat carries
// org_id on the wire (v9.1). Issue #2277.
//
// Spins up a local http.createServer, points AXONFLOW_CHECKPOINT_URL at
// it, fires a ping via sendTelemetryPing, and inspects the captured
// JSON body for the org_id field. Bytes flow real → real through node:http
// on both sides.
//
// Usage:
//
//   # ORG_ID set — operator-supplied (self-hosted) or cs_<uuid>:
//   ORG_ID=acme-corp node runtime-e2e/v91_org_id_telemetry/test.mjs
//
//   # ORG_ID unset — local-dev-org sentinel:
//   unset ORG_ID && node runtime-e2e/v91_org_id_telemetry/test.mjs

import { createServer } from 'node:http';
import { ORG_ID_LOCAL_DEV_SENTINEL, sendTelemetryPing } from '../../dist/esm/telemetry.js';

const expected = process.env.ORG_ID || ORG_ID_LOCAL_DEV_SENTINEL;

let capturedBody = '';

const server = createServer((req, res) => {
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      capturedBody = Buffer.concat(chunks).toString('utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ latest_version: null, alerts: [] }));
    });
  } else {
    // /health probe
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: '8.0.0-runtime-e2e' }));
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

process.env.AXONFLOW_CHECKPOINT_URL = `http://127.0.0.1:${port}/v1/ping`;
delete process.env.AXONFLOW_TELEMETRY;

sendTelemetryPing({
  mode: 'production',
  endpoint: `http://127.0.0.1:${port}`,
});

// Poll for delivery up to 5 seconds.
for (let i = 0; i < 100 && !capturedBody; i += 1) {
  await new Promise(r => setTimeout(r, 50));
}

server.close();

if (!capturedBody) {
  console.error('FAIL: no telemetry body captured');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(capturedBody);
} catch (err) {
  console.error(`FAIL: body not valid JSON: ${err.message}\nBody: ${capturedBody}`);
  process.exit(1);
}

if (parsed.org_id !== expected) {
  console.error(
    `FAIL: org_id = ${JSON.stringify(parsed.org_id)}, want ${JSON.stringify(expected)}`
  );
  console.error(`Body: ${capturedBody}`);
  process.exit(1);
}

console.log(
  `PASS: telemetry wire payload carries org_id=${JSON.stringify(parsed.org_id)} (expected=${JSON.stringify(expected)})`
);
console.log(`Wire body: ${capturedBody}`);
process.exit(0);
