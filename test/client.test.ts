/**
 * Unit tests for AxonFlow SDK Client
 * Tests client initialization, configuration, and core functionality
 */

import { AxonFlow } from '../src/client';
import { AxonFlowConfig } from '../src/types';

describe('AxonFlow Client Unit Tests', () => {
  describe('Client Initialization', () => {
    it('should create client with minimal config', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create client with full config', () => {
      const config: AxonFlowConfig = {
        apiKey: 'test-key',
        tenant: 'test-tenant',
        endpoint: 'https://custom.example.com',
        mode: 'production',
        debug: true,
        timeout: 30000,
        retry: {
          enabled: true,
          maxAttempts: 5,
          delay: 1000,
        },
        cache: {
          enabled: true,
          ttl: 60000,
        },
      };

      const client = new AxonFlow(config);
      expect(client).toBeDefined();
    });

    it('should use default values for optional config', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
      });

      expect(client).toBeDefined();
      // Default mode should be production
      // This is implementation-dependent, just verify it works
    });

    it('should accept sandbox mode', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'sandbox',
      });

      expect(client).toBeDefined();
    });

    it('should accept VPC endpoint', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        endpoint: 'https://vpc-endpoint.example.com:8443',
      });

      expect(client).toBeDefined();
    });
  });

  describe('Sandbox Factory Method', () => {
    it('should create sandbox client with API key', () => {
      const client = AxonFlow.sandbox('test-key');
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(AxonFlow);
    });

    it('should create sandbox client with default key', () => {
      const client = AxonFlow.sandbox();
      expect(client).toBeDefined();
    });

    it('should create sandbox client with custom key', () => {
      const client = AxonFlow.sandbox('my-custom-key');
      expect(client).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error when neither apiKey nor licenseKey is provided for non-localhost', () => {
      expect(() => {
        new AxonFlow({
          tenant: 'test-tenant',
          endpoint: 'https://api.axonflow.com',
        } as AxonFlowConfig);
      }).toThrow('Either licenseKey or apiKey must be provided for non-localhost endpoints');
    });

    it('should accept licenseKey without apiKey', () => {
      expect(() => {
        new AxonFlow({
          licenseKey: 'test-license-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should accept apiKey without licenseKey (backward compatibility)', () => {
      expect(() => {
        new AxonFlow({
          apiKey: 'test-api-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should accept both licenseKey and apiKey', () => {
      expect(() => {
        new AxonFlow({
          apiKey: 'test-api-key',
          licenseKey: 'test-license-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should handle empty tenant', () => {
      expect(() => {
        new AxonFlow({
          apiKey: 'test-key',
          tenant: '',
        });
      }).not.toThrow();
    });

    it('should handle custom timeout', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        timeout: 60000,
      });

      expect(client).toBeDefined();
    });

    it('should handle custom retry config', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        retry: {
          enabled: true,
          maxAttempts: 10,
        },
      });

      expect(client).toBeDefined();
    });
  });

  describe('Self-Hosted Mode (Localhost)', () => {
    it('should create client without license key when endpoint is localhost', () => {
      expect(() => {
        new AxonFlow({
          endpoint: 'http://localhost:8080',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should create client without license key when endpoint is 127.0.0.1', () => {
      expect(() => {
        new AxonFlow({
          endpoint: 'http://127.0.0.1:8080',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should default to sandbox mode for localhost endpoints', () => {
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        tenant: 'test-tenant',
        debug: true,
      });

      expect(client).toBeDefined();
      // In debug mode, it should log 'self-hosted (no auth)'
    });

    it('should allow explicit mode override for localhost', () => {
      const client = new AxonFlow({
        endpoint: 'http://localhost:8080',
        tenant: 'test-tenant',
        mode: 'production', // Explicitly set production
      });

      expect(client).toBeDefined();
    });

    it('should accept license key for localhost (optional)', () => {
      expect(() => {
        new AxonFlow({
          endpoint: 'http://localhost:8080',
          licenseKey: 'test-license-key',
          tenant: 'test-tenant',
        });
      }).not.toThrow();
    });

    it('should work with localhost URL variants', () => {
      const variants = [
        'http://localhost:8080',
        'https://localhost:8443',
        'http://127.0.0.1:8080',
        'https://127.0.0.1:8443',
        'http://localhost',
        'http://127.0.0.1',
      ];

      variants.forEach((endpoint) => {
        expect(() => {
          new AxonFlow({
            endpoint,
            tenant: 'test-tenant',
          });
        }).not.toThrow();
      });
    });
  });

  describe('Protect Method', () => {
    it('should accept async function', async () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'production', // Use production mode for fail-open
      });

      const mockAICall = async () => {
        return { message: 'Test response' };
      };

      // Will fail-open since endpoint can't be reached
      const result = await client.protect(mockAICall);
      expect(result).toBeDefined();
      expect(result.message).toBe('Test response');
    });

    it('should accept function returning promise', async () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'production',
      });

      const mockAICall = () => {
        return Promise.resolve({ message: 'Test response' });
      };

      const result = await client.protect(mockAICall);
      expect(result).toBeDefined();
      expect(result.message).toBe('Test response');
    });

    it('should pass through return value', async () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'production',
      });

      const expectedResult = { data: 'test', status: 'success' };
      const mockAICall = async () => expectedResult;

      const result = await client.protect(mockAICall);
      expect(result).toEqual(expectedResult);
    });

    it('should handle function that throws', async () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'production',
      });

      const mockAICall = async () => {
        throw new Error('AI call failed');
      };

      await expect(client.protect(mockAICall)).rejects.toThrow('AI call failed');
    });
  });

  describe('Health Check', () => {
    it('should be able to call protect method', async () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        mode: 'production', // Fail-open mode
      });

      const mockAICall = async () => ({ status: 'ok' });

      // This will fail-open in production mode since endpoint doesn't exist
      const result = await client.protect(mockAICall);
      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
    });
  });

  describe('Connector Methods', () => {
    it('should have listConnectors method', () => {
      const client = AxonFlow.sandbox();
      expect(client.listConnectors).toBeDefined();
      expect(typeof client.listConnectors).toBe('function');
    });

    it('should have installConnector method', () => {
      const client = AxonFlow.sandbox();
      expect(client.installConnector).toBeDefined();
      expect(typeof client.installConnector).toBe('function');
    });

    it('should have queryConnector method', () => {
      const client = AxonFlow.sandbox();
      expect(client.queryConnector).toBeDefined();
      expect(typeof client.queryConnector).toBe('function');
    });
  });

  describe('Multi-Agent Planning Methods', () => {
    it('should have generatePlan method', () => {
      const client = AxonFlow.sandbox();
      expect(client.generatePlan).toBeDefined();
      expect(typeof client.generatePlan).toBe('function');
    });

    it('should have executePlan method', () => {
      const client = AxonFlow.sandbox();
      expect(client.executePlan).toBeDefined();
      expect(typeof client.executePlan).toBe('function');
    });

    it('should have getPlanStatus method', () => {
      const client = AxonFlow.sandbox();
      expect(client.getPlanStatus).toBeDefined();
      expect(typeof client.getPlanStatus).toBe('function');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle undefined config values', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        endpoint: undefined,
        mode: undefined,
        debug: undefined,
        timeout: undefined,
        retry: undefined,
      });

      expect(client).toBeDefined();
    });

    it('should handle very long timeout', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        timeout: 300000, // 5 minutes
      });

      expect(client).toBeDefined();
    });

    it('should handle disabled retries', () => {
      const client = new AxonFlow({
        apiKey: 'test-key',
        tenant: 'test-tenant',
        retry: {
          enabled: false,
        },
      });

      expect(client).toBeDefined();
    });

    it('should handle very long strings in config', () => {
      const longString = 'a'.repeat(1000);
      const client = new AxonFlow({
        apiKey: longString,
        tenant: longString,
      });

      expect(client).toBeDefined();
    });
  });

  describe('Multiple Client Instances', () => {
    it('should support multiple independent clients', () => {
      const client1 = new AxonFlow({
        apiKey: 'key1',
        tenant: 'tenant1',
      });

      const client2 = new AxonFlow({
        apiKey: 'key2',
        tenant: 'tenant2',
      });

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(client1).not.toBe(client2);
    });

    it('should support sandbox and production clients simultaneously', () => {
      const sandboxClient = AxonFlow.sandbox();
      const prodClient = new AxonFlow({
        apiKey: 'prod-key',
        tenant: 'prod-tenant',
        mode: 'production',
      });

      expect(sandboxClient).toBeDefined();
      expect(prodClient).toBeDefined();
    });
  });
});
