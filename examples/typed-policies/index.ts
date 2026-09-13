/**
 * Example: typed policy authoring against a running AxonFlow v11.0.0 platform.
 *
 * A v11.0.0 platform authors policy as a typed document: validated, published as
 * a signed artifact pinned by its digest, and promoted to active. This example
 * reads what the deployment may author, validates a document and prints every
 * finding, and shows the document in force. It publishes and activates only when
 * AXONFLOW_TYPED_POLICY_PUBLISH=1, because that changes the organization's
 * active policy.
 *
 * Env vars:
 *   AXONFLOW_AGENT_URL             (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID             (default: community)
 *   AXONFLOW_CLIENT_SECRET         (default: empty)
 *   AXONFLOW_TYPED_POLICY_BODY     a JSON file holding {"document": ..., "fixtures": [...]}
 *                                  (default: tests/fixtures/typed-policy-publish-body.json)
 *   AXONFLOW_TYPED_POLICY_PUBLISH  set to 1 to also publish and activate the document
 *
 * Run it from the repository root, since the default body is a path in it:
 *
 *   npx tsx examples/typed-policies/index.ts
 *
 * Exits non-zero if a step fails, so it is usable as a smoke test.
 */

import { readFileSync } from 'fs';
import { AxonFlow, TypedPolicyRefusal } from '@axonflow/sdk';

interface PublishBody {
  document: Record<string, unknown>;
  fixtures: Array<Record<string, unknown>>;
}

async function main(): Promise<number> {
  const bodyPath =
    process.env.AXONFLOW_TYPED_POLICY_BODY ?? 'tests/fixtures/typed-policy-publish-body.json';
  const body = JSON.parse(readFileSync(bodyPath, 'utf8')) as PublishBody;

  const axonflow = new AxonFlow({
    endpoint: process.env.AXONFLOW_AGENT_URL ?? 'http://localhost:8080',
    clientId: process.env.AXONFLOW_CLIENT_ID ?? 'community',
    clientSecret: process.env.AXONFLOW_CLIENT_SECRET ?? '',
  });

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

  // What this deployment may author: consult it before publishing, rather than
  // learning the edition's boundary from a refusal.
  await step('what this deployment may author', async () => {
    const edition = await axonflow.typedPolicies.edition();
    console.log(
      `root=${edition.root} max_documents=${edition.max_documents} persistence=${edition.persistence}`
    );
    if (edition.constructs) {
      console.log(
        `edition=${edition.constructs.edition} obligation families=${edition.constructs.obligation_families.join(', ')}`
      );
    }
  });

  // Validation reports every finding. A document with findings is still a
  // successful call: read success and findings rather than expecting a throw.
  await step('validate the document', async () => {
    const validation = await axonflow.typedPolicies.validate(body.document, body.fixtures);
    console.log(`success=${validation.success}`);
    for (const f of validation.findings) {
      console.log(`  ${f.severity} ${f.code} ${f.policy_id ?? ''}: ${f.detail ?? f.summary ?? ''}`);
    }
  });

  if (process.env.AXONFLOW_TYPED_POLICY_PUBLISH === '1') {
    await step('publish and activate', async () => {
      try {
        const published = await axonflow.typedPolicies.publish(body.document, body.fixtures);
        console.log(`published ${published.digest} (version ${published.version})`);
        await axonflow.typedPolicies.activate(published.digest, {
          reason: 'examples/typed-policies',
        });
        console.log('activated');
      } catch (err) {
        if (!(err instanceof TypedPolicyRefusal)) throw err;
        // A refusal carries the platform's reason and, for a refused document,
        // the findings that refused it.
        console.log(`refused: HTTP ${err.statusCode} ${err.reason}: ${err.message}`);
        for (const f of err.findings) {
          console.log(`  ${f.severity} ${f.code} ${f.policy_id ?? ''}`);
        }
      }
    });
  }

  // The document in force comes back as the exact text that was signed.
  await step('the document in force', async () => {
    const active = await axonflow.typedPolicies.active();
    if (active === null) {
      console.log('nothing is active');
      return;
    }
    const metadata = active.document.metadata as Record<string, unknown> | undefined;
    console.log(
      `${active.source.length} signed characters; document_id=${String(metadata?.document_id)}`
    );
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
