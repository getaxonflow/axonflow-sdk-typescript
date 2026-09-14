# v11_examples

Real-stack proof that the two v11 examples run as the README says. `test.mjs` runs `examples/pep-handshake` and `examples/typed-policies` with `tsx` against a live Community agent, in the README's order: the handshake example first. The examples import `@axonflow/sdk`, which resolves to this tree's build (`dist/`) through the package's own name, and the test checks that before it runs anything. Every run starts from a temporary directory, outside the tree, with no body file: `typed-policies` finds its default document from its own location. Telemetry is off. Nothing is mocked.

## Precondition

Before any run, `curl` waits up to 60 seconds for the agent's `/health` to answer `200`, then asks `GET /api/v1/typed-policies/active` and requires `404` with reason `nothing_active`: no typed document is active. Otherwise the leg stops with exit 2, because it needs a live agent, and it changes the organization's active policy, so it needs a fresh stack. The check is made outside the SDK, so an SDK regression is never reported as a stale stack. Exit 2 means only that; every other failure is exit 1.

## What it proves

| Run | Expected |
|---|---|
| 1. `pep-handshake` | exits 0; the first decide's verdict is `allow`; the declaration the platform would refuse fails in the client at `/pep_id`, before anything is sent |
| 2. `typed-policies` without publishing, the README's default | exits 0; `active()` reads the platform's `nothing_active` as nothing active |
| 3. `typed-policies` with `AXONFLOW_TYPED_POLICY_PUBLISH=1` | exits 0; prints the publication's template-omission report before it activates; the document is published and activated |
| 4. `typed-policies` asked to publish a document the save-time checks reject | exits 1, printing the platform's typed `422 document_refused`: an example that was asked to publish and could not must not report success |
| 5. `typed-policies` publishing the same document again | the publication is accepted, and the activation is refused as a typed `409 activation_refused`; exits 1, since an example asked to activate and refused must not report success either |
| 6. `pep-handshake` again, after the activation | printed as an observation, not asserted (below) |

Run 4 publishes a copy of `tests/fixtures/typed-policy-publish-body.json` with one action the registry does not contain (the same edit `runtime-e2e/typed_policies` makes), written to the temporary directory. It is refused before anything is admitted, so it changes nothing on the stack.

Run 5 is refused because activation promotes. An artifact's digest covers its publication time, so publishing the same document again produces a new artifact, but its document version is the active one's, and a version that does not advance is not promoted.

## Why the sixth run is an observation

After a document with an organization-scope constraint is activated, a decide that does not supply the attribute the constraint conditions on is denied fail-closed with reasons ["unknown_constraint"]; supply the attribute or run this example on a fresh stack. From v11.0.0 the deny's first reason is that code, followed by one naming each constraint it could not evaluate and the attribute it needed (getaxonflow/axonflow-enterprise#4247). The example's default document is such a document, so the sixth run shows that deny. It is the platform's by-design answer, not the SDK's, so this leg prints it rather than pinning it. It is why the README runs the handshake example first.

A stack built before getaxonflow/axonflow-enterprise#4247 shows only the bare `["unknown_constraint"]`.

## What it does not prove

- **That the handshake reaches the wire.** A fresh Community stack allows the first decide with or without a declaration, and the `/pep_id` refusal happens in the client. The wire proof is `runtime-e2e/pep_handshake_planes`.
- **That the organization carries no other state.** The precondition proves no typed document is active. A recorded detection override, or a legacy per-policy override on a platform that still accepts them, would still apply. And on a stack built before getaxonflow/axonflow-enterprise#4255, an unreadable document store also answers `nothing_active`.

## Run

Community on the application database role, on a fresh stack. Build the SDK first:

```
npm run build
AXONFLOW_AGENT_URL=http://localhost:8080 node runtime-e2e/v11_examples/test.mjs
```

It leaves `AXONFLOW_CLIENT_ID` and `AXONFLOW_CLIENT_SECRET` unset, so the examples present the client id `community`, and on Community the organization is the deployment's (`ORG_ID`). It ignores any `AXONFLOW_TYPED_POLICY_PUBLISH` or `AXONFLOW_TYPED_POLICY_BODY` it was started with: each run sets its own. `TSX` names the `tsx` package it runs the examples with (default `tsx@4.21.0`, fetched by `npx` when absent). It exits 0 when every assertion passes, 1 when one fails, and 2 when the precondition does not hold (the agent does not answer, or a typed document is already active). It changes the organization's active policy.
