/**
 * MCP Connectors Example
 *
 * Demonstrates:
 * - Listing available connectors
 * - Installing connectors
 * - Querying connector data
 *
 * The install→query arc uses the Redis connector that ships with the
 * docker-compose stack, so the example runs end-to-end with no external
 * service or paid credentials. (Earlier revisions installed the Amadeus
 * travel connector here; Amadeus decommissioned its self-service APIs on
 * 2026-07-17, so an example pinned to it can never succeed again.)
 */

import { AxonFlow } from '@axonflow/sdk';

async function main() {
  const clientId = process.env.AXONFLOW_CLIENT_ID || 'demo-client';
  const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || 'demo-secret';
  // Enterprise stacks validate user tokens as JWTs - export AXONFLOW_USER_TOKEN.
  const userToken = process.env.AXONFLOW_USER_TOKEN || '';
  // Tenant id is independent of the auth principal in real installations,
  // even when a single demo collapses them to the same value.
  const tenantId = process.env.AXONFLOW_TENANT_ID || clientId;
  // The Redis connector connects FROM the platform (orchestrator), not from
  // this process. On the docker-compose stack the Redis service is reachable
  // as "redis"; override for other topologies.
  const redisHost = process.env.AXONFLOW_REDIS_HOST || 'redis';
  const redisPort = Number(process.env.AXONFLOW_REDIS_PORT || '6379');

  const client = new AxonFlow({
    clientId,
    clientSecret,
    endpoint: process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080',
    debug: true,
  });

  // List connectors
  console.log('='.repeat(60));
  console.log('Step 1: List Available Connectors');
  console.log('='.repeat(60));

  let redisInstalled = false;
  try {
    const connectors = await client.listConnectors();
    console.log(`Found ${connectors.length} connectors:\n`);

    connectors.forEach((conn, i) => {
      console.log(`${i + 1}. ${conn.name} (${conn.type})`);
      console.log(`   Description: ${conn.description}`);
      console.log(`   Installed: ${conn.installed ? '✓' : '✗'}\n`);
      if (conn.type === 'redis' && conn.installed) {
        redisInstalled = true;
      }
    });
  } catch (error) {
    console.log('⚠ Could not list connectors:', (error as Error).message);
    process.exitCode = 1;
  }

  // Install connector
  console.log('='.repeat(60));
  console.log('Step 2: Install Redis Connector');
  console.log('='.repeat(60));

  // Community-edition stacks run connectors from config files and have no
  // DB persistence for marketplace installs, so the install→query arc is
  // skipped there rather than failed.
  let installArc = true;
  if (redisInstalled) {
    // Keep the example re-runnable: the platform rejects duplicate
    // registrations, so don't re-install an already-installed connector.
    console.log('✓ Redis connector already installed — skipping install');
  } else {
    try {
      await client.installConnector({
        connector_id: 'redis-cache',
        name: 'redis-cache',
        tenant_id: tenantId,
        options: { host: redisHost, port: redisPort },
        credentials: {},
      });
      console.log('✓ Connector installed successfully!');
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('Failed to persist connector config')) {
        console.log('⚠ This stack cannot persist connector installs (community edition');
        console.log('  runs connectors from config files) — skipping the install/query arc');
        installArc = false;
      } else {
        console.log('⚠ Install failed:', msg);
        process.exitCode = 1;
      }
    }
  }

  // Query connector through the governed gateway path
  console.log('\n' + '='.repeat(60));
  console.log('Step 3: Query Connector');
  console.log('='.repeat(60));

  if (!installArc) {
    console.log('Skipped (connector install is not available on this stack).');
    console.log('\n✅ Connector examples completed (listing only on this edition)');
    return;
  }

  try {
    // Redis connector queries are command statements: GET, EXISTS, TTL, KEYS
    // (the key goes in params).
    const result = await client.queryConnector(
      'redis-cache',
      'GET',
      { key: 'user:123:preferences' },
      userToken
    );

    if (result.success) {
      console.log('✓ Redis data retrieved:', result.data);
    } else {
      // queryConnector reports failures in-band, not as throws — a ✓
      // over success:false hides auth/access errors.
      console.log('⚠ Query failed:', result.error ?? 'unknown error');
      process.exitCode = 1;
    }
  } catch (error) {
    console.log('⚠ Query failed:', (error as Error).message);
    process.exitCode = 1;
  }

  if (process.exitCode === 1) {
    console.log('\n⚠ Connector examples completed with failures');
  } else {
    console.log('\n✅ Connector examples completed');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
