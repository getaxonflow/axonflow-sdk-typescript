# 2907_langgraph_server_tool_split

Real-stack proof for #2907: `mcpToolInterceptor()` (LangGraph adapter) no
longer concatenates the MCP server name and tool name into a single
`connectorType` string. Server and tool identity now travel as two distinct
wire fields, matching the platform's two-field `(server, tool)` identity
contract added by epic #2905 / #2904 (`MCPCheckInputRequest`/
`MCPCheckOutputRequest` gained an optional `tool` field alongside
`connector_type`).

The driver, against a real running agent:

1. Calls `client.mcpCheckInput({ connectorType, tool, statement })` — the new
   two-field shape — and asserts it is accepted, and that `connector_type`
   and `tool` genuinely arrive on the wire as two separate fields (not
   `"weather-mcp.get_forecast"` concatenated into one).
2. Calls `client.mcpCheckInput({ connectorType, statement })` — the old
   single-field shape, no `tool` — and asserts it still works, proving
   backward compatibility for callers who haven't adopted the `tool` field.
3. Drives `AxonFlowLangGraphAdapter.mcpToolInterceptor()` — the actual call
   site that had the bug — with a fake MCP request (`serverName`, `name`,
   `args`) and asserts it sends `connector_type: serverName` and
   `tool: name` as separate fields.

No mocks — every assertion is driven by a real `fetch` from the compiled SDK
(`dist/esm/index.js`) against a real running AxonFlow agent. The only stand-in
is `fakeRequest` in step 3, which shapes an MCP tool-call object the way
`MultiServerMCPClient` would hand one to the interceptor — the interceptor,
the SDK client, and the HTTP call to the agent are all real.

## Run

```
npm run build   # if dist/ is stale
AXONFLOW_AGENT_URL=http://localhost:8080 node runtime-e2e/2907_langgraph_server_tool_split/test.mjs
```

Uses tenant id `ts-sdk-2907-runtime-e2e` (override with `AXONFLOW_TENANT_ID`)
to avoid colliding with other tests against the same shared agent. No
`AXONFLOW_CLIENT_SECRET` is required — the target agent runs in community
mode.

Exits non-zero if either check-input call errors, or if `connector_type`
and `tool` don't arrive on the wire as distinct fields.
