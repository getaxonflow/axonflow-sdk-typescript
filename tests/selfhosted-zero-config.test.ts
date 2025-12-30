/**
 * Self-Hosted Zero-Config Mode Tests
 *
 * Tests for the zero-configuration self-hosted mode where users can run
 * AxonFlow without any API keys, license keys, or credentials.
 *
 * This tests the scenario where a first-time user:
 * 1. Starts the agent with SELF_HOSTED_MODE=true and SELF_HOSTED_MODE_ACKNOWLEDGED=I_UNDERSTAND_NO_AUTH
 * 2. Connects the SDK with no credentials
 * 3. Makes requests that should succeed without authentication
 *
 * Run with:
 *   AXONFLOW_AGENT_URL=http://localhost:8080 npm run test:e2e
 */

import { AxonFlow } from '../src/client';

// Self-hosted configuration (no API key, no license key)
function getSelfHostedConfig() {
  const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
  const isLocalhost = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

  return {
    endpoint,
    tenant: 'default',
    debug: true,
    timeout: 30000,
    isLocalhost,
  };
}

const config = getSelfHostedConfig();
// Only run these tests if explicitly enabled - they require a running agent
const shouldRun = process.env.RUN_E2E_TESTS === '1';
const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('Self-Hosted Zero-Config Mode Tests', () => {
  // ============================================================
  // 1. CLIENT INITIALIZATION WITHOUT CREDENTIALS
  // ============================================================
  describe('1. Client Initialization Without Credentials', () => {
    test('should create client with no API key or license key for localhost', () => {
      // This should NOT throw an error for localhost endpoints
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        tenant: 'default',
        debug: true,
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
      console.log('✅ Client created without credentials for localhost');
    });

    test('should create client with empty string credentials for localhost', () => {
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        apiKey: '',
        licenseKey: '',
        tenant: 'default',
        debug: true,
      });

      expect(client).toBeDefined();
      console.log('✅ Client created with empty string credentials');
    });

    test('should create client with undefined credentials for localhost', () => {
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        apiKey: undefined,
        licenseKey: undefined,
        tenant: 'default',
      });

      expect(client).toBeDefined();
      console.log('✅ Client created with undefined credentials');
    });

    test('should allow client creation without credentials for any endpoint (community mode)', () => {
      // Community mode works without credentials for any endpoint
      expect(() => {
        new AxonFlow({
          endpoint: 'https://staging-eu.getaxonflow.com',
          // No credentials provided - community mode
          tenant: 'default',
        });
      }).not.toThrow();
      console.log('✅ Community mode works without credentials for any endpoint');
    });
  });

  // ============================================================
  // 2. GATEWAY MODE WITHOUT AUTHENTICATION
  // ============================================================
  describe('2. Gateway Mode Without Authentication', () => {
    let client: AxonFlow;

    beforeAll(() => {
      client = new AxonFlow({
        endpoint: config.endpoint,
        tenant: 'default',
        debug: true,
        timeout: 30000,
      });
    });

    test('should perform pre-check without credentials', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: '', // Empty user token - zero-config scenario
        query: 'What is the weather in Paris?',
      });

      // Should get a valid context ID back
      expect(result.contextId).toBeTruthy();
      expect(typeof result.contextId).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);

      console.log(`✅ Pre-check succeeded without credentials`);
      console.log(`   Context ID: ${result.contextId}`);
      console.log(`   Approved: ${result.approved}`);
    }, 30000);

    test('should perform pre-check with whitespace-only token', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: '   ', // Whitespace-only token
        query: 'Simple test query',
      });

      expect(result.contextId).toBeTruthy();
      console.log('✅ Pre-check succeeded with whitespace token');
    }, 30000);

    test('should complete full Gateway Mode flow without credentials', async () => {
      // Step 1: Pre-check
      const preCheck = await client.getPolicyApprovedContext({
        userToken: '',
        query: 'Analyze quarterly sales data',
      });

      expect(preCheck.contextId).toBeTruthy();

      // Step 2: Audit (simulating direct LLM call)
      const audit = await client.auditLLMCall({
        contextId: preCheck.contextId,
        responseSummary: 'Generated sales analysis report',
        provider: 'openai',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 75,
          totalTokens: 175,
        },
        latencyMs: 350,
      });

      expect(audit.success).toBe(true);
      expect(audit.auditId).toBeTruthy();

      console.log('✅ Full Gateway Mode flow completed without credentials');
      console.log(`   Audit ID: ${audit.auditId}`);
    }, 30000);
  });

  // ============================================================
  // 3. PROXY MODE WITHOUT AUTHENTICATION
  // ============================================================
  describe('3. Proxy Mode Without Authentication', () => {
    let client: AxonFlow;

    beforeAll(() => {
      client = new AxonFlow({
        endpoint: config.endpoint,
        tenant: 'default',
        debug: true,
        timeout: 30000,
      });
    });

    test('should execute query without credentials', async () => {
      const response = await client.executeQuery({
        userToken: '', // Empty token
        query: 'What is 2 + 2?',
        requestType: 'chat',
      });

      // Should either succeed or be blocked by policy (but not auth error)
      expect(response).toBeDefined();

      if (response.blocked) {
        console.log(`⚠️ Query blocked by policy (not auth): ${response.blockReason}`);
      } else {
        expect(response.success).toBe(true);
        console.log('✅ Query executed without credentials');
      }
    }, 30000);

    test('should execute query with empty string token', async () => {
      const response = await client.executeQuery({
        userToken: '',
        query: 'Simple math: 5 * 5',
        requestType: 'chat',
      });

      expect(response).toBeDefined();
      console.log('✅ Query with empty token executed');
    }, 30000);
  });

  // ============================================================
  // 4. POLICY ENFORCEMENT STILL WORKS
  // ============================================================
  describe('4. Policy Enforcement Still Works Without Auth', () => {
    let client: AxonFlow;

    beforeAll(() => {
      client = new AxonFlow({
        endpoint: config.endpoint,
        tenant: 'default',
        debug: true,
        timeout: 30000,
      });
    });

    test('should still block SQL injection without credentials', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: '',
        query: 'SELECT * FROM users WHERE id=1; DROP TABLE users;--',
      });

      // SQL injection should be blocked even without auth
      expect(result.approved).toBe(false);
      expect(result.blockReason).toBeTruthy();

      console.log('✅ SQL injection blocked without credentials');
      console.log(`   Block reason: ${result.blockReason}`);
    }, 30000);

    test('should still block PII without credentials', async () => {
      const result = await client.getPolicyApprovedContext({
        userToken: '',
        query: 'My social security number is 123-45-6789',
      });

      // PII should be blocked even without auth
      expect(result.approved).toBe(false);

      console.log('✅ PII blocked without credentials');
    }, 30000);
  });

  // ============================================================
  // 5. HEALTH CHECK WITHOUT AUTH
  // ============================================================
  describe('5. Health Check Without Authentication', () => {
    test('should check health without any credentials', async () => {
      const client = new AxonFlow({
        endpoint: config.endpoint,
        tenant: 'default',
        debug: true,
      });

      const health = await client.healthCheck();

      expect(health.status).toBeTruthy();
      // Health check should work without auth
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);

      console.log(`✅ Health check succeeded: ${health.status}`);
      if (health.version) {
        console.log(`   Version: ${health.version}`);
      }
    }, 30000);
  });

  // ============================================================
  // 6. FIRST-TIME USER EXPERIENCE
  // ============================================================
  describe('6. First-Time User Experience (Zero-Config)', () => {
    test('should support brand new user with no configuration', async () => {
      // Simulate a first-time user who just started the agent
      // and is connecting the SDK with minimal configuration
      const client = new AxonFlow({
        endpoint: config.endpoint,
        // No apiKey, no licenseKey, default tenant
      });

      // Health check should work
      const health = await client.healthCheck();
      expect(health).toBeDefined();

      // Pre-check should work with empty token
      const preCheck = await client.getPolicyApprovedContext({
        userToken: '',
        query: 'Hello, this is my first query!',
      });

      expect(preCheck.contextId).toBeTruthy();

      console.log('✅ First-time user experience validated');
      console.log('   - Client creation: OK');
      console.log('   - Health check: OK');
      console.log('   - Pre-check: OK');
    }, 30000);
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  afterAll(() => {
    console.log('\n========================================');
    console.log('Self-Hosted Zero-Config Tests Complete');
    console.log('========================================');
    console.log(`Endpoint: ${config.endpoint}`);
    console.log('Mode: Self-Hosted (Zero-Config)');
    console.log('========================================\n');
  });
});

