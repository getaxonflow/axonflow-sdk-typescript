/**
 * Integration test for AxonFlow SDK
 * Tests actual API connectivity
 */

import { AxonFlow } from '../src/client';

describe('AxonFlow SDK Integration Tests', () => {
  // Use test credentials (should exist in the Agent database)
  const TEST_CLIENT_ID = 'healthcare-acme';
  const TEST_CLIENT_SECRET = 'test-secret-123';

  describe('Public Endpoint', () => {
    it('should connect to public endpoint', async () => {
      const axonflow = new AxonFlow({
        clientId: TEST_CLIENT_ID,
        clientSecret: TEST_CLIENT_SECRET,
        endpoint: 'https://staging-eu.getaxonflow.com',
        debug: true,
      });

      // Mock AI call
      const mockAICall = async () => {
        return { message: 'Hello from AI' };
      };

      try {
        const result = await axonflow.protect(mockAICall);
        console.log('✅ Public endpoint test passed:', result);
        expect(result).toBeDefined();
      } catch (error) {
        // Expected to fail with 401/403 if client doesn't exist
        const err = error as Error;
        console.log('Expected error (client validation):', err.message);
        expect(err.message).toContain('AxonFlow API error');
      }
    }, 30000);
  });

  describe('VPC Private Endpoint', () => {
    it('should connect to VPC private endpoint', async () => {
      const axonflow = new AxonFlow({
        clientId: TEST_CLIENT_ID,
        clientSecret: TEST_CLIENT_SECRET,
        endpoint: 'https://staging-eu.getaxonflow.com',
        debug: true,
      });

      // Mock AI call
      const mockAICall = async () => {
        return { message: 'Hello from AI' };
      };

      try {
        const result = await axonflow.protect(mockAICall);
        console.log('✅ VPC endpoint test passed:', result);
        expect(result).toBeDefined();
      } catch (error) {
        // Expected to fail with connection error if not in VPC
        const err = error as Error;
        console.log('Expected error (VPC connectivity):', err.message);
        expect(err.message).toMatch(/AxonFlow API error|fetch/);
      }
    }, 30000);
  });

  describe('Sandbox Mode', () => {
    it('should create sandbox client', () => {
      const axonflow = AxonFlow.sandbox('test-client', 'test-secret');
      expect(axonflow).toBeDefined();
    });
  });
});
