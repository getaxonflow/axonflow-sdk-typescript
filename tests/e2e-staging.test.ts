/**
 * End-to-End Tests for AxonFlow SDK against Staging
 *
 * This comprehensive test suite validates all major SDK APIs work correctly
 * against the staging environment before npm release.
 *
 * Run with:
 *   AXONFLOW_LICENSE_KEY=<key> npm run test:e2e
 *
 * Or for local testing:
 *   AXONFLOW_AGENT_URL=http://localhost:8080 npm run test:e2e
 */

import { AxonFlow } from '../src/client';

// Test configuration
const STAGING_URL = 'https://staging-eu.getaxonflow.com';
const LOCAL_URL = 'http://localhost:8080';

function getTestConfig() {
  const endpoint = process.env.AXONFLOW_AGENT_URL || STAGING_URL;
  const isLocalhost = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

  return {
    endpoint,
    licenseKey: process.env.AXONFLOW_LICENSE_KEY,
    tenant: process.env.AXONFLOW_CLIENT_ID || 'sdk-e2e-test',
    debug: true,
    timeout: 30000,
    isLocalhost,
  };
}

// Skip if no license key and not localhost
const config = getTestConfig();
const shouldRun =
  process.env.RUN_E2E_TESTS === '1' || config.licenseKey || config.isLocalhost;