// ============================================================
// 7. AUTH HEADERS BASED ON CREDENTIALS (Unit Tests - Always Run)
// ============================================================
describe('7. Auth Headers Based on Credentials', () => {
  test('should include auth headers when credentials are provided', async () => {
    // Create a client with credentials configured
    const client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      licenseKey: 'test-license-key',
      apiKey: 'test-api-key',
      tenant: 'default',
      debug: true,
    });

    // Track what headers are sent
    const originalFetch = global.fetch;
    let capturedHeaders: Record<string, string> = {};

    global.fetch = jest.fn().mockImplementation((url: string, options: RequestInit) => {
      // Capture headers from the request
      if (options.headers) {
        const headers = options.headers as Record<string, string>;
        capturedHeaders = { ...headers };
      }

      // Return a mock successful response
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { answer: 'test' },
            blocked: false,
          }),
      } as Response);
    });

    try {
      await client.executeQuery({
        userToken: '',
        query: 'Test query for header verification',
        requestType: 'chat',
      });

      // Auth headers SHOULD be present when credentials are provided
      expect(capturedHeaders['X-License-Key']).toBe('test-license-key');

      // Content-Type should still be present
      expect(capturedHeaders['Content-Type']).toBe('application/json');

      console.log('✅ Auth headers correctly sent when credentials are provided');
      console.log(`   Headers sent: ${Object.keys(capturedHeaders).join(', ')}`);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('should not include auth headers when no credentials are provided', async () => {
    const client = new AxonFlow({
      endpoint: 'http://127.0.0.1:8080',
      // No credentials - community mode
      tenant: 'default',
    });

    const originalFetch = global.fetch;
    let capturedHeaders: Record<string, string> = {};

    global.fetch = jest.fn().mockImplementation((url: string, options: RequestInit) => {
      if (options.headers) {
        capturedHeaders = { ...(options.headers as Record<string, string>) };
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { answer: 'test' },
            blocked: false,
          }),
      } as Response);
    });

    try {
      await client.executeQuery({
        userToken: '',
        query: 'Test query',
        requestType: 'chat',
      });

      // Verify auth headers are NOT present when no credentials configured
      expect(capturedHeaders['X-License-Key']).toBeUndefined();
      expect(capturedHeaders['X-Client-Secret']).toBeUndefined();

      console.log('✅ Auth headers correctly NOT sent in community mode (no credentials)');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('should allow client creation without credentials for any endpoint', () => {
    // Community mode works without credentials for any endpoint
    expect(() => {
      new AxonFlow({
        endpoint: 'https://api.getaxonflow.com',
        // No credentials - community mode
        tenant: 'default',
      });
    }).not.toThrow();

    console.log('✅ Community mode works without credentials for any endpoint');
  });
});
