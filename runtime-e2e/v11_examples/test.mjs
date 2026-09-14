// Runtime proof: examples/pep-handshake and examples/typed-policies, against the
// SDK built from this tree (dist/, which `@axonflow/sdk` resolves to from the
// examples), on a LIVE Community agent, in the order the README gives: the
// handshake example first. NO mocks. Every example runs with tsx from a
// temporary directory, outside the tree, with no body file: typed-policies finds
// its default document from its own location.
//
// Precondition, checked with curl rather than the SDK: the agent answers /health
// within 60 seconds, and no typed document is active (GET
// /api/v1/typed-policies/active answers 404 nothing_active). Otherwise the leg
// stops with exit 2: it needs a live agent, and it changes the organization's
// active policy, so it needs a fresh stack. Exit 2 means only that; every other
// failure is exit 1.
//
//   1. pep-handshake: exits 0, the first decide is allowed, and the declaration
//      the platform would refuse fails in the client at /pep_id, before
//      anything is sent.
//   2. typed-policies without publishing (the README's default): exits 0, and
//      active() reads the platform's nothing_active as nothing active.
//   3. typed-policies with AXONFLOW_TYPED_POLICY_PUBLISH=1: exits 0, prints the
//      publication's template-omission report BEFORE it activates, and the
//      document is published and activated.
//   4. typed-policies asked to publish a document the save-time checks reject:
//      exits 1, printing the platform's typed 422 document_refused.
//   5. typed-policies publishing the same document again: the publication is a
//      new artifact of the same document version, so the activation is refused
//      (a typed 409 activation_refused, since activation promotes), and the
//      example exits 1.
//   6. pep-handshake again: printed as an OBSERVATION, not asserted. After run 3
//      activates a document with an organization-scope constraint, a decide that
//      does not supply the attribute the constraint conditions on is denied
//      fail-closed with reasons ["unknown_constraint"]. From v11.0.0 the deny's
//      first reason is that code, followed by one naming each constraint it
//      could not evaluate and the attribute it needed
//      (getaxonflow/axonflow-enterprise#4247).
//
// Credentials are left unset, so the examples present the client id
// "community", and on Community the organization is the deployment's.
//
// Build the SDK first (`npm run build`), then:
//
//   AXONFLOW_AGENT_URL=http://localhost:8080 node runtime-e2e/v11_examples/test.mjs
//
// TSX names the tsx package to run the examples with (default tsx@4.21.0).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const ENDPOINT = process.env.AXONFLOW_AGENT_URL ?? 'http://localhost:8080';
const TSX = process.env.TSX ?? 'tsx@4.21.0';
const env = { ...process.env, AXONFLOW_AGENT_URL: ENDPOINT, AXONFLOW_TELEMETRY: 'off' };
// The credentials and the examples' own switches come only from the runs below,
// never from the environment the leg was started in.
for (const name of [
  'AXONFLOW_CLIENT_ID',
  'AXONFLOW_CLIENT_SECRET',
  'AXONFLOW_TYPED_POLICY_PUBLISH',
  'AXONFLOW_TYPED_POLICY_BODY',
]) {
  delete env[name];
}

function curl(path, out, maxTime = 10) {
  try {
    return execFileSync(
      'curl',
      ['-s', '--max-time', String(maxTime), '-o', out, '-w', '%{http_code}', `${ENDPOINT}${path}`],
      { encoding: 'utf8' }
    );
  } catch {
    return '000';
  }
}

const OUT = mkdtempSync(join(tmpdir(), 'v11-examples-'));
process.on('exit', () => rmSync(OUT, { recursive: true, force: true }));

// The SDK the examples import: `@axonflow/sdk` resolved from the example's own
// location (the package's self-reference), which must be this tree's build.
const sdk = createRequire(join(ROOT, 'examples', 'typed-policies', 'index.ts')).resolve('@axonflow/sdk');
console.log(`the examples import the SDK from: ${sdk}`);
if (!sdk.startsWith(join(ROOT, 'dist') + '/') || !existsSync(sdk)) {
  console.log('FAIL: the examples do not import this tree\'s build; run `npm run build` first');
  process.exit(1);
}

console.log('=== precondition: the agent answers, and no typed document is active');
// A deadline, not an attempt count: an agent that accepts the connection and
// never answers must not hold the loop past 60 seconds.
const deadline = Date.now() + 60_000;
let healthy = false;
while (!healthy && Date.now() < deadline) {
  healthy = curl('/health', join(OUT, 'health.json'), 5) === '200';
  if (!healthy) await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!healthy) {
  console.log(`FAIL: ${ENDPOINT}/health did not answer 200 within 60 seconds: start the stack first`);
  process.exit(2);
}
const code = curl('/api/v1/typed-policies/active', join(OUT, 'active.json'));
let reason = '';
try {
  reason = JSON.parse(readFileSync(join(OUT, 'active.json'), 'utf8')).reason ?? '';
} catch {
  reason = '';
}
if (code !== '404' || reason !== 'nothing_active') {
  console.log(
    `FAIL: a typed document is already active, or the route did not answer nothing_active (HTTP ${code}, reason '${reason}'): run this leg on a fresh stack`
  );
  process.exit(2);
}
console.log('ok: HTTP 404 nothing_active');

