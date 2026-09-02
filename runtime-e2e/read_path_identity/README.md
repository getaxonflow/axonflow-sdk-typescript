# read_path_identity - per-user identity on the READ path (platform #2922)

Real-wire proof, through the TypeScript SDK's own runtime against a **live
enterprise stack**, that `explainDecision` and `listDecisions` are scoped to the
identity the caller presents - and that the SDK reports the outcomes honestly
instead of collapsing them into "nothing there".

Runs the **LOCAL build** via `file:../..` (the npm registry is blocked - HARD
RULE 6), never `npm install @axonflow/sdk`.

## The defect this pins

All five SDKs carried `user_token` as a **write-path body field only**, so both
read methods asked the platform anonymously. Measured live before the fix:

```
$ curl -H "Authorization: Basic $AUTH" .../api/v1/decisions?limit=5
HTTP/1.1 200 OK
X-Axonflow-Read-Scope: none
{"decisions":[]}
```

A `200` with an empty page, indistinguishable from a tenant that has made no
decisions - and `explain` answering `404` for ids that plainly existed.

## What the driver asserts

| # | Step | Why it cannot pass vacuously |
|---|---|---|
| 1 | Write 3 decisions as dev-a through the SDK's own `decide` | - |
| 2 | List as dev-a, then **dev-b writes one** | Floor is **the number this run wrote**, each checked **by id**. The floor alone cannot tell own-rows from tenant-wide, so dev-b then writes a row and dev-a's page must **not grow** |
| 3 | Explain as dev-a | Asserts a context value **this run chose**, not merely "non-empty" |
| 4 | List with **no identity** | Must be a typed `ReadScopeError` with `identityMissing`, never `[]`. A stack that returns rows here fails loudly - every other scoping assertion would be vacuous |
| 5 | Explain dev-a's decision **as dev-b** | Must refuse, and must **not** report a missing identity - dev-b presented one |
| 6 | **Malformed / expired / another-org** tokens | Each must fail **closed** and must not echo the credential. Asserted on the platform's own words plus the `AuthenticationError` type, and explicitly **not** a `ReadScopeError` - a rejected token reported as a scoping outcome would mean it degraded to the unscoped path |
| 7 | Explain as **admin** | Without it, step 5 is unfalsifiable: a read broken for everyone also "refuses dev-b" |
| 8 | `asUser` | A derived client must be scoped to the identity it was derived FOR, on a method that takes no per-call option. The Python sibling had exactly the bug this catches: a derived client silently keeping the ORIGINAL identity |
| 9 | No leak | The token must appear in **no** captured log char and in **no** request reaching the telemetry collector this driver hosts. `debug: true` and a **positive control** assert SDK output is present *before* the grep - otherwise "absent" is a claim about an empty haystack. Fails if the collector received nothing |
| 10 | Observable | The orchestrator must have **recorded** the unscoped read |

## Three traps this driver exists to not fall into

**Identities are minted at `@example.com`, never `@axonflow.local`.** The
platform reserves that whole domain (and `@axonflow.internal`) for *shared,
non-personal* identities and censuses them to nothing before scoping. A
perfectly valid developer token minted there reads **zero rows** and reports
scope `none` - identical to presenting no token at all. `generate-jwt.sh`'s own
default (`demo-user@axonflow.local`) lands in the reserved domain.

**Tokens are minted in-process.** The scoping assertions need *several distinct*
identities - two developers, an admin, an expired one, one from another org. A
single shared env token cannot express them, and the setup script's token is
`role=admin`, which short-circuits to tenant-wide and would make steps 4-8
untestable.

**The telemetry stamp is PARKED and restored, not deleted.** It lives in the
developer's real cache dir; deleting it would make their next unrelated SDK run
fire a genuine ping at the production checkpoint.

## Run

```bash
# 1. Enterprise stack, FROM THE axonflow-enterprise CHECKOUT, per
#    axonflow-internal-docs/engineering/E2E_EXAMPLES_TESTING_WORKFLOW.md
(cd /path/to/axonflow-enterprise && ./scripts/setup-e2e-testing.sh enterprise)

# 2. Then, FROM THIS REPO's root:
set -a; source /tmp/axonflow-e2e-env.sh; set +a
export AXONFLOW_AGENT_URL=http://localhost:8080
./runtime-e2e/read_path_identity/test.sh
```

Env: `AXONFLOW_AGENT_URL`, `AXONFLOW_CLIENT_ID`, `AXONFLOW_CLIENT_SECRET`,
`JWT_SECRET` (or `AXONFLOW_JWT_SECRET`). Optional `AXONFLOW_ORCH_CONTAINER`
(default `axonflow-orchestrator`) for step 10.

Exits non-zero on the first failed assertion.
