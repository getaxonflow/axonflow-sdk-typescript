# `createHITLRequest` — runtime-e2e

Real-stack assertion for the cross-SDK
[`createHITLRequest`](https://github.com/getaxonflow/axonflow-enterprise/issues/2421)
surface added in TypeScript SDK v8.2.0. Sister proof to the equivalent
Python / Go / Java runtime-e2e tests shipping in the same parity sweep.

## What this proves

Drives `AxonFlow.createHITLRequest(...)` through the real `fetch`
transport against a `node:http` listener that mimics the platform
handler at `platform/agent/hitl/handler.go:177`. Captures the raw HTTP
body, decodes it, and asserts every required field from
`src/types/hitl.ts#HITLCreateInput` lands on the wire — including the
new `notify_url` field added in
[#2419](https://github.com/getaxonflow/axonflow-enterprise/issues/2419)
— then asserts the SDK parses the platform's `APIResponse{success,
data}` envelope back into a populated `HITLApprovalRequest`.

No mocked fetch, no Jest spies, no test doubles — runs the production
transport against an in-process HTTP server, which is what the
`runtime-e2e/` DoD gate is asking for.

## Usage

```bash
npm run build
node runtime-e2e/create_hitl_request/test.mjs
```

Exits `0` on PASS, `1` on FAIL. Prints captured wire body + parsed
response fields on success for human-readable confirmation.

## Companion unit coverage

`tests/hitl.test.ts` `describe('createHITLRequest')` exercises the
same surface through mocked `fetch` for eight scenarios (happy path
full-fields, minimal required-fields, bad-`notify_url`-scheme 400
propagation, 401 propagation, connect-failure propagation, and the
three `ConfigurationError` guards). The runtime proof here is the
redundant real-stack confirmation.
