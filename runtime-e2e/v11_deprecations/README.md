# v11 deprecations: each deprecated route is reported once per client

`test.mjs` drives the BUILT SDK (`dist/`) against a real AxonFlow agent, and asserts how it reports the platform's deprecation of its legacy policy routes.

Requires a v11.1.0 or later platform: a v11.0.0 platform stamps `X-AxonFlow-Removed-In: v11.1`, and this leg reds against it.

## What it proves

| Step | Expected |
|---|---|
| The platform's own stamps on `GET /api/v1/static-policies` and `GET /api/v1/static-policies/effective`, read raw and printed | `X-AxonFlow-Removed-In: v12.0`, and a `Link` naming `/api/v1/typed-policies` as the successor |
| `listStaticPolicies()` twice on one client | one `PlatformRouteDeprecationWarning`, naming the route, the removal release and the successor |
| The same call from a client derived with `asUser` | nothing new: a derived client shares its parent's memory |
| `getEffectiveStaticPolicies()` twice | one report for that route, and nothing new on the second call |

Warnings are read from the process's own `warning` event, which is how the SDK delivers them.

## What it does not prove

The simulation routes (`simulate`, `impact-report`, `conflicts`), which this SDK also documents as deprecated, are registered only on an Evaluation+ licence. The Go SDK's live `v11_deprecations` leg proves the platform's stamps on them. This SDK's reporting of them rests on its unit tests in `tests/legacy-deprecations.test.ts`, which stamp exactly the headers that run observed.

## Running it

Boot an agent from the platform's main (community mode is enough), build the SDK, then:

```bash
npm run compile
AXONFLOW_AGENT_URL=http://localhost:8080 \
AXONFLOW_CLIENT_ID=runtime-e2e AXONFLOW_CLIENT_SECRET=runtime-e2e-secret \
node runtime-e2e/v11_deprecations/test.mjs
```

It writes nothing to the stack.