let failures = 0;
function check(ok, description) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${description}`);
  if (!ok) failures++;
}

// Runs one example from OUT, outside the tree, with extra environment, prints
// its output, and returns its exit code and lines.
function runExample(example, extra = {}) {
  const result = spawnSync(
    'npx',
    ['--yes', TSX, join(ROOT, 'examples', example, 'index.ts')],
    { cwd: OUT, env: { ...env, ...extra }, encoding: 'utf8', timeout: 180_000 }
  );
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  for (const line of text.split('\n')) console.log(`  | ${line}`);
  return { status: result.status ?? 1, lines: text.split('\n') };
}

const index = (lines, pattern) => lines.findIndex(line => pattern.test(line));

console.log('=== 1. pep-handshake on a fresh stack');
const run1 = runExample('pep-handshake');
check(run1.status === 0, `pep-handshake exits 0 (exit ${run1.status})`);
const header = index(run1.lines, /^=== decide with the client's declaration ===$/);
const first = run1.lines.slice(header + 1).find(line => line.startsWith('verdict='));
check(
  header >= 0 && first !== undefined && first.startsWith('verdict=allow '),
  `the first decide is allowed on a fresh stack (${first})`
);
check(
  index(run1.lines, /^refused at \/pep_id: /) >= 0,
  'the declaration the platform would refuse fails in the client, at /pep_id, before anything is sent'
);

console.log('=== 2. typed-policies without publishing, as the README runs it');
const run2 = runExample('typed-policies');
check(run2.status === 0, `typed-policies exits 0 without publishing (exit ${run2.status})`);
check(
  index(run2.lines, /^nothing is active$/) >= 0,
  "active() reads the platform's nothing_active as nothing active"
);

console.log('=== 3. typed-policies with AXONFLOW_TYPED_POLICY_PUBLISH=1, as the README runs it');
const run3 = runExample('typed-policies', { AXONFLOW_TYPED_POLICY_PUBLISH: '1' });
check(run3.status === 0, `typed-policies exits 0 (exit ${run3.status})`);
const omissions = index(run3.lines, /^template omissions: /);
const activated = index(run3.lines, /^activated$/);
check(
  omissions >= 0 && activated >= 0 && omissions < activated,
  "it prints the publication's template-omission report before it activates"
);
check(activated >= 0, 'the document is published and activated');

console.log('=== 4. typed-policies asked to publish a document the save-time checks reject');
// The vendored body with one action the registry does not contain: the same edit
// runtime-e2e/typed_policies makes to it.
const body = JSON.parse(
  readFileSync(join(ROOT, 'tests', 'fixtures', 'typed-policy-publish-body.json'), 'utf8')
);
body.document.metadata.document_id = 'v11-examples-refused';
body.document.policy.policies[0].actions.actions[0].local = 'tool.not_registered';
const refusedBody = join(OUT, 'refused-body.json');
writeFileSync(refusedBody, JSON.stringify(body));
const run4 = runExample('typed-policies', {
  AXONFLOW_TYPED_POLICY_PUBLISH: '1',
  AXONFLOW_TYPED_POLICY_BODY: refusedBody,
});
check(
  run4.status === 1,
  `typed-policies exits 1 when the publication it asked for is refused (exit ${run4.status})`
);
check(
  index(run4.lines, /^refused: HTTP 422 document_refused: /) >= 0,
  "it prints the platform's typed 422 document_refused"
);

console.log('=== 5. typed-policies publishing the same document again');
const run5 = runExample('typed-policies', { AXONFLOW_TYPED_POLICY_PUBLISH: '1' });
check(
  run5.status === 1,
  `typed-policies exits 1 when the activation it asked for is refused (exit ${run5.status})`
);
check(
  index(run5.lines, /^published /) >= 0,
  'the second publication is accepted: a new artifact of the same document version'
);
check(
  index(run5.lines, /^activation refused: HTTP 409 activation_refused: /) >= 0,
  "it prints the platform's typed 409 activation_refused"
);

console.log('=== 6. OBSERVATION, not asserted: pep-handshake after the activation');
const run6 = runExample('pep-handshake');
const observed = run6.lines.find(line => line.startsWith('verdict='));
console.log(`  observed: ${observed ?? 'no verdict printed'}`);

if (failures > 0) {
  console.log(`\nFAIL: v11_examples (${failures} assertion(s))`);
  process.exit(1);
}
console.log('\nPASS: v11_examples');
