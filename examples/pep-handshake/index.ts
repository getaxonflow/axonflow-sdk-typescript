/**
 * Example: declaring an enforcement point's capabilities with the PEP handshake.
 *
 * An enforcement point (a PEP) declares, on each governed call, the exact
 * obligation types and schema versions it can discharge. The platform reads the
 * declaration from v10.4.0. On an Enterprise deployment an allow carrying a
 * mandatory obligation the declared set cannot discharge becomes a deny, so the
 * enforcement point is never handed an instruction it would drop; from v11.0.0,
 * an organization's redact override on `decide` refuses a caller that does not
 * declare redaction.
 *
 * This example builds a declaration once for the client, overrides it for one
 * call (one process can be two enforcement points), and shows that a declaration
 * the platform would refuse fails here, before anything is sent.
 *
 * Env vars:
 *   AXONFLOW_AGENT_URL      (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID      (default: community)
 *   AXONFLOW_CLIENT_SECRET  (default: empty)
 *
 * Run: npx tsx examples/pep-handshake/index.ts
 *
 * Exits non-zero if a step fails, so it is usable as a smoke test.
 */

import { AxonFlow, DecideRequest, PEPHandshake, PEPHandshakeError } from '@axonflow/sdk';

const AUDIENCE = 'https://pep.example.com';

async function main(): Promise<number> {
  // The request path redacts fields; it declares exactly that.
  const requestPath = new PEPHandshake({
    pepId: 'checkout-gateway',
    audience: AUDIENCE,
    capabilities: [{ type: 'field_redact', version: 1 }],
  });
  const axonflow = new AxonFlow({
    endpoint: process.env.AXONFLOW_AGENT_URL ?? 'http://localhost:8080',
    clientId: process.env.AXONFLOW_CLIENT_ID ?? 'community',
    clientSecret: process.env.AXONFLOW_CLIENT_SECRET ?? '',
    pepHandshake: requestPath,
  });
  const request: DecideRequest = {
    stage: 'tool',
    query: 'look up the weather',
    target: { type: 'tool', tool: 'search' },
  };

  let failures = 0;
  async function step(name: string, fn: () => Promise<void>): Promise<void> {
    console.log(`\n=== ${name} ===`);
    try {
      await fn();
      console.log('ok');
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      failures++;
    }
  }

  await step("decide with the client's declaration", async () => {
    const decision = await axonflow.decide(request);
    console.log(
      `verdict=${decision.verdict} obligations=${decision.obligations.length} reasons=${JSON.stringify(decision.reasons ?? [])}`
    );
  });

  // The response path masks fields instead. It declares its own set for this
  // call, in place of the client's.
  await step('decide with a per-call declaration', async () => {
    const responsePath = new PEPHandshake({
      pepId: 'checkout-gateway-response',
      audience: AUDIENCE,
      capabilities: [{ type: 'field_mask', version: 1 }],
    });
    const decision = await axonflow.decide(request, { pepHandshake: responsePath });
    console.log(
      `verdict=${decision.verdict} obligations=${decision.obligations.length} reasons=${JSON.stringify(decision.reasons ?? [])}`
    );
  });

  // A declaration the platform would refuse fails at construction, naming the
  // member at fault, instead of the first governed call answering 400.
  await step('a declaration the platform would refuse', async () => {
    let refusal: unknown;
    try {
      new PEPHandshake({ pepId: 'Checkout:Gateway', audience: AUDIENCE, capabilities: [] });
    } catch (err) {
      refusal = err;
    }
    if (!(refusal instanceof PEPHandshakeError)) {
      throw new Error(`want a PEPHandshakeError, got ${String(refusal)}`);
    }
    console.log(`refused at ${refusal.pointer}: ${refusal.message}`);
  });

  if (failures > 0) console.log(`\n${failures} step(s) failed`);
  return failures > 0 ? 1 : 0;
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err);
    process.exit(1);
  }
);
