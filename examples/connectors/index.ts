/**
 * MCP Connectors Example
 *
 * Demonstrates:
 * - Listing available connectors
 * - Installing connectors
 * - Querying connector data
 */

import { AxonFlow } from '@axonflow/sdk';

async function main() {
  const clientId = process.env.AXONFLOW_CLIENT_ID || 'demo-client';
  const clientSecret = process.env.AXONFLOW_CLIENT_SECRET || 'demo-secret';
  // Tenant id is independent of the auth principal in real installations,
  // even when a single demo collapses them to the same value.
  const tenantId = process.env.AXONFLOW_TENANT_ID || clientId;

  const client = new AxonFlow({ clientId, clientSecret, debug: true });

  // List connectors
  console.log('='.repeat(60));
  console.log('Step 1: List Available Connectors');
  console.log('='.repeat(60));

  try {
    const connectors = await client.listConnectors();
    console.log(`Found ${connectors.length} connectors:\n`);

    connectors.forEach((conn, i) => {
      console.log(`${i + 1}. ${conn.name} (${conn.type})`);
      console.log(`   Description: ${conn.description}`);
      console.log(`   Installed: ${conn.installed ? '✓' : '✗'}\n`);
    });
  } catch (error) {
    console.log('⚠ Could not list connectors:', (error as Error).message);
  }

  // Install connector
  console.log('='.repeat(60));
  console.log('Step 2: Install Connector');
  console.log('='.repeat(60));

  const amadeusKey = process.env.AMADEUS_API_KEY;
  const amadeusSecret = process.env.AMADEUS_API_SECRET;

  if (amadeusKey && amadeusSecret) {
    try {
      await client.installConnector({
        connector_id: 'amadeus-travel',
        name: 'amadeus-prod',
        tenant_id: tenantId,
        options: { environment: 'production' },
        credentials: { api_key: amadeusKey, api_secret: amadeusSecret },
      });
      console.log('✓ Connector installed successfully!');
    } catch (error) {
      console.log('⚠ Install failed:', (error as Error).message);
    }
  } else {
    console.log('⚠ Skipping (AMADEUS_API_KEY and AMADEUS_API_SECRET not set)');
  }

  // Query connector
  console.log('\n' + '='.repeat(60));
  console.log('Step 3: Query Connector');
  console.log('='.repeat(60));

  if (amadeusKey) {
    try {
      const result = await client.queryConnector('amadeus-prod', 'Find flights from Paris to Amsterdam', {
        origin: 'CDG',
        destination: 'AMS',
        date: '2025-12-15',
      });

      console.log('✓ Flight data retrieved:', result.data);
    } catch (error) {
      console.log('⚠ Query failed:', (error as Error).message);
    }
  }

  console.log('\n✅ Connector examples completed');
}

main().catch(console.error);
