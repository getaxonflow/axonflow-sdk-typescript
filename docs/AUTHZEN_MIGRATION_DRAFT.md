# AuthZEN migration notes - DRAFT, not yet in effect

**Status: DRAFT. Nothing here is deprecated today.**

This file is written now and published later on purpose. The deprecation it describes is a **v11.0.0** event; the surface it describes shipped in v10.3.0 so that customers have a migration target *during* the shadow window rather than being handed one at the moment the default flips. Publishing the notice early would tell people to move off something that is not going anywhere for two releases.

Keep it in the repository, out of the README, until the v11 release train picks it up. The reviewer's question for any edit here is "is this true on the day v11 ships", not "is this true today".

## Timeline

| Release | The legacy decision surface | The AuthZEN surface |
|---|---|---|
| v10.3.0 (now) | Fully supported. Not deprecated. No warnings. | New. Available. Recommended for new integrations. |
| v10.3.x | Unchanged. | Unchanged. |
| **v11.0.0** | **Deprecated.** Still works; wire-stable. Doc + release-note notice. | The engine behind it becomes the ADR-065 Policy Decision Point. **No wire change.** |
| v12.0.0 | **Removed.** | The only decision surface. |

The legacy surface is **wire-stable through all of v11**. A v10.x integration keeps working on v11 without edits; deprecation is a signal to plan, not a breakage.

## Why migrate at all

Not because the old surface stops working - it does not, until v12. Because of what happens *underneath* each of them at v11.

At v11 the engine behind `client.evaluate` becomes the new Policy Decision Point. An integration already speaking AuthZEN gets that with **no code change**. An integration still on `client.decide` will eventually make the same move, but at v12, under time pressure, and with the wire shape changing at the same time.

So the choice is one migration or two. That is the whole argument.

## What changes at the call site

The legacy surface asks "here is a stage, a target and a query - what is the verdict?". The AuthZEN surface asks "may this subject perform this action on this resource?". The mapping is mechanical:

| Legacy `DecideRequest` | AuthZEN |
|---|---|
| `stage: 'llm'` | `action: { name: 'llm.completion' }` + `resource: { type: 'llm', id: 'llm' }` |
| `stage: 'tool'` | `action: { name: 'tool.call' }` + `resource: { type: 'tool', id: '<server>/<tool>' }` |
| `stage: 'agent'` | `action: { name: 'agent.invoke' }` + `resource: { type: 'agent', id: 'agent' }` |
| `callerIdentity.gatewayId` | `subject: { type: 'gateway', id: ... }` |
| `target.server` + `target.tool` | `resource.id = '<server>/<tool>'` |
| `target.provider` + `target.model` | **Not carried.** See below. |
| `query` | `context: { args: { query: ... } }` |
| `verdict: 'allow'` | `decision.allowed === true` / `decision.state === 'ALLOW'` |
| `verdict: 'deny'` | `decision.allowed === false` / `decision.state === 'DENY'` |
| `verdict: 'needs_approval'` | `decision.allowed === false` / `decision.state === 'CHALLENGE'` |
| `obligations[]` | `decision.obligations` (and `decision.mandatoryObligations`) |

**An `llm` or `agent` resource id must be exactly `"llm"` or `"agent"`.** It is not a provider/model pair. Measured against the adapter rather than assumed: nothing on the serving path reads `target.provider` or `target.model` - not policy, not the audit row, not the HITL descriptor a human approver sees. Sending `"openai/gpt-4o"` is refused with `unsupported_resource` for exactly the reason the whole surface exists: accepting it would report that the provider and the model were weighed when nothing read them. A `tool` resource is different - the server and the tool ARE both read - which is why its id is a pair.

## The behavioural difference to plan for

**The AuthZEN surface refuses what it cannot evaluate. The legacy surface ignored it.**

A legacy caller could attach any `context` map; unrecognised keys were dropped and the evaluation proceeded. The AuthZEN surface returns a typed refusal naming the member instead.

This is a deliberate improvement and it is the only thing likely to surprise a migrating integration. Code that was quietly sending fields nothing read will start getting refusals that name those fields. That is the surface telling you something true which was previously hidden: those attributes were never considered.

Handle it by branching on the refusal rather than treating every error as a deny:

```typescript
import { AuthZENProtocolError, AuthZENRefusal } from '@axonflow/sdk';

try {
  const decision = await axonflow.evaluate(request);
} catch (err) {
  if (err instanceof AuthZENRefusal) {
    // A refusal is NOT a denial - the request was never evaluated.
    // err.pointer names the member to remove or move.
    // err.refusedBy says whether the SDK or the gateway made the call.
    // Only err.retryable is worth sending again.
  } else if (err instanceof AuthZENProtocolError) {
    // The gateway answered 200 with a body this build cannot act on.
    // Fail closed and upgrade the SDK.
  }
}
```

Treating a refusal as a deny is safe (it fails closed) but will block traffic that should have been allowed once the request is corrected.

## What the tri-state changes

`undefined` cannot express three states, so the legacy surface had two: a value, or nothing. The AuthZEN surface has three, and the third one is the point:

```typescript
import { AUTHZEN_UNKNOWN_RESOLUTION_FAILED, AuthZENAttribute } from '@axonflow/sdk';

const context = {
  args: { query: prompt },
  correlation: {
    // The source ran and established there is no session. A fact.
    session_id: AuthZENAttribute.absent(),
    // The directory did not answer. NOT a fact - the request is refused
    // locally rather than evaluated as though the value were missing.
    trace_id: AuthZENAttribute.unknown(AUTHZEN_UNKNOWN_RESOLUTION_FAILED),
  },
};
```

Migrating code that used `undefined` for both cases has to decide which it meant. That decision is the migration's real work, and it is worth doing: an attribute your resolver failed on, sent as though it were simply missing, produces a decision whose audit trail records that the attribute was considered.

## One TypeScript-specific note

TypeScript interfaces are erased at runtime, so an object literal that satisfies the compiler is not yet a valid envelope. The SDK ships GENERATED runtime validators and runs them before anything is sent, which is why a structurally wrong request surfaces as an `AuthZENRefusal` with `refusedBy: 'client'` rather than as a compile error. Python's models validate at construction instead, so the same mistake raises there a moment earlier. Both refuse; only the moment differs.

## Not yet expressible

An **end-user subject**. `subject.type` must be `'gateway'` today, because an end-user subject would have to be trusted from caller-supplied JSON - an impersonation surface - or silently dropped, which is the fail-open this surface exists to prevent. It arrives with the identity plane at v11. Integrations that authorize per end user should stay on the legacy `user_token` path until then.

**Caller-supplied `properties`** on a subject, action or resource. Refused today with `unevaluable_attribute`, for the same reason: the evaluator has no way to read them.

## Checklist for the v11 release train

- [ ] Move this file's content into the README and the public docs site.
- [ ] Add the `@deprecated` JSDoc tag to `AxonFlow.decide` and the gateway/proxy methods.
- [ ] Confirm the removal release named here is still v12.0.0.
- [ ] Confirm the end-user subject is supported, and delete that section if so.
- [ ] Re-check the mapping table against the adapter, which is the authoritative source: `platform/agent/authzen_adapter.go` in axonflow-enterprise.
- [ ] Confirm the five SDKs still agree on the mapping table - it is the same table in all five, and a correction in one is a correction owed to the others.
