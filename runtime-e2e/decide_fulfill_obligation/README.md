# decide_fulfill_obligation (v8.5.0)

Real-stack proof for the Decision Mode PEP surface (epic #2563 / tracking #2571,
ADR-056): **decide → fulfill → forward**.

The driver builds the local SDK and, against a real running agent, proves:

1. **`client.decide(...)`** on a PII-bearing request returns `verdict=allow` with a
   self-describing `redact_pii` obligation whose `fulfillment` names the
   `check-input` engine endpoint (request phase, `text/plain`), plus a `trace_id`.
2. **`client.fulfillRequest(...)`** discharges that obligation by round-tripping the
   statement through the named engine endpoint and returns **engine-redacted**
   content — the raw email (`john.doe@example.com`) and card (`4111111111111111`)
   do not survive, and the masking is the engine's (the SDK contains no local
   redaction path).
3. **`client.decideAndFulfill(...)`** does both in one call with the same masked
   result.
4. **Demo / wrong credentials** are refused (`401` → `AuthenticationError`).

No mocks — every call hits the real agent over real `fetch` with HTTP Basic
(org:license) auth built from `clientId` + `clientSecret`.

## Run

```
source /tmp/axonflow-e2e-env.sh        # provides AXONFLOW_CLIENT_ID / _SECRET
export AXONFLOW_AGENT_URL=http://localhost:8080
./test.sh
```

Exits non-zero if the verdict is not `allow`, the obligation is missing/not
engine-fulfillable, raw PII survives fulfillment, or demo credentials are not
refused.
