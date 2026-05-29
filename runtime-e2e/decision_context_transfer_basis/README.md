# decision_context_transfer_basis (v8.4.0)

Real-stack proof for the v8.4.0 SDK surface (platform epic #2508):

- **`DecisionSummary.context` / `DecisionExplanation.context` (+ `contextTruncated`)** —
  the sanitized request context a PEP attaches to a Decision Mode call is surfaced
  back through `listDecisions` and `explainDecision`. The `parseDecisionSummary` /
  `parseDecisionExplanation` decoders map the new wire fields through.
- **`AuditLogEntry.transferBasis = 'pasal_56b_dpa'`** — the Pasal 56(b) explicit DPA
  tag (a member of the new `TransferBasis` union) round-trips verbatim.

The driver builds the local SDK, acts as the PEP (raw `POST /api/v1/decide` — that
endpoint is not SDK-wrapped per ADR-056), then reads the decision back through the
SDK against a real running agent.

## Run

```
export AXONFLOW_AGENT_URL=http://localhost:8080
export AXONFLOW_TENANT_ID=buku-e-ts-e2e
export AXONFLOW_TENANT_SECRET=buku-e-secret
./test.sh
```

Exits non-zero if the SDK does not surface the new fields.
