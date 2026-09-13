# PEP capability handshake: the platform reads the SDK's declaration

`test.mjs` drives the built SDK against a real AxonFlow agent and asserts, from the agent's own metrics, that the `X-Axonflow-PEP-Handshake` declaration the SDK sends is decoded and admitted on every plane that reads it.

## What it proves

After each call the driver reads `axonflow_pep_handshake_total{outcome, plane}` from the agent's `/prometheus` endpoint. The agent moves that counter once per inbound request on the four planes that resolve the declaration, so each assertion is a fact the agent recorded:

| Call | Expected movement |
|---|---|
| `decide` | `accepted` on `decision` |
| `evaluate`, `evaluateAll` | `accepted` on `access_evaluation` |
| `mcpCheckInput`, `mcpCheckOutput`, `fulfillRequest`'s engine round-trip | `accepted` on `mcp` |
| `preCheck` | `accepted` on `gateway` |
| `decide` with a per-call declaration naming `approval_challenge` | `over_advertised` on `decision` on a Community agent, which drops that family; `accepted` on any other edition |
| `decide` from a client with no declaration | `absent` on `decision` |

Each call must move exactly the one series listed, by exactly one. `accepted` means the agent decoded the SDK's bytes, validated the document and admitted the enforcement point. A malformed or repeated header would have been refused with a 400 and counted as `malformed`.

## What it does not prove

The consequence of a declaration differs by edition. On Enterprise, an allow verdict carrying a mandatory obligation the declared set cannot discharge becomes a deny. On Community, the declaration is recorded and does not deny. That rule is the platform's own, and the platform's suites prove it. This driver proves the declaration arrives and is admitted, which is the SDK's part.

`proxyLLMCall` (`/api/request`) and the OpenAI-compatible route do not read the header, and the SDK does not send it there. The unit tests in `tests/pep-handshake.test.ts` assert that absence on the wire.

## Running it

Boot an agent from the platform's main (any edition), build the SDK, then:

```bash
npm run build
AXONFLOW_AGENT_URL=http://localhost:8080 \
AXONFLOW_CLIENT_ID=runtime-e2e AXONFLOW_CLIENT_SECRET=runtime-e2e-secret \
node runtime-e2e/pep_handshake_planes/test.mjs
```

The driver reads the agent's edition from `/health` to choose the per-call leg's expected outcome. It needs no other state: nothing is written, and the counter deltas are read around each call. Run it against an agent no other client is using, since a concurrent request on one of the four planes would move the counter too.
