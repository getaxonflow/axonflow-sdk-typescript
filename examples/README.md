# AxonFlow SDK Examples

This directory contains working examples demonstrating how to use the AxonFlow TypeScript SDK.

## Prerequisites

```bash
npm install @axonflow/sdk
```

Set environment variables:

```bash
export AXONFLOW_API_KEY="AXON-PLUS-yourorg-20351025-signature"  # Your license key
export AXONFLOW_TENANT="your-tenant-id"
export AXONFLOW_AGENT_URL="http://localhost:8080"  # Optional (default for local docker-compose)
```

**Note**: `AXONFLOW_API_KEY` should be your AxonFlow license key in the format `AXON-{TIER}-{ORG}-{EXPIRY}-{SIGNATURE}`

## Examples

### 1. Basic Usage (`examples/basic/`)

Simple SDK initialization and protected AI calls.

```bash
cd examples/basic
npx ts-node index.ts
```

Demonstrates:
- Client initialization
- Protecting AI calls with governance
- Handling blocked requests
- PII detection
- Sandbox mode

### 2. MCP Connectors (`examples/connectors/`)

Working with the MCP connector marketplace.

```bash
cd examples/connectors
npx ts-node index.ts
```

Demonstrates:
- Listing available connectors
- Installing connectors
- Querying connector data

### 3. Multi-Agent Planning (`examples/planning/`)

Complex workflow orchestration with MAP.

```bash
cd examples/planning
npx ts-node index.ts
```

Demonstrates:
- Generating multi-step plans
- Executing plans
- Checking plan status
- Handling plan results

## Running Examples

Each example can be run directly with ts-node:

```bash
# Install ts-node if not already installed
npm install -g ts-node typescript

# Run any example
cd examples/basic
ts-node index.ts
```

Or compile and run:

```bash
tsc index.ts
node index.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AXONFLOW_API_KEY` | Yes | Your AxonFlow license key (format: AXON-{TIER}-{ORG}-{EXPIRY}-{SIG}) |
| `AXONFLOW_TENANT` | Yes | Your tenant identifier |
| `AXONFLOW_AGENT_URL` | No | Custom endpoint (default: `http://localhost:8080` for local docker-compose) |
| `AMADEUS_API_KEY` | No | For connector examples |
| `AMADEUS_API_SECRET` | No | For connector examples |

## Learn More

- [Main Documentation](../README.md)
- [API Reference](https://www.npmjs.com/package/@axonflow/sdk)
- [AxonFlow Docs](https://docs.getaxonflow.com)
