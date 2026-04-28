/**
 * Integration tests for AxonFlow TypeScript SDK
 *
 * Run with: RUN_INTEGRATION_TESTS=1 npm test -- tests/integration.test.ts
 *
 * Set environment variables before running:
 *   RUN_INTEGRATION_TESTS=1
 *   AXONFLOW_AGENT_URL=http://localhost:8080
 *   AXONFLOW_CLIENT_ID=demo-client
 *   AXONFLOW_CLIENT_SECRET=demo-secret
 */

import { AxonFlow } from '../src/client';

// Skip these tests unless running with integration flag
const describeIntegration = process.env.RUN_INTEGRATION_TESTS ? describe : describe.skip;

function getTestConfig() {
  return {
    endpoint: process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080',
    clientId: process.env.AXONFLOW_CLIENT_ID || 'demo-client',
    clientSecret: process.env.AXONFLOW_CLIENT_SECRET || 'demo-secret',
    debug: true,
    timeout: 30000,
  };
}

describeIntegration('AxonFlow SDK Integration Tests', () => {
  let client: AxonFlow;

  beforeAll(() => {
    client = new AxonFlow(getTestConfig());
  });

  describe('Basic Connectivity', () => {
    test('should list connectors successfully', async () => {
      const connectors = await client.listConnectors();
      expect(Array.isArray(connectors)).toBe(true);
      console.log(`Found ${connectors.length} connectors`);
    });
  });

  describe('Gateway Mode', () => {
    test('should perform pre-check and return context', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'demo-user',
        query: 'Analyze this data',
      });

      expect(result.contextId).toBeTruthy();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      console.log(`Pre-check: contextId=${result.contextId}, approved=${result.approved}`);
    });

    test('should parse datetime correctly (including nanoseconds)', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'demo-user',
        query: 'Test datetime parsing',
      });

      // ExpiresAt should be approximately 5 minutes from now
      const expectedExpiry = Date.now() + 5 * 60 * 1000;
      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiry);

      // Allow 30 second tolerance
      expect(timeDiff).toBeLessThan(30000);

      console.log(`Datetime parsing OK: expiresAt=${result.expiresAt.toISOString()}`);
    });

    test('should audit LLM call after pre-check', async () => {
      // First get a context
      const preCheck = await client.getPolicyApprovedContext({
        userToken: 'demo-user',
        query: 'Test audit',
      });

      // Then audit an LLM call
      const result = await client.auditLLMCall({
        contextId: preCheck.contextId,
        responseSummary: 'Test response summary',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        latencyMs: 250,
      });

      expect(result.success).toBe(true);
      expect(result.auditId).toBeTruthy();

      console.log(`Audit logged: auditId=${result.auditId}`);
    });
  });

  describe('Policy Enforcement', () => {
    test('should block SQL injection via pre-check', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'demo-user',
        query: 'SELECT * FROM users; DROP TABLE users;--',
      });

      // Should not be approved due to SQL injection
      expect(result.approved).toBe(false);
      console.log(`SQL injection blocked: approved=${result.approved}`);
    });

    test('should block PII via pre-check', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'demo-user',
        query: 'My SSN is 123-45-6789',
      });

      // Should not be approved due to PII detection
      expect(result.approved).toBe(false);
      console.log(`PII blocked: approved=${result.approved}`);
    });
  });

  describe('Proxy Mode', () => {
    test('should perform health check', async () => {
      const health = await client.healthCheck();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      console.log(`Health check: status=${health.status}`);
    });

    test('should execute query successfully', async () => {
      const result = await client.proxyLLMCall({
        userToken: 'demo-user',
        query: 'What is the capital of France?',
        requestType: 'chat',
      });

      expect(result.success).toBe(true);
      expect(result.blocked).toBe(false);
      console.log(`proxyLLMCall: success=${result.success}, blocked=${result.blocked}`);
    });

    test('should execute query with context', async () => {
      const result = await client.proxyLLMCall({
        userToken: 'demo-user',
        query: 'Analyze this data',
        requestType: 'chat',
        context: {
          provider: 'openai',
          model: 'gpt-4',
          customKey: 'customValue',
        },
      });

      expect(result.success).toBe(true);
      console.log(`proxyLLMCall with context: success=${result.success}`);
    });

    test('should block SQL injection via proxyLLMCall', async () => {
      try {
        await client.proxyLLMCall({
          userToken: 'demo-user',
          query: 'SELECT * FROM users; DROP TABLE users;--',
          requestType: 'sql',
        });
        // If we get here without throwing, check if the response indicates blocking
        fail('Expected PolicyViolationError to be thrown');
      } catch (error: any) {
        expect(error.name).toBe('PolicyViolationError');
        expect(error.blockReason).toBeTruthy();
        console.log(`SQL injection blocked: ${error.blockReason}`);
      }
    });

    test('should block PII via proxyLLMCall', async () => {
      try {
        await client.proxyLLMCall({
          userToken: 'demo-user',
          query: 'Process this SSN: 123-45-6789',
          requestType: 'chat',
        });
        fail('Expected PolicyViolationError to be thrown');
      } catch (error: any) {
        expect(error.name).toBe('PolicyViolationError');
        console.log(`PII blocked: ${error.blockReason}`);
      }
    });

    test('should return policy info in proxyLLMCall response', async () => {
      const result = await client.proxyLLMCall({
        userToken: 'demo-user',
        query: 'Simple query without violations',
        requestType: 'chat',
      });

      expect(result.policyInfo).toBeDefined();
      if (result.policyInfo) {
        expect(Array.isArray(result.policyInfo.policiesEvaluated)).toBe(true);
        console.log(
          `Policy info: evaluated=${result.policyInfo.policiesEvaluated.length} policies`
        );
      }
    });

    test('should support different request types', async () => {
      const requestTypes = ['chat', 'sql', 'mcp-query'] as const;

      for (const requestType of requestTypes) {
        const result = await client.proxyLLMCall({
          userToken: 'demo-user',
          query: 'Test query',
          requestType,
        });
        expect(result.success).toBe(true);
        console.log(`Request type ${requestType}: success=${result.success}`);
      }
    });
  });

  describe('Plan Generation', () => {
    test('should generate plan with auth fix (backward compatible)', async () => {
      try {
        // Test backward-compatible call (no userToken parameter)
        const plan = await client.generatePlan('Book a flight from NYC to LA', 'travel');

        expect(plan.planId).toBeTruthy();
        console.log(`Plan generated: planId=${plan.planId}, steps=${plan.steps.length}`);
      } catch (error: any) {
        // Plan generation may fail if orchestrator doesn't have LLM configured
        if (error.message?.includes('LLM') || error.message?.includes('provider')) {
          console.log(`Plan generation skipped (LLM not configured): ${error.message}`);
          return;
        }
        throw error;
      }
    });

    test('should generate plan with explicit userToken', async () => {
      try {
        // Test with explicit userToken parameter
        const plan = await client.generatePlan('Simple query', 'generic', 'custom-user-token');

        expect(plan.planId).toBeTruthy();
        console.log(`Plan with custom token: planId=${plan.planId}`);
      } catch (error: any) {
        if (error.message?.includes('LLM') || error.message?.includes('provider')) {
          console.log(`Plan generation skipped (LLM not configured): ${error.message}`);
          return;
        }
        throw error;
      }
    });

    test('should execute plan with auth fix', async () => {
      try {
        // First generate a plan
        const plan = await client.generatePlan('Simple test query', 'generic');

        // Then execute it (backward compatible - no userToken)
        const result = await client.executePlan(plan.planId);

        expect(result.planId).toBe(plan.planId);
        console.log(`Plan executed: status=${result.status}`);
      } catch (error: any) {
        // Skip if LLM not configured
        if (error.message?.includes('LLM') || error.message?.includes('provider')) {
          console.log(`Plan execution skipped (LLM not configured): ${error.message}`);
          return;
        }
        throw error;
      }
    });
  });
});