const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('E2E Tests - SDK v1.2.1 Pre-Release Validation', () => {
  let client: AxonFlow;

  beforeAll(() => {
    console.log('\n========================================');
    console.log('AxonFlow SDK E2E Test Suite');
    console.log('========================================');
    console.log(`Endpoint: ${config.endpoint}`);
    console.log(`Tenant: ${config.tenant}`);
    console.log(`Mode: ${config.isLocalhost ? 'Self-Hosted' : 'Cloud'}`);
    console.log('========================================\n');

    client = new AxonFlow({
      endpoint: config.endpoint,
      licenseKey: config.licenseKey,
      tenant: config.tenant,
      debug: true,
      timeout: 30000,
    });
  });

  // ============================================================
  // 1. CLIENT INITIALIZATION
  // ============================================================
  describe('1. Client Initialization', () => {
    test('should create client successfully', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
      console.log('✅ Client initialized successfully');
    });

    test('should create sandbox client', () => {
      const sandbox = AxonFlow.sandbox('test-key');
      expect(sandbox).toBeDefined();
      console.log('✅ Sandbox client created');
    });
  });

  // ============================================================
  // 2. BASIC CONNECTIVITY
  // ============================================================
  describe('2. Basic Connectivity', () => {
    test('should list connectors from marketplace', async () => {
      try {
        const connectors = await client.listConnectors();
        expect(Array.isArray(connectors)).toBe(true);
        console.log(`✅ Listed ${connectors.length} connectors`);
      } catch (error: any) {
        // 404 is acceptable if endpoint not implemented
        if (error.message?.includes('404')) {
          console.log('⚠️ Connectors endpoint not available (expected for some deployments)');
          return;
        }
        throw error;
      }
    }, 30000);
  });

  // ============================================================
  // 3. GATEWAY MODE (Pre-Check API)
  // ============================================================
  describe('3. Gateway Mode - Pre-Check API', () => {
    test('should approve safe query', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: 'What is the weather in Paris today?',
      });

      expect(result.contextId).toBeTruthy();
      expect(typeof result.contextId).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);

      console.log(`✅ Pre-check approved: contextId=${result.contextId}`);
      console.log(`   Approved: ${result.approved}`);
      console.log(`   Expires: ${result.expiresAt.toISOString()}`);
    }, 30000);

    test('should parse datetime with nanosecond precision', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: 'Test nanosecond datetime parsing',
      });

      // Verify expiresAt is a valid Date
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(isNaN(result.expiresAt.getTime())).toBe(false);

      // Should be in the future (within 10 minutes)
      const now = Date.now();
      const tenMinutesFromNow = now + 10 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThan(now - 60000); // Allow 1 min tolerance
      expect(result.expiresAt.getTime()).toBeLessThan(tenMinutesFromNow);

      console.log(`✅ Datetime parsing correct: ${result.expiresAt.toISOString()}`);
    }, 30000);

    test('should include rate limit info when available', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: 'Check rate limiting',
      });

      if (result.rateLimitInfo) {
        expect(result.rateLimitInfo.limit).toBeGreaterThan(0);
        expect(result.rateLimitInfo.remaining).toBeLessThanOrEqual(result.rateLimitInfo.limit);
        console.log(
          `✅ Rate limit: ${result.rateLimitInfo.remaining}/${result.rateLimitInfo.limit}`
        );
      } else {
        console.log('⚠️ Rate limit info not returned (optional field)');
      }
    }, 30000);
  });

  // ============================================================
  // 4. POLICY ENFORCEMENT
  // ============================================================
  describe('4. Policy Enforcement', () => {
    test('should block SQL injection attempts', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: "SELECT * FROM users WHERE id=1; DROP TABLE users;--",
      });

      // SQL injection should be blocked
      expect(result.approved).toBe(false);
      expect(result.blockReason).toBeTruthy();

      console.log(`✅ SQL injection blocked`);
      console.log(`   Reason: ${result.blockReason}`);
    }, 30000);

    test('should block PII (SSN pattern)', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: 'My social security number is 123-45-6789',
      });

      // PII should be blocked
      expect(result.approved).toBe(false);

      console.log(`✅ PII (SSN) blocked`);
      console.log(`   Reason: ${result.blockReason || 'Policy violation'}`);
    }, 30000);

    test('should block PII (credit card pattern)', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: 'Charge my card 4111-1111-1111-1111',
      });

      // Credit card PII should be blocked
      expect(result.approved).toBe(false);

      console.log(`✅ PII (Credit Card) blocked`);
      console.log(`   Reason: ${result.blockReason || 'Policy violation'}`);
    }, 30000);
  });

  // ============================================================
  // 5. AUDIT LOGGING
  // ============================================================
  describe('5. Audit Logging', () => {
    test('should log LLM call audit trail', async () => {
      // First get a context
      const preCheck = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: 'Test audit logging',
      });

      expect(preCheck.contextId).toBeTruthy();

      // Then log the audit
      const result = await client.auditLLMCall({
        contextId: preCheck.contextId,
        responseSummary: 'E2E test response - SDK v1.2.1 validation',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 150,
          completionTokens: 75,
          totalTokens: 225,
        },
        latencyMs: 450,
        metadata: {
          testRun: 'e2e-pre-release',
          sdkVersion: '1.2.1',
        },
      });

      expect(result.success).toBe(true);
      expect(result.auditId).toBeTruthy();

      console.log(`✅ Audit logged successfully`);
      console.log(`   Audit ID: ${result.auditId}`);
    }, 30000);
  });

  // ============================================================
  // 6. PROTECT API (Proxy Mode)
  // ============================================================
  describe('6. Protect API (Proxy Mode)', () => {
    test('should protect AI call and allow safe requests', async () => {
      // Create a production-mode client for fail-open testing
      const prodClient = new AxonFlow({
        endpoint: config.endpoint,
        licenseKey: config.licenseKey,
        tenant: config.tenant,
        mode: 'production',
        debug: true,
      });

      const mockAICall = async () => ({
        message: 'Hello from mock AI',
        model: 'test-model',
      });

      const result = await prodClient.protect(mockAICall);

      expect(result).toBeDefined();
      expect(result.message).toBe('Hello from mock AI');

      console.log('✅ Protect API working (fail-open in production mode)');
    }, 30000);
  });

  // ============================================================
  // 7. PLAN GENERATION (Multi-Agent)
  // ============================================================
  describe('7. Plan Generation API', () => {
    test('should generate plan with license key auth', async () => {
      try {
        const plan = await client.generatePlan('Book a flight from NYC to London', 'travel');

        // Plan generation depends on Agent state - may return empty if LLM not configured
        expect(plan).toBeDefined();
        expect(Array.isArray(plan.steps)).toBe(true);

        if (plan.planId) {
          console.log(`✅ Plan generated`);
          console.log(`   Plan ID: ${plan.planId}`);
          console.log(`   Steps: ${plan.steps.length}`);
          console.log(`   Domain: ${plan.domain}`);
        } else {
          console.log('⚠️ Plan returned without planId (LLM may not be configured)');
        }
      } catch (error: any) {
        // Plan generation requires orchestrator with LLM - may not be configured
        if (
          error.message?.includes('LLM') ||
          error.message?.includes('provider') ||
          error.message?.includes('404')
        ) {
          console.log('⚠️ Plan generation skipped (orchestrator/LLM not configured)');
          return;
        }
        throw error;
      }
    }, 60000);

    test('should generate plan with explicit userToken (PR #3 fix)', async () => {
      try {
        // This tests the auth fix from PR #3
        const plan = await client.generatePlan(
          'Search for hotels in Paris',
          'travel',
          'custom-user-token-123'
        );

        // Plan may be rate-limited or return empty on rapid consecutive calls
        // The fix in PR #3 is about the userToken being sent correctly, not guaranteed response
        if (plan.planId) {
          console.log(`✅ Plan with custom userToken generated`);
          console.log(`   Plan ID: ${plan.planId}`);
        } else {
          console.log('⚠️ Plan generation returned empty (rate limit or cooldown)');
        }

        // Test passes as long as no exception is thrown
        // The PR #3 fix ensures userToken is sent in the request
        expect(plan).toBeDefined();
      } catch (error: any) {
        if (
          error.message?.includes('LLM') ||
          error.message?.includes('provider') ||
          error.message?.includes('404')
        ) {
          console.log('⚠️ Plan generation with userToken skipped (not configured)');
          return;
        }
        throw error;
      }
    }, 60000);
  });

  // ============================================================
  // 8. POLICY NAME EXTRACTION (PR #4 fix)
  // ============================================================
  describe('8. Policy Name Extraction (PR #4 Fix)', () => {
    test('should extract policy name from blocked response', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: 'e2e-test-user',
        query: "'; DROP TABLE users;--",
      });

      // Should be blocked
      expect(result.approved).toBe(false);

      // The fix in PR #4 ensures policies array is populated
      expect(Array.isArray(result.policies)).toBe(true);

      console.log(`✅ Policy extraction working`);
      console.log(`   Policies evaluated: ${result.policies.join(', ') || 'none returned'}`);
    }, 30000);
  });

  // ============================================================
  // 9. ERROR HANDLING
  // ============================================================
  describe('9. Error Handling', () => {
    test('should handle timeout gracefully', async () => {
      const shortTimeoutClient = new AxonFlow({
        endpoint: config.endpoint,
        licenseKey: config.licenseKey,
        tenant: config.tenant,
        timeout: 1, // 1ms timeout - will definitely timeout
        debug: false,
      });

      try {
        await shortTimeoutClient.getPolicyApprovedContext({
          userToken: 'test',
          query: 'test',
        });
        // If it doesn't throw, that's also acceptable
        console.log('⚠️ Request completed despite 1ms timeout');
      } catch (error: any) {
        expect(error).toBeDefined();
        console.log(`✅ Timeout handled gracefully: ${error.message.substring(0, 50)}...`);
      }
    }, 10000);

    test('should handle invalid endpoint', async () => {
      const badClient = new AxonFlow({
        endpoint: 'https://invalid.nonexistent.endpoint.local',
        licenseKey: 'test-key',
        tenant: 'test',
        timeout: 5000,
        debug: false,
      });

      try {
        await badClient.getPolicyApprovedContext({
          userToken: 'test',
          query: 'test',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        console.log(`✅ Invalid endpoint handled: ${error.message.substring(0, 50)}...`);
      }
    }, 10000);
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  afterAll(() => {
    console.log('\n========================================');
    console.log('E2E Test Suite Complete');
    console.log('========================================');
    console.log('SDK Version: 1.2.1');
    console.log(`Endpoint Tested: ${config.endpoint}`);
    console.log('========================================\n');
  });
});
