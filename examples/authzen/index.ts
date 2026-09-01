/**
 * Example: AuthZEN-native authorization against a running AxonFlow gateway.
 *
 * This exercises the happy path AND the refusals, because the refusals are the
 * half a new integration gets wrong: this surface answers "I cannot evaluate
 * that" rather than evaluating around what it cannot read, and a caller that
 * treats every error as a deny will block traffic it should have allowed.
 *
 * It also demonstrates the tri-state, which is the part of the API with no
 * equivalent in the older surface. `undefined` cannot express three states, so
 * the SDK gives you an explicit one — and the difference between "the source
 * says there is no value" and "the source could not be reached" decides whether
 * the request is sent at all.
 *
 * Required env vars:
 *   AXONFLOW_AGENT_URL          (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID          (required outside community mode)
 *   AXONFLOW_CLIENT_SECRET
 *
 * Exits non-zero if any step does not behave as documented, so it is usable as
 * a smoke test rather than only as a demonstration.
 *
 * Run: npx tsx examples/authzen/index.ts
 */

import {
  AUTHZEN_UNKNOWN_RESOLUTION_FAILED,
  AuthZENAttribute,
  AuthZENDecision,
  AuthZENProtocolError,
  AuthZENRefusal,
  AuthZENRequest,
  AxonFlow,
} from '@axonflow/sdk';

const endpoint = process.env.AXONFLOW_AGENT_URL || 'http://localhost:8080';
const GATEWAY_ID = 'example-gateway-01';
const BENIGN = "summarise yesterday's incident report";

const failures: string[] = [];

function step(name: string): void {
  console.log(`\n=== ${name} ===`);
}

function ok(name: string): void {
  console.log(`ok    ${name}`);
}

function failed(name: string, detail: string): void {
  console.log(`FAIL  ${name}: ${detail}`);
  failures.push(name);
}

function llmRequest(query: unknown = BENIGN): AuthZENRequest {
  return {
    subject: { type: 'gateway', id: GATEWAY_ID },
    action: { name: 'llm.completion' },
    resource: { type: 'llm', id: 'llm' },
    context: { args: { query } },
  };
}

/** Print what a Policy Enforcement Point would act on. */
function describe(decision: AuthZENDecision): void {
  console.log(`  allowed:  ${decision.allowed}`);
  console.log(`  state:    ${decision.state}`);
  console.log(`  reason:   ${decision.reason} (${decision.category})`);
  console.log(`  id:       ${decision.decisionId}`);
  decision.obligations.forEach(obligation => {
    // A MANDATORY obligation that cannot be discharged means the operation must
    // NOT proceed, even though `allowed` is true.
    console.log(
      `  obligation: ${obligation.type} ` +
        `(mandatory=${obligation.mandatory}, from ${obligation.source_policy})`
    );
  });
  if (decision.approval) {
    console.log(`  approval required, expires ${decision.approval.expires_at}`);
  }
}

async function expectRefusal(
  client: AxonFlow,
  name: string,
  request: AuthZENRequest,
  wantCode: string
): Promise<void> {
  step(`refused: ${name}`);
  try {
    const decision = await client.evaluate(request);
    failed(name, `expected a refusal, got a decision: allowed=${decision.allowed}`);
  } catch (err) {
    if (!(err instanceof AuthZENRefusal)) {
      failed(name, `expected a typed refusal, got ${(err as Error).name}: ${err}`);
      return;
    }
    if (err.code !== wantCode) {
      failed(name, `code '${err.code}', want '${wantCode}'`);
      return;
    }
    console.log(`  code:       ${err.code}`);
    console.log(`  pointer:    ${err.pointer}`);
    console.log(`  refused by: ${err.refusedBy}`);
    console.log(`  retryable:  ${err.retryable}`);
    console.log(`  message:    ${err.message}`);
    if (err.supported) console.log(`  supported:  ${err.supported.join(', ')}`);
    ok(name);
  }
}

async function showSingleEvaluation(client: AxonFlow): Promise<void> {
  // 1. The happy path: one subject, one action, one resource.
  const name = 'a single evaluation';
  step(name);
  try {
    describe(await client.evaluate(llmRequest()));
    ok(name);
  } catch (err) {
    failed(name, String(err));
  }
}

async function showBulkEvaluation(client: AxonFlow): Promise<void> {
  // 2. Several preconditions of ONE operation. The reply is one decision, not
  // one per entry: a denied entry denies the operation. Anything an entry omits
  // is inherited from the shared base.
  const name = 'several preconditions of one operation';
  step(name);
  try {
    describe(
      await client.evaluateAll({
        subject: { type: 'gateway', id: GATEWAY_ID },
        action: { name: 'tool.call' },
        context: { args: { query: BENIGN } },
        evaluations: [
          { resource: { type: 'tool', id: 'jira/move_issue' } },
          { resource: { type: 'tool', id: 'jira/update_project' } },
        ],
      })
    );
    ok(name);
  } catch (err) {
    failed(name, String(err));
  }
}

