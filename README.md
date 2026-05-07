# AxonFlow SDK for TypeScript

[![npm version](https://img.shields.io/npm/v/@axonflow/sdk.svg)](https://www.npmjs.com/package/@axonflow/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@axonflow/sdk.svg)](https://www.npmjs.com/package/@axonflow/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

> **Upgrade strongly recommended.** AxonFlow ships substantial monthly security and quality hardening; staying on the latest major is the security-supported release line. [Latest release](https://github.com/getaxonflow/axonflow-sdk-typescript/releases/latest) · [Security advisories](https://github.com/getaxonflow/axonflow-sdk-typescript/security/advisories)

> **Evaluating AxonFlow in production?** We're opening limited Design Partner slots.
>
> Free 30-minute architecture and incident-readiness review, priority issue triage, roadmap input, and early feature access.
>
> [Apply here](https://getaxonflow.com/design-partner?utm_source=readme_sdk_typescript) or email [design-partners@getaxonflow.com](mailto:design-partners@getaxonflow.com).
>
> No commitment required. We reply within 48 hours.

> **Questions or feedback?**
>
> Comment in [GitHub Discussions](https://github.com/getaxonflow/axonflow/discussions/239) or email [hello@getaxonflow.com](mailto:hello@getaxonflow.com) for private feedback.

Add invisible AI governance to your applications in 3 lines of code. No UI changes. No user training. Just drop-in enterprise protection.

## How This SDK Fits with AxonFlow

This SDK is a client library for interacting with a running AxonFlow control plane. It is used from application or agent code to send execution context, policies, and requests at runtime.

A deployed AxonFlow platform (self-hosted or cloud) is required for end-to-end AI governance. SDKs alone are not sufficient—the platform and SDKs are designed to be used together.

### See AxonFlow in Action

Three short videos covering different angles of the platform:

- **[Community Quickstart Demo (Code + Terminal, 2.5 min)](https://youtu.be/BSqU1z0xxCo)** — governed calls, PII block, Gateway Mode with LangChain/CrewAI, and MAP from YAML
- **[Runtime Control Demo (Portal + Workflow, 3 min)](https://youtu.be/6UatGpn7KwE)** — approvals, retry safety, execution state, and the audit viewer
- **[Architecture Deep Dive (12 min)](https://youtu.be/Q2CZ1qnquhg)** — how the control plane works, policy enforcement flow, and multi-agent planning

## Installation

```bash
npm install @axonflow/sdk
```

### Install from Source

```bash
git clone https://github.com/getaxonflow/axonflow-sdk-typescript.git
cd axonflow-sdk-typescript && npm install && npm run build && npm link
# In your project: npm link @axonflow/sdk
```

## Evaluation Tier (Free License)

Need more capacity than Community without moving to Enterprise? Evaluation uses the same core features with higher limits:

| Limit | Community | Evaluation (Free) | Enterprise |
|-------|-----------|-------------------|------------|
| Tenant policies | 20 | 50 | Unlimited |
| Org-wide policies | 0 | 5 | Unlimited |
| Audit retention | 3 days | 14 days | 3650 days |
| Concurrent executions | 5 | 25 | Unlimited |
| Pending execution approvals | 5 | 25 | Unlimited |
| Evidence export (CSV / JSON) | — | 5,000 records · 14d window · 3/day | Unlimited |
| Policy simulation | — | 300 / day | Unlimited |

Concurrent executions applies to MAP and WCP executions per tenant. Pending execution approvals applies to MAP confirm/step mode and WCP approval queues.

> **Note:** Evidence export and policy simulation are licensed AxonFlow platform capabilities available alongside the SDK on your deployed platform — not language-specific SDK helpers. Access them via the platform API or customer portal. The SDK row is included to show what your licensed deployment unlocks at each tier.

[Get a free Evaluation license](https://getaxonflow.com/evaluation-license?utm_source=readme_sdk_typescript_eval) · [Full feature matrix](https://docs.getaxonflow.com/docs/features/community-vs-enterprise?utm_source=readme_sdk_typescript_eval)

## Try Without Installing

Skip local setup entirely — try AxonFlow instantly at [**try.getaxonflow.com**](https://docs.getaxonflow.com/docs/deployment/community-saas):

```bash
# 1. Register (30 seconds)
curl -X POST https://try.getaxonflow.com/api/v1/register \
  -H "Content-Type: application/json" -d '{"label":"my-trial"}'

# 2. Set credentials and auto-connect
export AXONFLOW_TRY=1
export AXONFLOW_CLIENT_ID=cs_your-tenant-id
export AXONFLOW_CLIENT_SECRET=your-secret
```

No Docker, no license, no installation. Rate-limited to 20 req/min. [Learn more](https://docs.getaxonflow.com/docs/deployment/community-saas).

## Quick Start

### Gateway Mode (Recommended)

Gateway Mode provides the most reliable integration by explicitly separating policy checks, LLM calls, and audit logging:

```typescript
import { AxonFlow } from '@axonflow/sdk';
import OpenAI from 'openai';

// Initialize clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const axonflow = new AxonFlow({
  clientId: process.env.AXONFLOW_CLIENT_ID,
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
  endpoint: process.env.AXONFLOW_ENDPOINT || 'http://localhost:8080'
});

const prompt = 'What is the capital of France?';

// Step 1: Pre-check policies
const ctx = await axonflow.getPolicyApprovedContext({
  userToken: 'user-123',
  query: prompt
});

if (!ctx.approved) {
  throw new Error(`Blocked: ${ctx.blockReason}`);
}

// Step 2: Make your own LLM call
const startTime = Date.now();
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
});
const latencyMs = Date.now() - startTime;

// Step 3: Audit the call
await axonflow.auditLLMCall({
  contextId: ctx.contextId,
  responseSummary: response.choices[0].message.content?.substring(0, 100) || '',
  provider: 'openai',
  model: 'gpt-4',
  tokenUsage: {
    promptTokens: response.usage?.prompt_tokens || 0,
    completionTokens: response.usage?.completion_tokens || 0,
    totalTokens: response.usage?.total_tokens || 0
  },
  latencyMs
});

console.log('Response:', response.choices[0].message.content);
```

### Proxy Mode (Simpler Alternative)

For simpler integrations, Proxy Mode handles policy checking and auditing in a single call:

```typescript
import { AxonFlow } from '@axonflow/sdk';

const axonflow = new AxonFlow({
  clientId: process.env.AXONFLOW_CLIENT_ID,
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
  endpoint: 'http://localhost:8080'
});

// Single call - policies checked, query processed, audit logged
const response = await axonflow.executeQuery({
  userToken: 'user-123',
  query: 'What is the capital of France?',
  requestType: 'chat',
  context: {
    provider: 'openai',
    model: 'gpt-4'
  }
});

if (response.success) {
  console.log('Response:', response.data);
}
```

### Self-Hosted Mode (No License Required)

Connect to a self-hosted AxonFlow instance running via docker-compose:

```typescript
import { AxonFlow } from '@axonflow/sdk';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Self-hosted (localhost) - no license key needed!
const axonflow = new AxonFlow({
  endpoint: 'http://localhost:8080'
  // That's it - no authentication required for localhost
});

// Use Gateway Mode for self-hosted
const prompt = 'Test with self-hosted AxonFlow';

const ctx = await axonflow.getPolicyApprovedContext({
  userToken: 'user-123',
  query: prompt
});

if (!ctx.approved) {
  throw new Error(`Blocked: ${ctx.blockReason}`);
}

const startTime = Date.now();
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
});

// Don't forget to audit!
await axonflow.auditLLMCall({
  contextId: ctx.contextId,
  responseSummary: response.choices[0].message.content?.substring(0, 100) || '',
  provider: 'openai',
  model: 'gpt-4',
  tokenUsage: {
    promptTokens: response.usage?.prompt_tokens || 0,
    completionTokens: response.usage?.completion_tokens || 0,
    totalTokens: response.usage?.total_tokens || 0
  },
  latencyMs: Date.now() - startTime
});

console.log(response.choices[0].message.content);
```

**Self-hosted deployment:**
```bash
# Clone and start AxonFlow
git clone https://github.com/getaxonflow/axonflow.git
cd axonflow
export OPENAI_API_KEY=sk-your-key-here
docker-compose up

# SDK connects to http://localhost:8080 - no license needed!
```

**Features:**
- ✅ Full AxonFlow features without license
- ✅ Perfect for local development and testing
- ✅ Same API as production
- ✅ Automatically detects localhost and skips authentication

## Proxy Mode (executeQuery)

Proxy Mode routes all requests through AxonFlow's `/api/request` endpoint, providing a simpler integration pattern with automatic policy enforcement:

### Basic Query Execution

```typescript
import { AxonFlow, PolicyViolationError } from '@axonflow/sdk';

const axonflow = new AxonFlow({
  clientId: process.env.AXONFLOW_CLIENT_ID,
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET
});

// Execute a chat query with policy enforcement
const response = await axonflow.executeQuery({
  userToken: 'user-123',
  query: 'Explain quantum computing in simple terms',
  requestType: 'chat',
  context: {
    provider: 'openai',
    model: 'gpt-4'
  }
});

if (response.success) {
  console.log('Response:', response.data);
  console.log('Policies evaluated:', response.policyInfo?.policiesEvaluated);
}
```

### Handling Policy Violations

```typescript
try {
  await axonflow.executeQuery({
    userToken: 'user-123',
    query: 'Process this SSN: 123-45-6789',
    requestType: 'chat'
  });
} catch (error) {
  if (error instanceof PolicyViolationError) {
    console.log('Request blocked:', error.blockReason);
    console.log('Violating policies:', error.policies);
  }
}
```

### SQL Query Governance

```typescript
// SQL queries get additional injection detection
const sqlResponse = await axonflow.executeQuery({
  userToken: 'analyst-user',
  query: 'SELECT name, email FROM customers WHERE status = active LIMIT 100',
  requestType: 'sql'
});
```

### Health Check

```typescript
// Check if AxonFlow agent is healthy
const health = await axonflow.healthCheck();

if (health.status === 'healthy') {
  console.log('Agent version:', health.version);
  console.log('Uptime:', health.uptime);
} else {
  console.warn('Agent status:', health.status);
}
```

### Request Types

| Request Type | Description |
|--------------|-------------|
| `chat` | General chat/LLM queries |
| `sql` | SQL queries (with injection detection) |
| `mcp-query` | MCP connector queries |
| `multi-agent-plan` | Generate multi-agent plans |
| `execute-plan` | Execute a generated plan |

## Gateway Mode (Direct LLM Calls)

Gateway Mode is for advanced users who want to make direct LLM calls while still getting policy enforcement:

```typescript
// Step 1: Pre-check policies
const ctx = await axonflow.getPolicyApprovedContext({
  userToken: 'user-jwt',
  query: 'Analyze customer data',
  dataSources: ['postgres']
});

if (!ctx.approved) {
  throw new Error(`Blocked: ${ctx.blockReason}`);
}

// Step 2: Make direct LLM call with approved data
const llmResponse = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: JSON.stringify(ctx.approvedData) }]
});

// Step 3: Audit the call
await axonflow.auditLLMCall({
  contextId: ctx.contextId,
  responseSummary: llmResponse.choices[0].message.content.substring(0, 100),
  provider: 'openai',
  model: 'gpt-4',
  tokenUsage: {
    promptTokens: llmResponse.usage.prompt_tokens,
    completionTokens: llmResponse.usage.completion_tokens,
    totalTokens: llmResponse.usage.total_tokens
  },
  latencyMs: 250
});
```

## React Example

```tsx
import { AxonFlow } from '@axonflow/sdk';
import { useState } from 'react';

const axonflow = new AxonFlow({
  clientId: process.env.REACT_APP_AXONFLOW_CLIENT_ID,
  clientSecret: process.env.REACT_APP_AXONFLOW_CLIENT_SECRET,
  endpoint: process.env.REACT_APP_AXONFLOW_ENDPOINT || 'http://localhost:8080'
});

function ChatComponent() {
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (prompt: string) => {
    setError(null);
    try {
      // Use Proxy Mode for simple integrations
      // Note: In production, get userToken from your auth context
      const result = await axonflow.executeQuery({
        userToken: 'user-123', // Replace with actual user token
        query: prompt,
        requestType: 'chat'
      });

      if (result.success) {
        setResponse(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    // Your existing UI - no changes needed
    <div>...</div>
  );
}
```

## Next.js API Route

```typescript
// pages/api/chat.ts
import { AxonFlow, PolicyViolationError } from '@axonflow/sdk';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const axonflow = new AxonFlow({
  clientId: process.env.AXONFLOW_CLIENT_ID,
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
  endpoint: process.env.AXONFLOW_ENDPOINT || 'http://localhost:8080'
});

export default async function handler(req, res) {
  const { prompt, userToken } = req.body;

  try {
    // Step 1: Pre-check policies
    const ctx = await axonflow.getPolicyApprovedContext({
      userToken: userToken || 'anonymous',
      query: prompt
    });

    if (!ctx.approved) {
      return res.status(403).json({ error: ctx.blockReason });
    }

    // Step 2: Make the LLM call
    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });
    const latencyMs = Date.now() - startTime;

    // Step 3: Audit the call
    await axonflow.auditLLMCall({
      contextId: ctx.contextId,
      responseSummary: completion.choices[0].message.content?.substring(0, 100) || '',
      provider: 'openai',
      model: 'gpt-4',
      tokenUsage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
      },
      latencyMs
    });

    res.json({ success: true, response: completion.choices[0].message.content });
  } catch (error) {
    if (error instanceof PolicyViolationError) {
      return res.status(403).json({ error: error.blockReason });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
```

## Configuration Options

```typescript
const axonflow = new AxonFlow({
  // Authentication (OAuth2 client credentials)
  clientId: 'your-client-id',         // Required for cloud/enterprise
  clientSecret: 'your-client-secret', // Required for cloud/enterprise

  // Optional settings
  mode: 'production',                // or 'sandbox' for testing
  endpoint: 'https://staging-eu.getaxonflow.com', // Default public endpoint
  tenant: 'your-tenant-id',         // For multi-tenant setups
  debug: true,                       // Enable debug logging

  // Retry configuration
  retry: {
    enabled: true,
    maxAttempts: 3,
    delay: 1000
  },

  // Cache configuration
  cache: {
    enabled: true,
    ttl: 60000  // 1 minute
  }
});
```

### VPC Private Endpoint (Low-Latency)

For customers running within AWS VPC, use the private endpoint for lowest latency:

```typescript
const axonflow = new AxonFlow({
  clientId: process.env.AXONFLOW_CLIENT_ID,
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
  endpoint: 'https://vpc-private-endpoint.getaxonflow.com:8443',  // VPC private endpoint
  mode: 'production'
});

// VPC deployment provides lowest latency due to intra-VPC routing
```

**Network Latency Characteristics:**
- Public endpoint: Higher latency (internet routing overhead)
- VPC private endpoint: Lower latency (intra-VPC routing)

**Note:** VPC endpoints require AWS VPC peering setup with AxonFlow infrastructure.

## Sandbox Mode (Testing)

```typescript
// Use sandbox mode for testing without affecting production
const axonflow = AxonFlow.sandbox('demo-client', 'demo-secret');

// Test with PII detection (will be blocked)
try {
  const response = await axonflow.executeQuery({
    userToken: 'test-user',
    query: 'My SSN is 123-45-6789',
    requestType: 'chat'
  });
} catch (error) {
  // Expected: PolicyViolationError - PII detected
  console.log('Correctly blocked:', error.message);
}
```

## What Gets Protected?

AxonFlow automatically:
- **Blocks** prompts containing sensitive data (PII, credentials, etc.)
- **Redacts** personal information from responses
- **Enforces** rate limits and usage quotas
- **Prevents** prompt injection attacks
- **Logs** all requests for compliance audit trails
- **Monitors** costs and usage patterns

## Error Handling

```typescript
import { AxonFlow, PolicyViolationError, AuthenticationError, APIError } from '@axonflow/sdk';

try {
  const response = await axonflow.executeQuery({
    userToken: 'user-123',
    query: prompt,
    requestType: 'chat'
  });
} catch (error) {
  if (error instanceof PolicyViolationError) {
    // Request violated a policy
    console.log('Policy violation:', error.blockReason);
    console.log('Policies:', error.policies);
  } else if (error instanceof AuthenticationError) {
    // Authentication failed
    console.error('Auth error:', error.message);
  } else if (error instanceof APIError) {
    // API error (status, statusText, body)
    console.error(`API error ${error.status}:`, error.body);
  } else {
    // Other errors
    console.error('Error:', error);
  }
}
```

## Production Best Practices

1. **Environment Variables**: Never hardcode credentials
   ```typescript
   const axonflow = new AxonFlow({
     clientId: process.env.AXONFLOW_CLIENT_ID,
     clientSecret: process.env.AXONFLOW_CLIENT_SECRET
   });
   ```

2. **Fail Open**: In production, AxonFlow fails open if unreachable
   ```typescript
   // If AxonFlow is down, the original call proceeds
   // This ensures your app stays operational
   ```

3. **Tenant Isolation**: Use tenant IDs for multi-tenant apps
   ```typescript
   const axonflow = new AxonFlow({
     clientId: process.env.AXONFLOW_CLIENT_ID,
     clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
     tenant: getCurrentTenantId()
   });
   ```

## Examples

Complete working examples for all features are available in the [examples folder](https://github.com/getaxonflow/axonflow/tree/main/examples).

### Community Features

```typescript
// PII Detection - Automatically detect sensitive data
const result = await axonflow.getPolicyApprovedContext({
  userToken: 'user-123',
  query: 'My SSN is 123-45-6789'
});
// result.approved = true, result.requiresRedaction = true (SSN detected)

// SQL Injection Detection - Block prohibited queries
const result = await axonflow.getPolicyApprovedContext({
  userToken: 'user-123',
  query: "SELECT * FROM users WHERE role = 'admin'"
});
// result.approved = false, result.blockReason = "SQL query policy violation"

// Static Policies - List and manage built-in policies
const policies = await axonflow.listPolicies();
// Returns: [{name: "pii-detection", enabled: true}, ...]

// Dynamic Policies - Create runtime policies
await axonflow.createDynamicPolicy({
  name: 'block-competitor-queries',
  conditions: { contains: ['competitor', 'pricing'] },
  action: 'block'
});

// MCP Connectors - Query external data sources
const resp = await axonflow.queryConnector('postgres-db', 'SELECT name FROM customers', {});
// resp.data contains query results

// Multi-Agent Planning - Orchestrate complex workflows
const plan = await axonflow.generatePlan('Research AI regulations', 'legal');
const result = await axonflow.executePlan(plan.planId);

// Audit Logging - Track all LLM interactions
await axonflow.auditLLMCall({
  contextId: ctx.contextId,
  responseSummary: 'AI response summary',
  provider: 'openai',
  model: 'gpt-4',
  tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
  latencyMs: 450
});
```

### Enterprise Features

These features require an AxonFlow Enterprise license:

```typescript
// Code Governance - Automated PR reviews with AI
const prResult = await axonflow.reviewPullRequest({
  repoOwner: 'your-org',
  repoName: 'your-repo',
  prNumber: 123,
  checkTypes: ['security', 'style', 'performance']
});

// Cost Controls - Budget management for LLM usage
const budget = await axonflow.getBudget('team-engineering');
// Returns: { limit: 1000.00, used: 234.56, remaining: 765.44 }

// MCP Policy Enforcement - Automatic PII redaction in connector responses
const resp = await axonflow.queryConnector('postgres', 'SELECT * FROM customers', {});
// resp.policyInfo.redacted = true
// resp.policyInfo.redactedFields = ['ssn', 'credit_card']
```

For enterprise features, contact [sales@getaxonflow.com](mailto:sales@getaxonflow.com).

## Support

- **Documentation**: https://docs.getaxonflow.com
- **Issues**: https://github.com/getaxonflow/axonflow-sdk-typescript/issues
- **Email**: hello@getaxonflow.com

If you are evaluating AxonFlow in a company setting and cannot open a public issue, you can share feedback or blockers confidentially here:
[Anonymous evaluation feedback form](https://getaxonflow.com/feedback)

No email required. Optional contact if you want a response.

## MCP Connector Marketplace

Integrate with external data sources using AxonFlow's MCP (Model Context Protocol) connectors:

### List Available Connectors

```typescript
const connectors = await axonflow.listConnectors();

connectors.forEach(conn => {
  console.log(`Connector: ${conn.name} (${conn.type})`);
  console.log(`  Description: ${conn.description}`);
  console.log(`  Installed: ${conn.installed}`);
  console.log(`  Capabilities: ${conn.capabilities.join(', ')}`);
});
```

### Install a Connector

```typescript
await axonflow.installConnector({
  connector_id: 'amadeus-travel',
  name: 'amadeus-prod',
  tenant_id: 'your-tenant-id',
  options: {
    environment: 'production'
  },
  credentials: {
    api_key: process.env.AMADEUS_API_KEY,
    api_secret: process.env.AMADEUS_API_SECRET
  }
});

console.log('Connector installed successfully!');
```

### Query a Connector

```typescript
// Query the Amadeus connector for flight information
const resp = await axonflow.queryConnector(
  'amadeus-prod',
  'Find flights from Paris to Amsterdam on Dec 15',
  {
    origin: 'CDG',
    destination: 'AMS',
    date: '2025-12-15'
  }
);

if (resp.success) {
  console.log('Flight data:', resp.data);
} else {
  console.error('Query failed:', resp.error);
}
```

### Production Connectors (November 2025)

AxonFlow now supports **7 production-ready connectors**:

#### Salesforce CRM Connector

Query Salesforce data using SOQL:

```typescript
// Query Salesforce contacts
const contacts = await axonflow.queryConnector(
  'salesforce-crm',
  'Find all contacts for account Acme Corp',
  {
    soql: "SELECT Id, Name, Email, Phone FROM Contact WHERE AccountId = '001xx000003DHP0'"
  }
);

console.log(`Found ${contacts.data.length} contacts`);
```

**Authentication:** OAuth 2.0 password grant (configured in AxonFlow dashboard)

#### Snowflake Data Warehouse Connector

Execute analytics queries on Snowflake:

```typescript
// Query Snowflake for sales analytics
const analytics = await axonflow.queryConnector(
  'snowflake-warehouse',
  'Get monthly revenue for last 12 months',
  {
    sql: `SELECT DATE_TRUNC('month', order_date) as month,
          COUNT(*) as orders,
          SUM(amount) as revenue
          FROM orders
          WHERE order_date >= DATEADD(month, -12, CURRENT_DATE())
          GROUP BY month
          ORDER BY month`
  }
);

console.log('Revenue data:', analytics.data);
```

**Authentication:** Key-pair JWT authentication (configured in AxonFlow dashboard)

#### Slack Connector

Send notifications and alerts to Slack channels:

```typescript
// Send Slack notification
const result = await axonflow.queryConnector(
  'slack-workspace',
  'Send deployment notification to #engineering channel',
  {
    channel: '#engineering',
    text: '🚀 Deployment complete! All systems operational.',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Deployment Status*\n✅ All systems operational'
        }
      }
    ]
  }
);

console.log('Message sent:', result.success);
```

**Authentication:** OAuth 2.0 bot token (configured in AxonFlow dashboard)

#### Available Connectors

| Connector | Type | Use Case |
|-----------|------|----------|
| PostgreSQL | Database | Relational data access |
| Redis | Cache | Distributed rate limiting |
| Slack | Communication | Team notifications |
| Salesforce | CRM | Customer data, SOQL queries |
| Snowflake | Data Warehouse | Analytics, reporting |
| Amadeus GDS | Travel | Flight/hotel booking |
| Cassandra | NoSQL | Distributed database |

For complete connector documentation, see [https://docs.getaxonflow.com/docs/mcp/overview](https://docs.getaxonflow.com/docs/mcp/overview)

## MCP Policy Features (v3.3.0)

### Exfiltration Detection

Prevent large-scale data extraction with automatic row and byte limits:

```typescript
// Query with exfiltration limits (default: 10K rows, 10MB)
const response = await axonflow.queryConnector('postgres', 'SELECT * FROM customers', {});

// Check exfiltration info
if (response.policyInfo?.exfiltrationCheck?.exceeded) {
  console.log('Data limit exceeded:', response.policyInfo.exfiltrationCheck.limitType);
  // limitType: 'rows' | 'bytes'
}

// Configure limits via environment:
// MCP_MAX_ROWS_PER_QUERY=1000
// MCP_MAX_BYTES_PER_QUERY=5242880
```

### Dynamic Policy Evaluation

Enable Orchestrator-based policy evaluation for rate limiting, budget controls, and more:

```typescript
// Response includes dynamic policy info when enabled
const response = await axonflow.queryConnector('postgres', 'SELECT id FROM users', {});

// Check dynamic policy evaluation results
const dynamicInfo = response.policyInfo?.dynamicPolicyInfo;
if (dynamicInfo?.orchestratorReachable) {
  console.log('Policies evaluated:', dynamicInfo.policiesEvaluated);
  dynamicInfo.matchedPolicies?.forEach(policy => {
    console.log(`  ${policy.policyName}: ${policy.action}`);
  });
}

// Enable via environment:
// MCP_DYNAMIC_POLICIES_ENABLED=true
```

## Multi-Agent Planning (MAP)

Generate and execute complex multi-step plans using AI agent orchestration:

### Generate a Plan

```typescript
// Generate a travel planning workflow
const plan = await axonflow.generatePlan(
  'Plan a 3-day trip to Paris with moderate budget',
  'travel'  // Domain hint (optional)
);

console.log(`Generated plan ${plan.planId} with ${plan.steps.length} steps`);
console.log(`Complexity: ${plan.complexity}, Parallel: ${plan.parallel}`);

plan.steps.forEach((step, i) => {
  console.log(`  Step ${i + 1}: ${step.name} (${step.type})`);
  console.log(`    Description: ${step.description}`);
  console.log(`    Agent: ${step.agent}`);
  if (step.dependsOn.length > 0) {
    console.log(`    Depends on: ${step.dependsOn.join(', ')}`);
  }
});
```

### Execute a Plan

```typescript
// Execute the generated plan
const execResp = await axonflow.executePlan(plan.planId);

console.log(`Plan Status: ${execResp.status}`);
console.log(`Duration: ${execResp.duration}`);

if (execResp.status === 'completed') {
  console.log(`Result:\n${execResp.result}`);

  // Access individual step results
  Object.entries(execResp.stepResults || {}).forEach(([stepId, result]) => {
    console.log(`  ${stepId}:`, result);
  });
} else if (execResp.status === 'failed') {
  console.error(`Error: ${execResp.error}`);
}
```

### Check Plan Status

```typescript
// For long-running plans, check status periodically
const status = await axonflow.getPlanStatus(plan.planId);

console.log(`Plan Status: ${status.status}`);
if (status.status === 'running') {
  console.log('Plan is still executing...');
}
```

### Complete Example: Trip Planning with MAP

```typescript
import { AxonFlow } from '@axonflow/sdk';

async function planTrip() {
  // Initialize client with OAuth2 credentials
  const axonflow = new AxonFlow({
    clientId: process.env.AXONFLOW_CLIENT_ID,
    clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
    debug: true
  });

  // 1. Generate multi-agent plan
  const plan = await axonflow.generatePlan(
    'Plan a 3-day trip to Paris for 2 people with moderate budget',
    'travel'
  );

  console.log(`✅ Generated plan with ${plan.steps.length} steps (parallel: ${plan.parallel})`);

  // 2. Execute the plan
  console.log('\n🚀 Executing plan...');
  const execResp = await axonflow.executePlan(plan.planId);

  // 3. Display results
  if (execResp.status === 'completed') {
    console.log(`\n✅ Plan completed in ${execResp.duration}`);
    console.log(`\n📋 Complete Itinerary:\n${execResp.result}`);
  } else {
    console.error(`\n❌ Plan failed: ${execResp.error}`);
  }
}

planTrip().catch(console.error);
```

## Migration Guide

### Migrating to OAuth2 Client Credentials

If you're using older authentication methods (`apiKey` or `licenseKey`), migrate to OAuth2 client credentials:

**Before (v2.x):**
```typescript
const axonflow = new AxonFlow({
  apiKey: process.env.AXONFLOW_API_KEY
});
// or
const axonflow = new AxonFlow({
  licenseKey: process.env.AXONFLOW_LICENSE_KEY
});
```

**After (v3.x):**
```typescript
const axonflow = new AxonFlow({
  clientId: process.env.AXONFLOW_CLIENT_ID,
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET
});
```

**How to get credentials:**
1. Contact AxonFlow support at [hello@getaxonflow.com](mailto:hello@getaxonflow.com)
2. Credentials are provided as part of your AxonFlow subscription
3. Store credentials securely in environment variables or secrets management systems

**Self-hosted users:** No credentials required for localhost endpoints.

## Telemetry

This SDK sends anonymous usage telemetry (SDK version, OS, enabled features) to help improve AxonFlow.
No prompts, payloads, or PII are ever collected. Opt out: `AXONFLOW_TELEMETRY=off`.

### Scope of `AXONFLOW_TELEMETRY=off`

`AXONFLOW_TELEMETRY=off` disables the anonymous SDK heartbeat (version, OS, architecture). On **self-hosted** and **in-VPC** deployments, that heartbeat is the only data the SDK sends to AxonFlow, so setting `=off` means we receive nothing. On **Community SaaS** (`try.getaxonflow.com`) the hosted service also processes operational data — registrations, audit logs, policy enforcement records, workflow state, plan data, and request-header metadata aggregated for usage analytics — as part of running the platform; that operational data flow is governed by the [Privacy Policy](https://getaxonflow.com/privacy/), not by `AXONFLOW_TELEMETRY`.

`DO_NOT_TRACK` is **not** honored as an opt-out for AxonFlow telemetry. It is commonly inherited from host tools and developer environments, which makes it an unreliable expression of user intent.

See [Telemetry Documentation](https://docs.getaxonflow.com/docs/telemetry) for full details.

## License

MIT
