/**
 * Example: typed policy authoring against a running AxonFlow v11.0.0 platform.
 *
 * A v11.0.0 platform authors policy as a typed document: validated, published as
 * a signed artifact pinned by its digest, and promoted to active. This example
 * reads what the deployment may author, validates a document and prints every
 * finding, and shows the document in force. It publishes and activates only when
 * AXONFLOW_TYPED_POLICY_PUBLISH=1, because that changes the organization's
 * active policy. Before it activates, it prints the publication's report of the
 * organization template's controls the document omits: activating a document
 * that omits them removes them for the organization. A publication or activation
 * it was asked for and refused fails the run.
 *
 * Run examples/pep-handshake first. After a document with an organization-scope
 * constraint is activated, a decide that does not supply the attribute the
 * constraint conditions on is denied fail-closed with reasons
 * ["unknown_constraint"]; supply the attribute or run this example on a fresh
 * stack. From v11.0.0 the deny's first reason is that code, followed by one
 * naming each constraint it could not evaluate and the attribute it needed
 * (getaxonflow/axonflow-enterprise#4247). The default document is such a
 * document.
 *
 * Env vars:
 *   AXONFLOW_AGENT_URL             (default: http://localhost:8080)
 *   AXONFLOW_CLIENT_ID             (default: community)
 *   AXONFLOW_CLIENT_SECRET         (default: empty)
 *   AXONFLOW_TYPED_POLICY_BODY     a JSON file holding {"document": ..., "fixtures": [...]}
 *                                  (default: the repository's tests/fixtures/typed-policy-publish-body.json)
 *   AXONFLOW_TYPED_POLICY_PUBLISH  set to 1 to also publish and activate the document
 *
 * The default document is found from this example's own location, so it runs
 * from any directory:
 *
 *   npx tsx examples/typed-policies/index.ts
 *
 * Exits non-zero if a step fails, so it is usable as a smoke test.
 */

import { readFileSync } from 'fs';
import { AxonFlow, TypedPolicyRefusal, type TypedPolicyPublication } from '@axonflow/sdk';
import { DEFAULT_BODY_PATH } from './body';

interface PublishBody {
  document: Record<string, unknown>;
  fixtures: Array<Record<string, unknown>>;
}

/** Print a refusal: the platform's reason and any findings that refused it. */
function printRefusal(what: string, refusal: TypedPolicyRefusal): void {
  console.log(`${what}: HTTP ${refusal.statusCode} ${refusal.reason}: ${refusal.message}`);
  for (const f of refusal.findings) {
    console.log(`  ${f.severity} ${f.code} ${f.policy_id ?? ''}`);
  }
}

/** Print which of the organization template's controls the document omits. */
function printTemplateOmissions(published: TypedPolicyPublication): void {
  const report = published.template_omissions;
  if (report !== undefined) {
    console.log(
      `template omissions: ${report.omitted.length} of ${report.of} template controls: ${report.omitted.join(', ')}`
    );
  } else if (published.template_omissions_unavailable !== undefined) {
    console.log(`template omissions: unavailable: ${published.template_omissions_unavailable}`);
  } else {
    console.log('template omissions: none');
  }
}

async function main(): Promise<number> {
  const body = JSON.parse(
    readFileSync(process.env.AXONFLOW_TYPED_POLICY_BODY || DEFAULT_BODY_PATH, 'utf8')
  ) as PublishBody;

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
      let published: TypedPolicyPublication;
      try {
        published = await axonflow.typedPolicies.publish(body.document, body.fixtures);
      } catch (err) {
        // A refusal carries the platform's reason and, for a refused document,
        // the findings that refused it. Publishing was asked for, so a refusal
        // fails the run.
        if (err instanceof TypedPolicyRefusal) printRefusal('refused', err);
        throw err;
      }
      console.log(`published ${published.digest} (version ${published.version})`);
      // Activating a document that omits the organization template's controls
      // removes them for the organization, so the report comes first.
      printTemplateOmissions(published);
      try {
        await axonflow.typedPolicies.activate(published.digest, {
          reason: 'examples/typed-policies',
        });
      } catch (err) {
        // Activation promotes: a digest whose version does not advance past the
        // active one is refused. Activating was asked for, so a refusal fails
        // the run.
        if (err instanceof TypedPolicyRefusal) printRefusal('activation refused', err);
        throw err;
      }
      console.log('activated');
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
