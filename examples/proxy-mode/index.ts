/**
 * Proxy Mode Example
 *
 * Demonstrates using AxonFlow's Proxy Mode (proxyLLMCall) for policy enforcement.
 * Proxy Mode routes all requests through AxonFlow, which handles policy checking
 * and optionally routes to LLM providers.
 *
 * Run: npx tsx examples/proxy-mode/index.ts
 */

import { AxonFlow, PolicyViolationError } from '@axonflow/sdk';

async function main() {
  // Initialize client
  const axonflow = new AxonFlow({
    clientId: process.env.AXONFLOW_CLIENT_ID || 'demo-client',
    clientSecret: process.env.AXONFLOW_CLIENT_SECRET || 'demo-secret',
    endpoint: process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080',
    debug: true,
  });

  // Enterprise stacks validate user tokens as JWTs - export AXONFLOW_USER_TOKEN.
  const userToken = process.env.AXONFLOW_USER_TOKEN || 'user-123';

  console.log('='.repeat(60));
  console.log('AxonFlow Proxy Mode Example');
  console.log('='.repeat(60));

  // 1. Health Check
  console.log('\n1. Health Check');
  console.log('-'.repeat(40));
  const health = await axonflow.healthCheck();
  console.log(`   Status: ${health.status}`);
  if (health.version) console.log(`   Version: ${health.version}`);

  // 2. Basic Chat Query
  console.log('\n2. Basic Chat Query');
  console.log('-'.repeat(40));
  try {
    const chatResult = await axonflow.proxyLLMCall({
      userToken,
      query: 'What is the capital of France?',
      requestType: 'chat',
    });
    console.log(`   Success: ${chatResult.success}`);
    console.log(`   Blocked: ${chatResult.blocked}`);
    if (chatResult.policyInfo) {
      console.log(`   Policies Evaluated: ${chatResult.policyInfo.policiesEvaluated.length}`);
    }
    if (!chatResult.success) {
      // proxyLLMCall reports failures in-band (200 + success:false), not
      // only as throws - printing "Success: false" and exiting 0 hides them.
      console.log(`   Failure detail: ${chatResult.error ?? 'unknown error'}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    if (!(error instanceof PolicyViolationError)) {
      process.exitCode = 1;
    }
  }

  // 3. Query with Context
  console.log('\n3. Query with Context (LLM Provider Info)');
  console.log('-'.repeat(40));
  try {
    const contextResult = await axonflow.proxyLLMCall({
      userToken,
      query: 'Explain quantum computing in simple terms',
      requestType: 'chat',
      context: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 500,
      },
    });
    console.log(`   Success: ${contextResult.success}`);
    if (contextResult.metadata) {
      console.log(`   Metadata: ${JSON.stringify(contextResult.metadata)}`);
    }
    if (!contextResult.success) {
      console.log(`   Failure detail: ${contextResult.error ?? 'unknown error'}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    if (!(error instanceof PolicyViolationError)) {
      process.exitCode = 1;
    }
  }

  // 4. PII Detection (should be blocked)
  console.log('\n4. PII Detection Test (should be blocked)');
  console.log('-'.repeat(40));
  try {
    await axonflow.proxyLLMCall({
      userToken,
      query: 'Process this SSN: 123-45-6789 and credit card: 4111-1111-1111-1111',
      requestType: 'chat',
    });
    console.log('   WARNING: PII was not blocked!');
  } catch (error) {
    if (error instanceof PolicyViolationError) {
      console.log(`   Blocked: Yes`);
      console.log(`   Reason: ${error.blockReason}`);
      console.log(`   Policies: ${error.policies?.join(', ') || 'N/A'}`);
    } else {
      console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 5. SQL Injection Detection (should be blocked)
  console.log('\n5. SQL Injection Test (should be blocked)');
  console.log('-'.repeat(40));
  try {
    await axonflow.proxyLLMCall({
      userToken,
      query: "SELECT * FROM users WHERE id = '1'; DROP TABLE users;--",
      requestType: 'sql',
    });
    console.log('   WARNING: SQL injection was not blocked!');
  } catch (error) {
    if (error instanceof PolicyViolationError) {
      console.log(`   Blocked: Yes`);
      console.log(`   Reason: ${error.blockReason}`);
    } else {
      console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 6. Safe SQL Query
  console.log('\n6. Safe SQL Query');
  console.log('-'.repeat(40));
  try {
    const sqlResult = await axonflow.proxyLLMCall({
      userToken,
      query: 'SELECT name, email FROM customers WHERE status = active LIMIT 10',
      requestType: 'sql',
    });
    console.log(`   Success: ${sqlResult.success}`);
    console.log(`   Blocked: ${sqlResult.blocked}`);
    if (!sqlResult.success) {
      console.log(`   Failure detail: ${sqlResult.error ?? 'unknown error'}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    if (!(error instanceof PolicyViolationError)) {
      process.exitCode = 1;
    }
  }

  // 7. MCP Connector Query
  console.log('\n7. MCP Connector Query');
  console.log('-'.repeat(40));
  try {
    const mcpResult = await axonflow.proxyLLMCall({
      userToken,
      // The postgres connector executes the statement as SQL — a
      // natural-language string fails with a syntax error.
      query: 'SELECT tenant_id, name FROM tenants LIMIT 5',
      requestType: 'mcp-query',
      context: {
        connector: 'postgres',
        operation: 'query',
      },
    });
    console.log(`   Success: ${mcpResult.success}`);
    console.log(`   Has Data: ${!!mcpResult.data}`);
    if (!mcpResult.success) {
      // Same in-band failure channel as queryConnector: a failed connector
      // query comes back 200 + success:false, not as a throw.
      console.log(`   Failure detail: ${mcpResult.error ?? 'unknown error'}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    if (!(error instanceof PolicyViolationError)) {
      process.exitCode = 1;
    }
  }

  console.log('\n' + '='.repeat(60));
  if (process.exitCode === 1) {
    console.log('Example completed with failures');
  } else {
    console.log('Example completed!');
  }
  console.log('='.repeat(60));
}

// catch(console.error) alone would swallow the failure and exit 0 - an
// unreachable stack would then read as a green run.
main().catch(error => {
  console.error(error);
  process.exit(1);
});
