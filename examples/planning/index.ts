/**
 * Multi-Agent Planning Example
 *
 * Demonstrates:
 * - Generating complex multi-step plans
 * - Executing plans
 * - Checking plan status
 */

import { AxonFlow } from '@axonflow/sdk';

async function main() {
  const apiKey = process.env.AXONFLOW_API_KEY || 'demo-key';
  const tenant = process.env.AXONFLOW_TENANT || 'demo-tenant';

  const client = new AxonFlow({ apiKey, tenant, debug: true, timeout: 90000 });

  // Generate plan
  console.log('='.repeat(60));
  console.log('Step 1: Generate Multi-Agent Plan');
  console.log('='.repeat(60));

  const planGoal =
    'Plan a 3-day business trip to Paris with meetings at La Défense, moderate budget accommodation, and dinner recommendations';

  console.log(`Goal: ${planGoal}\n`);
  console.log('Generating plan...');

  try {
    const plan = await client.generatePlan(planGoal, 'travel');

    console.log('✓ Plan generated successfully!');
    console.log(`  Plan ID: ${plan.planId}`);
    console.log(`  Steps: ${plan.steps.length}`);
    console.log(`  Complexity: ${plan.complexity}/10`);
    console.log(`  Parallel: ${plan.parallel}\n`);

    console.log('Plan Steps:');
    console.log('-'.repeat(60));
    plan.steps.forEach((step, i) => {
      console.log(`\n${i + 1}. ${step.name}`);
      console.log(`   Type: ${step.type}`);
      console.log(`   Agent: ${step.agent}`);
      console.log(`   Description: ${step.description}`);
      if (step.dependencies?.length) {
        console.log(`   Dependencies: ${step.dependencies.join(', ')}`);
      }
    });

    // Execute plan
    console.log('\n' + '='.repeat(60));
    console.log('Step 2: Execute Plan');
    console.log('='.repeat(60));

    console.log('Executing plan...');
    const startTime = Date.now();

    const execResult = await client.executePlan(plan.planId);
    const duration = Date.now() - startTime;

    console.log(`\n✓ Plan execution completed in ${duration}ms`);
    console.log(`  Status: ${execResult.status}`);

    if (execResult.status === 'completed') {
      console.log('\nPlan Result:');
      console.log('='.repeat(60));
      console.log(execResult.result);
      console.log('='.repeat(60));
    } else if (execResult.status === 'failed') {
      console.log(`❌ Plan failed: ${execResult.error}`);
    }

    // Check status
    console.log('\n' + '='.repeat(60));
    console.log('Step 3: Verify Plan Status');
    console.log('='.repeat(60));

    const status = await client.getPlanStatus(plan.planId);
    console.log(`Plan Status: ${status.status}`);
  } catch (error) {
    console.log('⚠ Plan operation failed:', (error as Error).message);
  }

  console.log('\n✅ Planning examples completed');
}

main().catch(console.error);
