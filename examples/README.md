# AxonFlow SDK Examples

This directory contains working examples demonstrating how to use the AxonFlow TypeScript SDK.

## Prerequisites

```bash
npm install @axonflow/sdk
```

Set environment variables:

```bash
export AXONFLOW_CLIENT_ID="your-client-id"
export AXONFLOW_CLIENT_SECRET="your-client-secret"
export AXONFLOW_AGENT_URL="http://localhost:8080"  # Optional (default for local docker-compose)
```

## Examples

### 1. Basic Usage (`examples/basic/`)

Simple SDK initialization and protected AI calls.

```bash
cd examples/basic
npx tsx index.ts
```

Demonstrates:
- Client initialization
- Protecting AI calls with governance
- Handling blocked requests
- PII detection

### 2. MCP Connectors (`examples/connectors/`)

Working with the MCP connector marketplace.

```bash
cd examples/connectors
npx tsx index.ts
```

Demonstrates:
- Listing available connectors
- Installing connectors
- Querying connector data

### 3. Multi-Agent Planning (`examples/planning/`)

Complex workflow orchestration with MAP.

```bash
cd examples/planning
npx tsx index.ts
```

Demonstrates:
- Generating multi-step plans
- Executing plans
- Checking plan status
- Handling plan results

### 4. Proxy Mode (`examples/proxy-mode/`)

Routing requests through AxonFlow with `proxyLLMCall`.

```bash
cd examples/proxy-mode
npx tsx index.ts
```

### 5. WCP retry_context + idempotency_key (`examples/wcp-retry-idempotency/`)

End-to-end exercise of the v7.3.0 WCP retry primitives. Requires an
enterprise stack at `AXONFLOW_BASE_URL`.

```bash
cd examples/wcp-retry-idempotency
npx tsx index.ts
```

### 6. Typed Policy Authoring (`examples/typed-policies/`)

Authoring policy as a typed document against a v11.0.0 platform. Run it from the repository root, since it reads `tests/fixtures/typed-policy-publish-body.json` (or the file `AXONFLOW_TYPED_POLICY_BODY` names):

```bash
npx tsx examples/typed-policies/index.ts
```

Demonstrates:
- Reading what the deployment may author
- Validating a document and reading every finding
- Publishing and activating it, only with `AXONFLOW_TYPED_POLICY_PUBLISH=1`, since that changes the organization's active policy
- Reading a refusal's status, reason and findings
- The document in force, as the exact signed text

### 7. PEP Capability Handshake (`examples/pep-handshake/`)

Declaring what an enforcement point can discharge. The platform reads the declaration from v10.4.0.

```bash
npx tsx examples/pep-handshake/index.ts
```

Demonstrates:
- A declaration for every call the client makes to a plane that reads it
- A per-call declaration, for a second enforcement point in the same process
- A declaration the platform would refuse, failing before anything is sent

Both read `AXONFLOW_AGENT_URL` (default `http://localhost:8080`), `AXONFLOW_CLIENT_ID` and `AXONFLOW_CLIENT_SECRET`, and exit non-zero when a step fails.

## Running Examples

Each example uses `tsx` to run TypeScript directly without a separate compile step:

```bash
# tsx is a zero-config TS runner; either install globally or use npx
npm install -g tsx

# Run any example
cd examples/basic
tsx index.ts
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AXONFLOW_CLIENT_ID` | Yes | Your client/tenant identifier |
| `AXONFLOW_CLIENT_SECRET` | Yes | Your client secret |
| `AXONFLOW_AGENT_URL` | No | Agent endpoint (default: `http://localhost:8080`) |
| `AXONFLOW_TENANT_ID` | No | Tenant ID for connector ops; falls back to `AXONFLOW_CLIENT_ID` |
| `AXONFLOW_REDIS_HOST` | No | Redis host as seen from the platform (default: `redis`, the docker-compose service) |
| `AXONFLOW_REDIS_PORT` | No | Redis port (default: `6379`) |

## Learn More

- [Main Documentation](../README.md)
- [API Reference](https://www.npmjs.com/package/@axonflow/sdk)
- [AxonFlow Docs](https://docs.getaxonflow.com)
