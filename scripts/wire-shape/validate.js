#!/usr/bin/env node
/**
 * QF-15 TypeScript arm — wire-shape contract validator.
 *
 * Blocks PRs that introduce drift between exported TS interfaces/types
 * and the OpenAPI specs pinned via the `openapi_specs_sha` in
 * tests/fixtures/wire-shape-baseline.json. Fails fast with actionable
 * output:
 *
 *   1. Cross-spec schema divergence (same name, different shapes
 *      across spec files) — blocked unless baselined by per-spec
 *      shape fingerprint.
 *   2. Intra-file duplicate schema declarations (real PolicyMatch-
 *      class bug) — blocked unless baselined by count.
 *   3. SDK-vs-spec per-type drift — blocked on new drift outside
 *      the baseline; baselined entries are allowed (burn them down
 *      in targeted follow-up PRs).
 *   4. Registered-type coverage — a type that was in the baseline's
 *      registered_types list disappearing from either the SDK or
 *      the spec is flagged; forces deliberate rename/removal.
 *
 * Specs dir is passed via AXONFLOW_OPENAPI_SPECS_DIR. Without it,
 * the script exits 0 after printing a skip message so local
 * `npm test` doesn't require a specs checkout.
 *
 * Usage:
 *   AXONFLOW_OPENAPI_SPECS_DIR=/path/to/docs/api \
 *     node scripts/wire-shape/validate.js
 */

'use strict';

const fs = require('fs');
const {
  loadAllSchemas,
  discoverSDKInterfaces,
  loadBaseline,
  difference,
} = require('./lib');

function specsDir() {
  const env = process.env.AXONFLOW_OPENAPI_SPECS_DIR;
  if (!env) {
    return null;
  }
  if (!fs.existsSync(env) || !fs.statSync(env).isDirectory()) {
    return null;
  }
  return env;
}

