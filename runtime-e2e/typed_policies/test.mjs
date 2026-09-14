// Real-stack proof of typed policy authoring through the TypeScript SDK.
//
// It drives the BUILT SDK (dist/) with the real global fetch against a real
// agent and orchestrator, and asserts on a FRESH stack (nothing active on the
// organization):
//
//  1. Nothing is active yet: active() answers null from the platform's 404
//     whose reason is nothing_active, the reason it keys on.
//  2. edition() reports the deployment's boundary and names its vocabulary by
//     digest (not a test-world fixture), and system() the shipped controls with
//     their digest, names and mandatory flags.
//  3. The document the platform's own route test proves publishable validates
//     clean, publishes to a digest, and activates. The publication reports every
//     organization template control the document omits, and the activation
//     reports the same.
//  4. active() returns that document as the exact signed source, carrying the
//     published policies, with the AUTHOR overwritten by the platform: the
//     document deliberately names `someone-else`, and on Community the platform
//     signs the Client principal of the presented credentials.
//  5. Activating the same digest again is a typed 409 activation_refused:
//     activation promotes, and the version does not advance.
//  6. Publishing with no fixtures is a typed 422 publication_refused whose
//     message names the missing fixtures.
//  7. A document naming an action the registry does not hold validates with
//     the platform's rejecting finding (ACTION_NOT_REGISTERED), and publishing
//     it is a typed 422 document_refused carrying that finding.
//
// Build the SDK first (`npm run compile`), then:
//
//   AXONFLOW_AGENT_URL=http://localhost:8080 \
//   AXONFLOW_CLIENT_ID=runtime-e2e AXONFLOW_CLIENT_SECRET=runtime-e2e-secret \
//   node runtime-e2e/typed_policies/test.mjs

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AxonFlow } from '../../dist/esm/client.js';
import { TypedPolicyRefusal } from '../../dist/esm/errors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BODY = JSON.parse(
  readFileSync(join(HERE, '..', '..', 'tests', 'fixtures', 'typed-policy-publish-body.json'), 'utf8')
);
const ENDPOINT = process.env.AXONFLOW_AGENT_URL ?? 'http://localhost:8080';
const failures = [];

