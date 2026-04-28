/**
 * Basic AxonFlow SDK Usage Example
 *
 * This example demonstrates the modern Gateway-Mode and Proxy-Mode APIs:
 * - Gateway Mode (lower latency): getPolicyApprovedContext + auditLLMCall.
 *   The caller makes the LLM call themselves; AxonFlow approves before
 *   and audits after.
 * - Proxy Mode (zero-config): proxyLLMCall — AxonFlow handles policy
 *   enforcement and optional LLM routing in a single round-trip.
 *
 * Run: npx tsx examples/basic/index.ts
 */

import { AxonFlow } from '@axonflow/sdk';

async function main() {
  const agentURL = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
  const clientId = process.env.AXONFLOW_CLIENT_ID;
  const clientSecret = process.env.AXONFLOW_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('AXONFLOW_CLIENT_ID and AXONFLOW_CLIENT_SECRET must be set');
    process.exit(1);
  }

  console.log('Initializing AxonFlow client...');
  const client = new AxonFlow({
    clientId,
    clientSecret,
    endpoint: agentURL,
    debug: true,
  });

  // Step 1: Health check ----------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('Step 1: Health Check');
  console.log('='.repeat(60));
  const health = await client.healthCheck();
  console.log(`Status:  ${health.status}`);
  if (health.version) {
    console.log(`Version: ${health.version}`);
  }

  // Step 2: Gateway Mode (pre-check + audit) -------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('Step 2: Gateway Mode (getPolicyApprovedContext + auditLLMCall)');
  console.log('='.repeat(60));
  try {
    const ctx = await client.getPolicyApprovedContext({
      userToken: 'demo-user',
      query: 'What is the capital of France?',
    });
    console.log(`Approved:  ${ctx.approved}`);
    console.log(`ContextId: ${ctx.contextId}`);
    console.log(`Policies:  ${ctx.policies.length} evaluated`);

    if (ctx.approved) {
      // The caller makes the actual LLM call here (mocked for the example).
      const startTime = Date.now();
      const llmResponse = {
        text: 'Paris is the capital of France.',
        tokensIn: 7,
        tokensOut: 8,
      };
      const latencyMs = Date.now() - startTime;

      const audit = await client.auditLLMCall({
        contextId: ctx.contextId,
        responseSummary: llmResponse.text,
        provider: 'mock',
        model: 'mock-model',
        tokenUsage: {
          promptTokens: llmResponse.tokensIn,
          completionTokens: llmResponse.tokensOut,
          totalTokens: llmResponse.tokensIn + llmResponse.tokensOut,
        },
        latencyMs,
      });
      console.log(`Audit:     success=${audit.success} id=${audit.auditId}`);
    }
  } catch (error) {
    console.log(`Gateway Mode error: ${(error as Error).message}`);
  }

  // Step 3: Proxy Mode (single round-trip) ---------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('Step 3: Proxy Mode (proxyLLMCall)');
  console.log('='.repeat(60));
  try {
    const result = await client.proxyLLMCall({
      userToken: 'demo-user',
      query: 'What is the capital of France?',
      requestType: 'chat',
    });
    console.log(`Success:  ${result.success}`);
    console.log(`Blocked:  ${result.blocked}`);
    if (result.policyInfo) {
      console.log(`Policies: ${result.policyInfo.policiesEvaluated.length} evaluated`);
    }
  } catch (error) {
    // Community stacks without an LLM provider configured will return
    // non-success; that's normal here. Specific error subclasses (e.g.
    // PolicyViolationError) signal blocked content rather than a failure.
    console.log(`Proxy Mode error: ${(error as Error).message}`);
  }

  // Step 4: PII detection (Proxy Mode) -------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('Step 4: PII detection (Proxy Mode)');
  console.log('='.repeat(60));
  try {
    const result = await client.proxyLLMCall({
      userToken: 'demo-user',
      query: 'My email is john.doe@example.com and SSN is 123-45-6789',
      requestType: 'chat',
    });
    console.log(`Success:  ${result.success}`);
    console.log(`Blocked:  ${result.blocked}`);
    if (result.blocked && result.blockReason) {
      console.log(`Reason:   ${result.blockReason}`);
    }
  } catch (error) {
    // PolicyViolationError is the expected outcome when PII enforcement
    // is set to block. Community defaults to warn — caller may see
    // success=true with a policy match recorded.
    console.log(`PII step: ${(error as Error).message}`);
  }

  console.log('\nAll examples completed');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
