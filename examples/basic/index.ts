/**
 * Basic AxonFlow SDK Usage Example
 *
 * This example demonstrates:
 * - Simple client initialization
 * - Protecting AI calls with governance
 * - Handling blocked requests
 * - Testing PII detection
 */

import { AxonFlow } from '@axonflow/sdk';

async function main() {
  // Load configuration from environment variables
  const agentURL = process.env.AXONFLOW_AGENT_URL || 'https://staging-eu.getaxonflow.com';
  const apiKey = process.env.AXONFLOW_API_KEY;
  const tenant = process.env.AXONFLOW_TENANT;

  if (!apiKey || !tenant) {
    console.error('❌ AXONFLOW_API_KEY and AXONFLOW_TENANT must be set');
    process.exit(1);
  }

  // Create client with simple initialization
  console.log('Initializing AxonFlow client...');
  const client = new AxonFlow({
    apiKey,
    tenant,
    endpoint: agentURL,
    debug: true,
  });

  // Execute a simple protected AI call
  console.log('\n' + '='.repeat(60));
  console.log('Example 1: Simple Protected AI Call');
  console.log('='.repeat(60));

  try {
    const result = await client.protect(async () => {
      // This would be your actual AI API call
      return {
        response: 'The capital of France is Paris.',
        model: 'gpt-4',
        usage: { tokens: 15 },
      };
    });

    console.log('✓ Query executed successfully');
    console.log('Result:', result);
  } catch (error) {
    const err = error as Error;
    console.error('❌ Query failed:', err.message);
  }

  // Test with sensitive data (should be detected/blocked)
  console.log('\n' + '='.repeat(60));
  console.log('Example 2: PII Detection');
  console.log('='.repeat(60));

  try {
    const result = await client.protect(async () => {
      return {
        response:
          'Based on your query, I found that email john.doe@example.com and SSN 123-45-6789',
        model: 'gpt-4',
      };
    });

    console.log('✓ PII handled:', result);
  } catch (error) {
    const err = error as Error;
    console.log('✓ Request blocked (PII detected):', err.message);
  }

  // Test with sandbox client
  console.log('\n' + '='.repeat(60));
  console.log('Example 3: Sandbox Mode');
  console.log('='.repeat(60));

  const sandboxClient = AxonFlow.sandbox('demo-key');

  try {
    const result = await sandboxClient.protect(async () => {
      return {
        response: 'This is a sandbox test response',
        model: 'gpt-4-turbo',
      };
    });

    console.log('✓ Sandbox query succeeded:', result);
  } catch (error) {
    const err = error as Error;
    console.log('⚠ Sandbox query result:', err.message);
  }

  console.log('\n✅ All examples completed');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