function check(ok, description) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${description}`);
  if (!ok) failures.push(description);
}

async function refusalOf(promise) {
  try {
    await promise;
    return undefined;
  } catch (e) {
    return e instanceof TypedPolicyRefusal ? e : Promise.reject(e);
  }
}

async function run(client) {
  const typed = client.typedPolicies;
  const document = structuredClone(BODY.document);
  const documentId = `sdk-typescript-e2e-${randomUUID().slice(0, 12)}`;
  document.metadata.document_id = documentId;
  const fixtures = BODY.fixtures;

  console.log('== nothing active yet');
  check((await typed.active()) === null, 'active() is null before any activation');

  console.log('== edition and system');
  const edition = await typed.edition();
  console.log(
    `  edition: catalog=${edition.catalog} root=${edition.root} max_documents=${edition.max_documents} ` +
      `persistence=${edition.persistence} constructs.edition=${edition.constructs?.edition}`
  );
  check(edition.success && edition.root === 'organization', 'edition() reports the root');
  check(edition.constructs !== undefined, 'edition() reports the construct boundary');
  console.log(
    `  vocabulary: catalog_digest=${edition.catalog_digest} registry_version=${edition.registry_version} ` +
      `catalog_fixture=${edition.catalog_fixture}`
  );
  check(Boolean(edition.catalog_digest), 'edition() names its vocabulary by digest');
  check(
    typeof edition.registry_version === 'number' && edition.registry_version > 0,
    'edition() names the version of its action registry'
  );
  check(
    edition.catalog_fixture === false,
    "the deployment's vocabulary is not a test-world fixture, so a document can activate"
  );
  const system = await typed.system();
  console.log(
    `  system: root=${system.root} version=${system.version} digest=${system.digest} ` +
      `controls=${system.controls.length} assurance_counts=${JSON.stringify(system.assurance_counts)}`
  );
  check(Boolean(system.digest) && system.controls.length > 0, 'system() returns the shipped corpus');
  const named = system.controls.filter(c => c.name).length;
  const mandatory = system.controls.filter(c => c.mandatory).length;
  console.log(`  system controls: ${named} named, ${mandatory} mandatory, of ${system.controls.length}`);
  check(named > 0, "system() reads each control's name");
  check(mandatory > 0, 'system() reads which controls are mandatory');
  check(
    system.controls.every(c => typeof c.mandatory === 'boolean'),
    "every control's mandatory flag is a boolean"
  );

  console.log('== validate, publish, activate');
  const validation = await typed.validate(document, fixtures);
  console.log(`  validate: success=${validation.success} findings=${JSON.stringify(validation.findings)}`);
  check(validation.success, 'the document validates clean');
  const published = await typed.publish(document, fixtures);
  console.log(`  publish: digest=${published.digest} version=${published.version}`);
  check(Boolean(published.digest), 'publish() returns the artifact digest');
  const report = published.template_omissions;
  console.log(
    report
      ? `  template omissions: ${report.omitted.length} of ${report.of}: ${report.omitted.join(', ')}`
      : `  template omissions: none (unavailable=${published.template_omissions_unavailable})`
  );
  // The document names none of the template's controls, so it omits every one.
  check(
    report !== undefined && (report.of ?? 0) > 0 && report.omitted.length === report.of,
    'the publication reports every organization template control the document omits'
  );
  const activation = await typed.activate(published.digest, { reason: 'sdk-typescript runtime proof' });
  console.log(`  activate: success=${activation.success} activation=${JSON.stringify(activation.activation)}`);
  check(activation.success, 'activate() promotes the digest');
  check(
    JSON.stringify(activation.template_omissions) === JSON.stringify(published.template_omissions),
    'the activation reports the same omissions as the publication'
  );

  console.log('== the document in force');
  const active = await typed.active();
  check(active !== null, 'active() returns the document in force');
  if (active !== null) {
    const metadata = active.document.metadata ?? {};
    const author = metadata.author ?? {};
    console.log(`  active: document_id=${metadata.document_id} author=${JSON.stringify(author)}`);
    check(metadata.document_id === documentId, 'active() is the document just activated');
    check(
      JSON.stringify(JSON.parse(active.source)) === JSON.stringify(active.document),
      'active().source is the signed source the document parses from'
    );
    // The signed source carries the policies that were published: compared by id
    // against the request, not against a parse of the same bytes.
    const ids = doc => (doc.policy?.policies ?? []).map(p => p.id).filter(Boolean);
    console.log(`  active policy ids: ${JSON.stringify(ids(active.document))}`);
    check(
      ids(document).length > 0 && JSON.stringify(ids(active.document)) === JSON.stringify(ids(document)),
      'the document in force carries the policies that were published'
    );
    // The author is the caller the agent stamped, never the name the request
    // carried. On Community that caller is the API client: a Client principal in
    // the api-credential realm, named by the client id this proof presents.
    let stamped = Boolean(author.type) && Boolean(author.local);
    if (edition.constructs?.edition === 'community') {
      stamped =
        author.type === 'Client' &&
        author.qualifier === 'axonflow-api-credential' &&
        author.local === (process.env.AXONFLOW_CLIENT_ID ?? 'runtime-e2e');
    }
    check(
      stamped && author.local !== 'someone-else',
      'the platform signed the caller as author, not the name in the request'
    );
  }

  console.log('== typed refusals');
  const reactivate = await refusalOf(typed.activate(published.digest));
  console.log(`  re-activate: status=${reactivate?.statusCode} reason=${reactivate?.reason} error=${reactivate?.message}`);
  check(
    reactivate?.statusCode === 409 && reactivate?.reason === 'activation_refused',
    're-activating the active digest is a typed 409 activation_refused'
  );
  const noFixtures = await refusalOf(typed.publish(document, []));
  console.log(`  publish without fixtures: status=${noFixtures?.statusCode} reason=${noFixtures?.reason} error=${noFixtures?.message}`);
  check(
    noFixtures?.statusCode === 422 &&
      noFixtures?.reason === 'publication_refused' &&
      noFixtures?.message.includes('declares no fixtures'),
    'publishing with no fixtures is a typed 422 publication_refused naming the cause'
  );

  console.log('== a document the save-time checks reject');
  const unregistered = structuredClone(document);
  unregistered.metadata.document_id = `${documentId}-unregistered`;
  unregistered.policy.policies[0].actions.actions[0].local = 'tool.not_registered';
  const expected = 'ACTION_NOT_REGISTERED|reject|grant.refund';
  const rejected = await typed.validate(unregistered, fixtures);
  const found = rejected.findings.map(f => `${f.code}|${f.severity}|${f.policy_id}`);
  console.log(`  validate: success=${rejected.success} findings=${JSON.stringify(found)}`);
  check(
    !rejected.success && found.includes(expected),
    "validate() answers an unregistered action with the platform's rejecting finding"
  );
  const refused = await refusalOf(typed.publish(unregistered, fixtures));
  const refusedFound = (refused?.findings ?? []).map(f => `${f.code}|${f.severity}|${f.policy_id}`);
  console.log(`  publish: status=${refused?.statusCode} reason=${refused?.reason} findings=${JSON.stringify(refusedFound)}`);
  check(
    refused?.statusCode === 422 && refused?.reason === 'document_refused' && refusedFound.includes(expected),
    'publishing it is a typed 422 document_refused carrying that finding'
  );
}

console.log(`agent: ${ENDPOINT}`);
const client = new AxonFlow({
  endpoint: ENDPOINT,
  clientId: process.env.AXONFLOW_CLIENT_ID ?? 'runtime-e2e',
  clientSecret: process.env.AXONFLOW_CLIENT_SECRET ?? 'runtime-e2e-secret',
});
try {
  await run(client);
} catch (e) {
  check(false, `the run raised ${e?.name}: ${e?.message}`);
}
if (failures.length > 0) {
  console.log(`\nFAIL: typed_policies (${failures.length} assertion(s))`);
  process.exit(1);
}
console.log('\nPASS: typed_policies');