async function showAbsentAttribute(client: AxonFlow): Promise<void> {
  // 3a. ABSENT is resolved data, so the request is still sent.
  const name = 'an ABSENT attribute is data, so the request is still sent';
  step(name);
  try {
    const decision = await client.evaluate({
      subject: { type: 'gateway', id: GATEWAY_ID },
      action: { name: 'llm.completion' },
      resource: { type: 'llm', id: 'llm' },
      context: {
        args: { query: BENIGN },
        // The correlation source ran and established there is no session for
        // this call. That is a fact, so the member is simply omitted and the
        // gateway decides.
        correlation: { session_id: AuthZENAttribute.absent() },
      },
    });
    console.log(`  allowed: ${decision.allowed} (the member was omitted, not invented)`);
    ok(name);
  } catch (err) {
    failed(name, String(err));
  }
}

async function showUnknownAttribute(client: AxonFlow): Promise<void> {
  // 3b. UNKNOWN is a failure to resolve, so nothing is sent.
  const name = 'an UNKNOWN attribute stops the request before it is sent';
  step(name);
  try {
    await client.evaluate({
      subject: { type: 'gateway', id: GATEWAY_ID },
      action: { name: 'llm.completion' },
      resource: { type: 'llm', id: 'llm' },
      context: {
        args: { query: BENIGN },
        // The directory did not answer. Sending anyway would get a decision
        // computed as though there were no session — and every audit of it
        // would record that the session was considered.
        correlation: {
          session_id: AuthZENAttribute.unknown(AUTHZEN_UNKNOWN_RESOLUTION_FAILED),
        },
      },
    });
    failed(name, 'the request was sent anyway');
  } catch (err) {
    if (err instanceof AuthZENRefusal && err.refusedBy === 'client') {
      console.log(`  refused locally at ${err.pointer}`);
      console.log(`  retryable: ${err.retryable}`);
      ok(name);
    } else {
      failed(name, `the request reached the gateway: ${err}`);
    }
  }
}

async function showRefusals(client: AxonFlow): Promise<void> {
  // 4. The refusals. Each names the member to fix.
  await expectRefusal(
    client,
    'an attribute the evaluator cannot read',
    {
      subject: { type: 'gateway', id: GATEWAY_ID, properties: { clearance: 'secret' } },
      action: { name: 'llm.completion' },
      resource: { type: 'llm', id: 'llm' },
      context: { args: { query: BENIGN } },
    },
    'unevaluable_attribute'
  );
  await expectRefusal(
    client,
    'an end-user subject, which needs the identity plane',
    {
      subject: { type: 'user', id: 'alice@example.com' },
      action: { name: 'llm.completion' },
      resource: { type: 'llm', id: 'llm' },
      context: { args: { query: BENIGN } },
    },
    'unsupported_subject'
  );
  await expectRefusal(
    client,
    'an action outside the evaluable set',
    {
      subject: { type: 'gateway', id: GATEWAY_ID },
      action: { name: 'jira.transition_issue' },
      resource: { type: 'llm', id: 'llm' },
      context: { args: { query: BENIGN } },
    },
    'unsupported_action'
  );
  await expectRefusal(
    client,
    'an action and a resource that describe different operations',
    {
      subject: { type: 'gateway', id: GATEWAY_ID },
      action: { name: 'llm.completion' },
      resource: { type: 'tool', id: 'jira/create_issue' },
      context: { args: { query: BENIGN } },
    },
    'unsupported_resource'
  );
  await expectRefusal(
    client,
    'nothing to evaluate',
    {
      subject: { type: 'gateway', id: GATEWAY_ID },
      action: { name: 'llm.completion' },
      resource: { type: 'llm', id: 'llm' },
      context: { args: {} },
    },
    'missing_evaluable_content'
  );
}

async function showLocalValidation(client: AxonFlow): Promise<void> {
  // 5. A malformed envelope never reaches the network. In TypeScript an object
  // literal is checked at compile time only, so the RUNTIME rules — the
  // singular member's own required set, among others — are enforced by the
  // generated validators before anything is sent.
  const name = 'an incomplete evaluation fails before the round trip';
  step(name);
  try {
    await client.evaluate({ subject: { type: 'gateway', id: GATEWAY_ID } });
    failed(name, 'an incomplete evaluation was accepted');
  } catch (err) {
    if (err instanceof AuthZENRefusal && err.refusedBy === 'client') {
      console.log(`  caught locally at ${err.pointer || '/'}: ${err.message}`);
      ok(name);
    } else if (err instanceof AuthZENProtocolError) {
      failed(name, `expected a local refusal, got a protocol error: ${err.message}`);
    } else {
      failed(name, `the gateway answered; this should have been caught locally: ${err}`);
    }
  }
}

async function main(): Promise<number> {
  const client = new AxonFlow({
    endpoint,
    clientId: process.env.AXONFLOW_CLIENT_ID,
    clientSecret: process.env.AXONFLOW_CLIENT_SECRET,
  });

  await showSingleEvaluation(client);
  await showBulkEvaluation(client);
  await showAbsentAttribute(client);
  await showUnknownAttribute(client);
  await showRefusals(client);
  await showLocalValidation(client);

  console.log();
  if (failures.length > 0) {
    console.log(`${failures.length} step(s) failed: ${failures.join(', ')}`);
    return 1;
  }
  console.log('All AuthZEN steps behaved as documented.');
  return 0;
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err);
    process.exit(1);
  }
);
