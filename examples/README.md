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
