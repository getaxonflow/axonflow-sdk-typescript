# OpenAPI schema snapshot for the wire-shape contract

The wire-shape contract (`scripts/wire-shape/validate.js`) and the audit-surface binding gate
(`scripts/audit-binding/check.js`), both run by `.github/workflows/wire-shape-contract.yml`, read
the platform's OpenAPI specs through `loadAllSchemas` in `scripts/wire-shape/lib.js`. That loader
reads the schema declarations under `components.schemas` and the names of each one's `properties`,
counting a schema declared twice in one file.

The four files here hold exactly that, and nothing else. `scripts/snapshot_openapi_schemas.py`
derives them from the platform's `docs/api/*.yaml` at platform commit
`ba5201a52edd2bfbe9f1dadd736f19cae03d9cc4`, the merged platform source for the v11.2.0 train. It is the same script the Python
SDK uses. It works on the YAML node graph, so every declaration survives in source order, including a
schema declared twice in one file and a declaration with no properties. It drops descriptions,
types, paths and the `info` block: the full specs carry the platform's own licence statement there,
and this repository is MIT (`tests/license-metadata.test.ts`).

`loadAllSchemas` returns deep-equal results (`merged`, `crossSpecDuplicates` and
`intraFileDuplicates`) from these files and from the full specs, so nothing either gate reads is
lost.

| File | sha256 of the source spec |
|---|---|
| `agent-api.yaml` | `617e6236f91dd7716baaab8e2f22ef24f1713ebfd4938cc52a60a3368e3acb1a` |
| `masfeat-api.yaml` | `eb224773c2a14fc6a84a630b652b17e010a4776da28529b13e173b002d2d4756` |
| `orchestrator-api.yaml` | `a1f96d929ff35acb1204ce5ba3c6e605b8f91d93e7fa62a2fa8a760ea8486860` |
| `policy-api.yaml` | `a1a7aff59d759033f99721a40d942e8750c6026d69f9efb0edf66016f0069ae9` |

Each file's header repeats its source path, commit and digest.

## Why a snapshot, not the community mirror

Until now the contract checked out `getaxonflow/axonflow` at a pinned commit. The community mirror
publishes `docs/api/` byte for byte, but it receives v11 only at the v11.0.0 tag. So the SDK's v11
wire work is checked against the same schemas, derived here ahead of the tag. At the tag, the pin
moves back to the mirror commit that publishes them.

## Changing these files

A change to any file in this directory is a change to the contract's pin. The workflow treats it the
same as a change to `openapi_specs_sha`: the PR needs the `spec-pin-bump` label, and it should not
also change SDK types. Do not edit the files by hand.

To refresh the snapshot from a platform commit (Python 3 with PyYAML for the first step):

```
python scripts/snapshot_openapi_schemas.py <path to docs/api> tests/fixtures/openapi --source-commit <full 40-character commit>
node scripts/wire-shape/refresh.js tests/fixtures/openapi
AXONFLOW_OPENAPI_SPECS_DIR=tests/fixtures/openapi node scripts/audit-binding/check.js --vendor
```

Then update the table above. The refresh reads the platform commit from the files' headers and
refuses a `--sha` that disagrees with them, and the validator fails when the headers name a
different commit from the baseline's `openapi_specs_sha`.

The workflow runs `python scripts/snapshot_openapi_schemas.py --self-test` and
`--check-snapshot tests/fixtures/openapi`. The check requires every header to name one full platform
commit, and refuses anything beyond the derived form (prose,
types, a spec copied in verbatim). It cannot see a declaration added by hand in the derived form
itself; the `spec-pin-bump` label that any change here requires is what makes that visible.
