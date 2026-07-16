// runtime-e2e/2907_langgraph_server_tool_split/test.mjs
//
// Real-stack assertion: the MCP server and tool identity travel as two
// DISTINCT wire fields — connector_type and tool — instead of being
// concatenated into a single connectorType string (the pre-fix behavior of
// `${request.serverName}.${request.name}`). Matches the platform's
// two-field (server, tool) identity contract (epic #2905 / #2904).
//
// Proves, against a real running agent:
//   1. client.mcpCheckInput({ connectorType, tool, statement }) — the new
//      two-field shape — is accepted and processed.
//   2. client.mcpCheckInput({ connectorType, statement }) — the old
//      single-field shape, no `tool` — still works (backward compat).
//   3. AxonFlowLangGraphAdapter.mcpToolInterceptor(), the actual call site
//      that motivated this fix, sends connector_type=serverName and
//      tool=name as two distinct fields (not concatenated) when wired
//      through a fake MCP request.
//
// Per CLAUDE.md HARD RULE #0 — this test MUST hit a real agent, no mocks.
//
// Run (npm run build first):
//
//   AXONFLOW_AGENT_URL=http://localhost:8080 node runtime-e2e/2907_langgraph_server_tool_split/test.mjs

import { AxonFlow, AxonFlowLangGraphAdapter } from '../../dist/esm/index.js';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
// Unique tenant id so this test can't collide with other tests hitting the
// same shared community agent concurrently.
const tenantId = process.env.AXONFLOW_TENANT_ID || 'ts-sdk-2907-runtime-e2e';

const client = new AxonFlow({ endpoint, clientId: tenantId });

let total = 0;
let failures = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${name}] ${detail}`);
  if (!ok) failures += 1;
};

// Capture what actually leaves the process on the wire so we can assert
// connector_type and tool arrive as two separate fields, not one
// concatenated string. This wraps the real global fetch and always calls
// through to it — it is an observation point, not a fake response.
let capturedBody = null;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const urlStr = typeof url === 'string' ? url : url?.url ?? '';
  if (urlStr.includes('/mcp/check-input') && init?.body) {
    try {
      capturedBody = JSON.parse(init.body);
    } catch {
      capturedBody = null;
    }
  }
  return origFetch(url, init);
};

// 1. Direct client.mcpCheckInput with the new two-field (server, tool) shape.
try {
  capturedBody = null;
  const result = await client.mcpCheckInput({
    connectorType: 'weather-mcp',
    tool: 'get_forecast',
    statement: 'weather-mcp.get_forecast({"city":"nyc"})',
  });
  check(
    'two-field-check-input-accepted',
    typeof result.allowed === 'boolean',
    `allowed=${result.allowed} policies_evaluated=${result.policies_evaluated}`
  );
  check(
    'wire-sends-tool-separate-from-connector-type',
    capturedBody?.connector_type === 'weather-mcp' && capturedBody?.tool === 'get_forecast',
    `wire body=${JSON.stringify(capturedBody)}`
  );
} catch (e) {
  check('two-field-check-input-accepted', false, e.message);
  check('wire-sends-tool-separate-from-connector-type', false, 'skipped: request errored');
}

// 2. Backward compatibility: old single-field shape (no `tool`) still works.
try {
  capturedBody = null;
  const result = await client.mcpCheckInput({
    connectorType: 'postgres',
    statement: 'SELECT 1',
  });
  check(
    'single-field-backward-compat-accepted',
    typeof result.allowed === 'boolean',
    `allowed=${result.allowed} policies_evaluated=${result.policies_evaluated}`
  );
  check(
    'wire-omits-tool-when-not-provided',
    capturedBody !== null && !Object.prototype.hasOwnProperty.call(capturedBody, 'tool'),
    `wire body=${JSON.stringify(capturedBody)}`
  );
} catch (e) {
  check('single-field-backward-compat-accepted', false, e.message);
  check('wire-omits-tool-when-not-provided', false, 'skipped: request errored');
}

// 3. Through the actual public surface that motivated #2907:
//    AxonFlowLangGraphAdapter.mcpToolInterceptor(). Pre-fix this built
//    connectorType as `${serverName}.${name}`, collapsing server+tool into
//    one field. Post-fix it sends serverName as connector_type and name as
//    a separate tool field.
try {
  const adapter = new AxonFlowLangGraphAdapter(client, 'runtime-e2e-2907-workflow');
  const interceptor = adapter.mcpToolInterceptor();

  const fakeRequest = {
    serverName: 'weather-mcp',
    name: 'get_forecast',
    args: { city: 'nyc' },
  };
  const handlerResult = { forecast: 'sunny' };

  capturedBody = null;
  try {
    const result = await interceptor(fakeRequest, async () => handlerResult);
    check('interceptor-passthrough-result', result === handlerResult, `result=${JSON.stringify(result)}`);
  } catch (e) {
    // A policy block would still be a valid outcome for this assertion —
    // the precheck fires (and we captured its wire body) before any block
    // is raised. Only fail this specific check if it wasn't a policy block.
    check(
      'interceptor-passthrough-result',
      /policy|block/i.test(e.message),
      `interceptor raised: ${e.message}`
    );
  }
  check(
    'interceptor-sends-two-field-identity-not-concatenated',
    capturedBody?.connector_type === 'weather-mcp' &&
      capturedBody?.tool === 'get_forecast' &&
      capturedBody?.connector_type !== 'weather-mcp.get_forecast',
    `wire body=${JSON.stringify(capturedBody)}`
  );
} catch (e) {
  check('interceptor-sends-two-field-identity-not-concatenated', false, e.message);
}

globalThis.fetch = origFetch;

if (failures > 0) {
  console.log(`RESULT: FAIL (${failures}/${total})`);
  process.exit(1);
}
console.log(`RESULT: PASS (${total}/${total})`);
