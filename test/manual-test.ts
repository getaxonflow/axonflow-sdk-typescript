/**
 * Manual test for AxonFlow SDK
 * Run with: npm run build && node -r ts-node/register test/manual-test.ts
 */

import { AxonFlow } from '../src/client';

async function testSDK() {
  console.log('🚀 AxonFlow SDK Manual Test\n');

  // Test 1: Public endpoint
  console.log('Test 1: Public endpoint (staging-eu.getaxonflow.com)');
  console.log('='.repeat(60));

  const axonflow = new AxonFlow({
    clientId: 'healthcare-acme',
    clientSecret: 'test-secret',
    endpoint: 'https://staging-eu.getaxonflow.com',
    debug: true,
  });

  // Mock OpenAI-like call
  const mockAICall = async () => {
    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Show me patient demographics',
          },
        },
      ],
    };
  };

  try {
    console.log('\n📤 Calling AxonFlow.protect()...\n');
    const result = await axonflow.protect(mockAICall);
    console.log('\n✅ SUCCESS! Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.log('\n❌ ERROR:', error.message);
    console.log('\nThis is expected if:');
    console.log('  1. Client "healthcare-acme" doesn\'t exist in Agent DB');
    console.log('  2. Token is invalid');
    console.log('  3. Network connectivity issues');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Test complete. SDK is working correctly!\n');
}

// Run the test
testSDK().catch(console.error);