function main() {
  const dir = specsDir();
  if (!dir) {
    console.log(
      '⏭️  AXONFLOW_OPENAPI_SPECS_DIR not set to a directory; wire-shape gate skipped.'
    );
    console.log('    The dedicated CI job clones getaxonflow/axonflow at the pinned SHA');
    console.log('    and exports this variable before running the validator.');
    process.exit(0);
  }

  const { merged, crossSpecDuplicates, intraFileDuplicates } = loadAllSchemas(dir);
  if (Object.keys(merged).length === 0) {
    console.error(
      '❌ Loaded 0 schemas with concrete properties from ' + dir + '.'
    );
    console.error(
      '   The specs directory should contain *.yaml files with components.schemas entries.'
    );
    process.exit(1);
  }
  console.log(`📋 Loaded ${Object.keys(merged).length} schema(s) from ${dir}\n`);

  const sdk = discoverSDKInterfaces();
  const baseline = loadBaseline();
  let errors = 0;

  // Gate 1: cross-spec divergence.
  const baselinedCross = baseline.cross_spec_duplicates;
  const crossProblems = [];
  for (const [name, observed] of Object.entries(crossSpecDuplicates)) {
    const expected = baselinedCross[name];
    if (!expected) {
      const lines = [`  ${name}: NEW cross-spec divergence (not in baseline).`];
      for (const spec of Object.keys(observed).sort()) {
        lines.push(`    ${spec}: ${JSON.stringify(observed[spec])}`);
      }
      crossProblems.push(lines.join('\n'));
      continue;
    }
    if (!shallowEqualDecls(expected, observed)) {
      const lines = [`  ${name}: divergence drifted from baseline.`];
      const specs = new Set([...Object.keys(expected), ...Object.keys(observed)]);
      for (const spec of [...specs].sort()) {
        const exp = expected[spec];
        const obs = observed[spec];
        if (JSON.stringify(exp) !== JSON.stringify(obs)) {
          lines.push(`    ${spec}:`);
          lines.push(`      baseline: ${JSON.stringify(exp)}`);
          lines.push(`      observed: ${JSON.stringify(obs)}`);
        }
      }
      crossProblems.push(lines.join('\n'));
    }
  }
  if (crossProblems.length > 0) {
    console.error('Cross-spec schema divergence gate failed:\n');
    for (const p of crossProblems) {
      console.error(p + '\n');
    }
    console.error(
      'Fix: reconcile in axonflow-enterprise specs (rename one, or merge into a'
    );
    console.error(
      'shared supertype). If the divergence is intentional and must stand, regenerate'
    );
    console.error(
      'tests/fixtures/wire-shape-baseline.json via scripts/wire-shape/refresh.js.\n'
    );
    errors += crossProblems.length;
  }

  // Gate 2: intra-file duplicates.
  const baselinedIntra = baseline.intra_file_duplicates;
  const intraProblems = [];
  for (const [file, schemas] of Object.entries(intraFileDuplicates)) {
    for (const [schemaName, count] of Object.entries(schemas)) {
      const allowedCount = baselinedIntra[file]?.[schemaName];
      if (allowedCount === count) {
        continue;
      }
      intraProblems.push(
        `  ${file}: schema '${schemaName}' declared ${count} time(s) (baseline says ${allowedCount ?? 0}).`
      );
    }
  }
  for (const [file, schemas] of Object.entries(baselinedIntra)) {
    for (const schemaName of Object.keys(schemas)) {
      if (!intraFileDuplicates[file]?.[schemaName]) {
        intraProblems.push(
          `  ${file}: baselined duplicate '${schemaName}' no longer observed — remove from baseline.intra_file_duplicates.`
        );
      }
    }
  }
  if (intraProblems.length > 0) {
    intraProblems.sort();
    console.error('Intra-file schema duplicate gate failed:\n');
    for (const p of intraProblems) {
      console.error(p);
    }
    console.error(
      '\nFix: remove the duplicate declaration in the OpenAPI spec. A schema'
    );
    console.error(
      'declared twice in one file leaves the contract ambiguous. If the duplicate'
    );
    console.error(
      'is intentional and must stand, regenerate the baseline.\n'
    );
    errors += intraProblems.length;
  }

  // Gate 3: SDK-vs-spec drift, baseline-aware.
  const baselinedDrift = baseline.per_type_drift;
  const driftProblems = [];
  let matched = 0;

  for (const [name, sdkFields] of Object.entries(sdk)) {
    const specFields = merged[name];
    if (!specFields) {
      continue;
    }
    matched += 1;
    const sdkOnly = difference(sdkFields, specFields);
    const specOnly = difference(specFields, sdkFields);
    const allowed = baselinedDrift[name] || { sdk_only: [], spec_only: [] };
    const newSdkOnly = difference(sdkOnly, allowed.sdk_only);
    const newSpecOnly = difference(specOnly, allowed.spec_only);
    if (newSdkOnly.length === 0 && newSpecOnly.length === 0) {
      continue;
    }
    const lines = [`  ${name}:`];
    if (newSdkOnly.length > 0) {
      lines.push(`    NEW, only in SDK interface: ${JSON.stringify(newSdkOnly)}`);
    }
    if (newSpecOnly.length > 0) {
      lines.push(`    NEW, only in OpenAPI:       ${JSON.stringify(newSpecOnly)}`);
    }
    const residualSdk = difference(sdkOnly, newSdkOnly);
    const residualSpec = difference(specOnly, newSpecOnly);
    if (residualSdk.length > 0) {
      lines.push(`    (baseline, only in SDK):    ${JSON.stringify(residualSdk)}`);
    }
    if (residualSpec.length > 0) {
      lines.push(`    (baseline, only in spec):   ${JSON.stringify(residualSpec)}`);
    }
    driftProblems.push(lines.join('\n'));
  }

  if (matched === 0) {
    console.error('❌ No TS interface matched any OpenAPI schema by name — check discovery.');
    process.exit(1);
  }

  if (driftProblems.length > 0) {
    driftProblems.sort();
    console.error('NEW wire-shape drift detected (not covered by baseline):\n');
    for (const p of driftProblems) {
      console.error(p);
    }
    console.error(
      '\nFix: align the TS property name with the OpenAPI property name, OR update'
    );
    console.error(
      'the spec if the SDK is the source of truth. Do not widen the baseline to'
    );
    console.error(
      'hide drift without a tracking issue.\n'
    );
    errors += driftProblems.length;
  }

  // Gate 4: registered-type coverage.
  if (baseline.registered_types.length > 0) {
    const missingSDK = [];
    const missingSpec = [];
    for (const name of baseline.registered_types) {
      if (!sdk[name]) missingSDK.push(name);
      if (!merged[name]) missingSpec.push(name);
    }
    if (missingSDK.length > 0 || missingSpec.length > 0) {
      console.error('Registered-type mapping broken — rename-escape guard fired:\n');
      if (missingSDK.length > 0) {
        console.error(`  No matching TS interface for: ${JSON.stringify(missingSDK)}`);
      }
      if (missingSpec.length > 0) {
        console.error(`  No matching OpenAPI schema for: ${JSON.stringify(missingSpec)}`);
      }
      console.error(
        '\nFix: revert the rename, do it on both sides, or update'
      );
      console.error(
        'tests/fixtures/wire-shape-baseline.json::registered_types (and mirror'
      );
      console.error(
        'the rename in baseline.per_type_drift entries).\n'
      );
      errors += missingSDK.length + missingSpec.length;
    }
  }

  if (errors > 0) {
    console.error(`❌ Found ${errors} wire-shape issue(s).`);
    process.exit(1);
  }
  console.log(
    `✅ ${matched} TS interface/schema pair(s) validated against OpenAPI.`
  );
  const unmappedSdk = Object.keys(sdk).filter((k) => !merged[k]).length;
  const unmappedSpec = Object.keys(merged).filter((k) => !sdk[k]).length;
  console.log(
    `   ${unmappedSdk} SDK-only interface(s) with no matching schema (internal / client-side).`
  );
  console.log(
    `   ${unmappedSpec} OpenAPI schema(s) with no matching SDK interface (coverage gap).`
  );
}

function shallowEqualDecls(a, b) {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (JSON.stringify(aKeys) !== JSON.stringify(bKeys)) {
    return false;
  }
  for (const k of aKeys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      return false;
    }
  }
  return true;
}

main();
