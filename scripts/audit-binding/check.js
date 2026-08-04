#!/usr/bin/env node
/**
 * Audit-surface BINDING gate (#3254).
 *
 * Why this exists: the wire-shape contract gate RECORDS SDK-vs-spec drift
 * into a baseline but never BINDS the TS model to the spec - a model field
 * with no wire equivalent just becomes a baseline entry and ships. That is
 * exactly how the seven fiction fields on AuditLogEntry (query_summary,
 * success, blocked, risk_score, latency_ms, policy_violations, metadata)
 * lived on the model for the whole 9.x line while the server never sent
 * them (getaxonflow/axonflow-enterprise#3254).
 *
 * This gate BINDS, for the audit surface:
 *
 *   model property (src/types/gateway.ts)
 *     -> transformer mapping (src/client.ts, extracted from the real
 *        parse/serialize code via the TS AST)
 *     -> wire field name
 *     -> MUST exist in the pinned OpenAPI schema
 *
 * Failure modes are all CLOSED, never skipped:
 *   - model property with NO transformer mapping        -> FAIL (unresolvable)
 *   - transformer wire target absent from the spec      -> FAIL (fiction)
 *     unless carried by the curated allowlist below AND the model property
 *     is marked @deprecated (the allowlist names debt, it does not hide it)
 *   - allowlist entry that is stale (spec now serves the field, or the
 *     model no longer declares it)                      -> FAIL (stale)
 *   - interface / transformer / fixture / schema not found -> FAIL
 *
 * Spec fields the model does not cover are reported as INFORMATIONAL
 * (additive coverage gaps, not contract violations).
 *
 * DESIGN LIMIT (accepted): the gate binds by wire-name EXISTENCE, not
 * semantics. A model property whose transformer maps it to an existing
 * but WRONG wire name (e.g. a latency prop reading `tokens_used`) passes
 * this gate; only the value-level tests (real-capture fixtures and the
 * runtime-e2e suite) can catch that class.
 *
 * DESIGN LIMIT (accepted): SURFACE registration is MANUAL. A wire-modeling
 * interface that is not listed in SURFACE below is invisible to this
 * binding gate; its only automatic coverage is the wire-shape drift gate,
 * and that only when its name matches a spec schema.
 *
 * Spec source: tests/fixtures/audit-binding-spec.json, vendored from the
 * OpenAPI specs at the SHA pinned in tests/fixtures/wire-shape-baseline.json
 * so the gate ALWAYS runs (no env-dependent skip). When
 * AXONFLOW_OPENAPI_SPECS_DIR is set (the CI job exports it), the vendored
 * copy is cross-checked byte-for-byte against the live pinned spec and the
 * gate FAILS on divergence.
 *
 * Usage:
 *   node scripts/audit-binding/check.js                  # validate
 *   node scripts/audit-binding/check.js --no-allowlist   # show full debt (red)
 *   AXONFLOW_OPENAPI_SPECS_DIR=... node scripts/audit-binding/check.js --vendor
 *                                                        # regenerate fixture
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { loadAllSchemas } = require('../wire-shape/lib');

const SDK_ROOT = path.resolve(__dirname, '..', '..');
const TYPES_DIR = path.join(SDK_ROOT, 'src', 'types');
const CLIENT_TS = path.join(SDK_ROOT, 'src', 'client.ts');
const FIXTURE_PATH = path.join(SDK_ROOT, 'tests', 'fixtures', 'audit-binding-spec.json');
const WIRE_SHAPE_BASELINE = path.join(SDK_ROOT, 'tests', 'fixtures', 'wire-shape-baseline.json');

/**
 * Curated allowlist of wire names the model declares but the pinned spec
 * does not serve. Every entry is DEBT with a tracking note; the gate also
 * requires the corresponding model property to carry @deprecated, and
 * fails if an entry goes stale in either direction.
 */
const ALLOWED_UNSERVED = {
  AuditLogEntry: {
    query_summary:
      '#3254 fiction field, never served on 9.x (wire carries query/query_hash). Deprecated on the model; removal rides the next major.',
    success:
      '#3254 fiction field, never served on 9.x (policy_decision "allowed" replaces success=true). Deprecated on the model; removal rides the next major.',
    blocked:
      '#3254 fiction field, never served on 9.x (policy_decision "blocked" replaces blocked=true). Deprecated on the model; removal rides the next major.',
    risk_score:
      '#3254 fiction field, never served on 9.x (no wire equivalent). Deprecated on the model; removal rides the next major.',
    latency_ms:
      '#3254 fiction field, never served on 9.x (wire carries response_time_ms). Deprecated on the model; removal rides the next major.',
    policy_violations:
      '#3254 fiction field, never served on 9.x (wire carries policy_details). Deprecated on the model; removal rides the next major.',
    metadata:
      '#3254 fiction field, never served on 9.x (wire carries policy_details/security_metrics). Deprecated on the model; removal rides the next major.',
  },
  AuditSearchRequest: {
    request_type:
      '#3254: the 9.x server does not read this filter (silent no-op); use action. Still serialized for back-compat. Deprecated on the model; removal rides the next major.',
  },
  RegistrySummary: {
    high_materiality_count:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated highMaterialityCount prop reads it first and falls back to the real high_materiality. Use highMateriality. Removal rides the next major.',
    medium_materiality_count:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated mediumMaterialityCount prop reads it first and falls back to the real medium_materiality. Use mediumMateriality. Removal rides the next major.',
    low_materiality_count:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated lowMaterialityCount prop reads it first and falls back to the real low_materiality. Use lowMateriality. Removal rides the next major.',
    by_use_case:
      '#3254 pin-advance batch: fiction field, never served on 9.x (always {} against real servers). No wire equivalent. Deprecated on the model; removal rides the next major.',
    by_status:
      '#3254 pin-advance batch: fiction field, never served on 9.x (always {} against real servers). No wire equivalent. Deprecated on the model; removal rides the next major.',
  },
  AISystemRegistry: {
    technical_owner:
      '#3254 pin-advance batch: fiction field, never served on 9.x (the wire carries owner_email/owner_team). Use ownerEmail. Deprecated on the model; removal rides the next major.',
    business_owner:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated businessOwner prop reads it first and falls back to the real owner_email. Use ownerEmail. Removal rides the next major.',
    customer_impact:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated customerImpact prop reads it first and falls back to the real risk_rating_impact. Use riskRatingImpact. Removal rides the next major.',
    model_complexity:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated modelComplexity prop reads it first and falls back to the real risk_rating_complexity. Use riskRatingComplexity. Removal rides the next major.',
    human_reliance:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated humanReliance prop reads it first and falls back to the real risk_rating_reliance. Use riskRatingReliance. Removal rides the next major.',
  },
  KillSwitch: {
    triggered_reason:
      '#3254 pin-advance batch: fiction wire tag, never served on 9.x; the deprecated triggeredReason prop reads it first and falls back to the real trigger_reason. Use triggerReason. Removal rides the next major.',
  },
};

// ---------------------------------------------------------------------------
// Model discovery (interface properties + @deprecated marks)
// ---------------------------------------------------------------------------

function walkTypesFiles(dir) {
  // Recursive: a wire type declared in a future src/types subdirectory must
  // be found (and a duplicate there must be caught), not silently skipped.
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTypesFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function readInterface(typeName) {
  let result = null;
  const files = walkTypesFiles(TYPES_DIR);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === typeName) {
        if (result) {
          throw new Error(
            `audit-binding: interface '${typeName}' declared in more than one file under src/types - ambiguous binding target.`
          );
        }
        const properties = [];
        const deprecated = new Set();
        for (const member of node.members) {
          if (!ts.isPropertySignature(member) || !member.name) continue;
          const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
            ? member.name.text
            : null;
          if (!name) continue;
          properties.push(name);
          if (ts.getJSDocTags(member).some((t) => t.tagName.text === 'deprecated')) {
            deprecated.add(name);
          }
        }
        result = { properties, deprecated };
      }
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Transformer extraction (the real parse/serialize code in client.ts)
// ---------------------------------------------------------------------------

function loadClientSource() {
  const text = fs.readFileSync(CLIENT_TS, 'utf8');
  return ts.createSourceFile(CLIENT_TS, text, ts.ScriptTarget.Latest, true);
}

function findMethod(sourceFile, methodName) {
  let found = null;
  function visit(node) {
    if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      (node.name.text || node.name.escapedText?.toString()) === methodName &&
      node.body
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** Collect `<receiver>.<x>` / `<receiver>?.<x>` / `<receiver>['x']` names. */
function collectAccesses(node, receiverName) {
  const out = new Set();
  function visit(n) {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === receiverName
    ) {
      out.add(n.name.text);
    }
    if (
      ts.isElementAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === receiverName &&
      n.argumentExpression &&
      ts.isStringLiteral(n.argumentExpression)
    ) {
      out.add(n.argumentExpression.text);
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return out;
}

/** Record a model-prop -> wire-keys binding into a Map<string, Set>. */
function addBinding(map, prop, wires) {
  if (!map.has(prop)) map.set(prop, new Set());
  for (const w of wires) map.get(prop).add(w);
}

/**
 * READ model: walk the transformer's return object literal(s).
 * PropertyAssignment initializers and conditional-spread inner literals
 * both bind via the `data.<wire>` accesses they contain.
 */
function extractReadModelBindings(method) {
  const bindings = new Map();

  function harvestLiteral(literal) {
    for (const prop of literal.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name) {
        const name = prop.name.text || prop.name.escapedText?.toString();
        if (!name) continue;
        addBinding(bindings, name, collectAccesses(prop.initializer, 'data'));
      } else if (ts.isSpreadAssignment(prop)) {
        // Shape: ...(data.x != null && { modelProp: data.x as T })
        let sawInner = false;
        function findInner(n) {
          if (ts.isObjectLiteralExpression(n)) {
            sawInner = true;
            for (const inner of n.properties) {
              if (!ts.isPropertyAssignment(inner) || !inner.name) continue;
              const name = inner.name.text || inner.name.escapedText?.toString();
              if (!name) continue;
              // R3 rounds 1+2: an inner property binds ONLY through the
              // `data.` accesses in its OWN initializer - never by
              // inheriting the spread condition's accesses. Round 1 allowed
              // inheritance for a single-property inner literal; round 2
              // showed that carve-out was a live bypass (a lone
              // `{ fictionOnly: 'made-up' }` inside an existing guard bound
              // fiction to the guard's wire field) AND unnecessary (every
              // legitimate conditional-spread property reads its wire field
              // in its own initializer, so the clean tree passes without
              // it). A property with no own access binds to nothing and
              // fails closed as unresolvable downstream.
              addBinding(bindings, name, collectAccesses(inner.initializer, 'data'));
            }
            return;
          }
          ts.forEachChild(n, findInner);
        }
        findInner(prop.expression);
        if (!sawInner) {
          // A spread we cannot see through would hide bindings; that is
          // an unresolvable shape, so surface it loudly.
          throw new Error(
            `audit-binding: opaque spread in ${method.name.text} return literal - ` +
              'cannot resolve bindings statically. Use the conditional-spread-with-' +
              'inner-literal shape or extend scripts/audit-binding/check.js.'
          );
        }
      }
      // Shorthand in the read transformer would be unresolvable; it will
      // surface as a model prop with no binding and fail closed.
    }
  }

  function visit(n) {
    if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
      harvestLiteral(n.expression);
    }
    if (ts.isFunctionLike(n) && n !== method) return;
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(method.body, visit);
  return bindings;
}

/**
 * SEARCH request: walk the serializer's body-building statements.
 *   - `const body = { limit }`            -> limit -> limit
 *   - `body.user_email = request.userEmail` -> userEmail -> user_email
 *   - `body.offset = offset`              -> offset -> offset (identifier
 *     matching a model prop name)
 */
function extractSearchRequestBindings(method, modelProps) {
  const bindings = new Map();
  const modelSet = new Set(modelProps);

  function visit(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'body' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const prop of n.initializer.properties) {
        if (ts.isShorthandPropertyAssignment(prop) && modelSet.has(prop.name.text)) {
          addBinding(bindings, prop.name.text, [prop.name.text]);
        } else if (ts.isPropertyAssignment(prop) && prop.name) {
          const wire = prop.name.text || prop.name.escapedText?.toString();
          const reqAccesses = collectAccesses(prop.initializer, 'request');
          for (const p of reqAccesses) addBinding(bindings, p, [wire]);
          if (reqAccesses.size === 0 && ts.isIdentifier(prop.initializer) && modelSet.has(prop.initializer.text)) {
            addBinding(bindings, prop.initializer.text, [wire]);
          }
        }
      }
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      ts.isIdentifier(n.left.expression) &&
      n.left.expression.text === 'body'
    ) {
      const wire = n.left.name.text;
      const reqAccesses = collectAccesses(n.right, 'request');
      if (reqAccesses.size > 0) {
        for (const p of reqAccesses) addBinding(bindings, p, [wire]);
      } else if (ts.isIdentifier(n.right) && modelSet.has(n.right.text)) {
        addBinding(bindings, n.right.text, [wire]);
      }
    }
    if (ts.isFunctionLike(n) && n !== method) return;
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(method.body, visit);
  return bindings;
}

/**
 * RESPONSE model: walk every return object literal; bind each property
 * through the `data.<wire>` accesses in its initializer, resolving
 * shorthand properties through their local variable initializers.
 * A property is bound if ANY return path binds it.
 */
function extractResponseBindings(method) {
  const bindings = new Map();
  const locals = new Map();

  function collectLocals(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      locals.set(n.name.text, n.initializer);
    }
    if (ts.isFunctionLike(n) && n !== method) return;
    ts.forEachChild(n, collectLocals);
  }
  ts.forEachChild(method.body, collectLocals);

  function visit(n) {
    if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
      for (const prop of n.expression.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name) {
          const name = prop.name.text || prop.name.escapedText?.toString();
          if (!name) continue;
          addBinding(bindings, name, collectAccesses(prop.initializer, 'data'));
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          const name = prop.name.text;
          const init = locals.get(name);
          addBinding(bindings, name, init ? collectAccesses(init, 'data') : []);
        }
      }
    }
    if (ts.isFunctionLike(n) && n !== method) return;
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(method.body, visit);
  return bindings;
}

// ---------------------------------------------------------------------------
// Spec fixture (vendored, cross-checked against the live pinned spec)
// ---------------------------------------------------------------------------

const SURFACE = [
  { type: 'AuditLogEntry', transformer: 'parseAuditLogEntry', kind: 'read' },
  { type: 'AuditSearchRequest', transformer: 'searchAuditLogs', kind: 'request' },
  { type: 'AuditSearchResponse', transformer: 'searchAuditLogs', kind: 'response' },
  // #3254 pin-advance batch: masfeat read models. OJKAuditExportResponse is
  // in the pinned spec but this SDK does not model it (zero references), so
  // there is nothing to bind for it.
  { type: 'RegistrySummary', transformer: 'masfeatGetRegistrySummary', kind: 'read' },
  { type: 'AISystemRegistry', transformer: 'mapSystemResponse', kind: 'read' },
  { type: 'KillSwitch', transformer: 'mapKillSwitchResponse', kind: 'read' },
];

function pinnedSha() {
  const baseline = JSON.parse(fs.readFileSync(WIRE_SHAPE_BASELINE, 'utf8'));
  const sha = (baseline.openapi_specs_sha || '').trim();
  if (!sha) {
    throw new Error('audit-binding: wire-shape baseline has no openapi_specs_sha.');
  }
  return sha;
}

function vendorFixture(specsDir) {
  const { merged } = loadAllSchemas(specsDir);
  const schemas = {};
  for (const { type } of SURFACE) {
    if (!merged[type]) {
      throw new Error(`audit-binding: schema '${type}' not found in specs at ${specsDir}.`);
    }
    schemas[type] = merged[type];
  }
  const fixture = {
    _comment:
      'Audit-surface schemas vendored from the pinned OpenAPI specs so the ' +
      'binding gate always runs (no env-dependent skip). Regenerate with: ' +
      'AXONFLOW_OPENAPI_SPECS_DIR=<docs/api at the pinned SHA> ' +
      'node scripts/audit-binding/check.js --vendor',
    openapi_specs_sha: pinnedSha(),
    schemas,
  };
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Vendored ${Object.keys(schemas).length} schema(s) into ${FIXTURE_PATH}`);
}

function loadSpecSchemas() {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `audit-binding: vendored spec fixture missing at ${FIXTURE_PATH}. ` +
        'Regenerate with --vendor against the pinned specs.'
    );
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const sha = pinnedSha();
  if (fixture.openapi_specs_sha !== sha) {
    throw new Error(
      `audit-binding: vendored fixture pinned to ${fixture.openapi_specs_sha} but ` +
        `wire-shape baseline pins ${sha}. Re-vendor the fixture in the spec-pin-bump PR.`
    );
  }
  const specsDir = process.env.AXONFLOW_OPENAPI_SPECS_DIR;
  if (specsDir && (!fs.existsSync(specsDir) || !fs.statSync(specsDir).isDirectory())) {
    // R3 round 1: a set-but-broken specs dir must not silently downgrade
    // to vendored-only mode - in CI that would skip the fixture-vs-live
    // cross-check while looking green. Env UNSET remains the designed
    // vendored-only local mode.
    throw new Error(
      `audit-binding: AXONFLOW_OPENAPI_SPECS_DIR is set to '${specsDir}' but that is not ` +
        'an existing directory. Fix the path (or unset the variable for vendored-only mode); ' +
        'refusing to skip the fixture-vs-live-spec cross-check silently.'
    );
  }
  if (specsDir) {
    const { merged } = loadAllSchemas(specsDir);
    for (const { type } of SURFACE) {
      const live = merged[type];
      const vendored = fixture.schemas[type];
      if (!live) {
        throw new Error(`audit-binding: schema '${type}' missing from live specs at ${specsDir}.`);
      }
      if (JSON.stringify(live) !== JSON.stringify(vendored)) {
        throw new Error(
          `audit-binding: vendored fixture for '${type}' diverges from the live pinned spec.\n` +
            `  vendored: ${JSON.stringify(vendored)}\n` +
            `  live:     ${JSON.stringify(live)}\n` +
            'Re-vendor with --vendor (in a spec-pin-bump PR if the pin moved).'
        );
      }
    }
    console.log('Vendored fixture cross-checked against live pinned specs: identical.');
  }
  return fixture.schemas;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--vendor')) {
    const specsDir = process.env.AXONFLOW_OPENAPI_SPECS_DIR;
    if (!specsDir) {
      console.error('--vendor requires AXONFLOW_OPENAPI_SPECS_DIR.');
      process.exit(2);
    }
    vendorFixture(specsDir);
    return;
  }
  const useAllowlist = !args.includes('--no-allowlist');

  let schemas;
  try {
    schemas = loadSpecSchemas();
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    process.exit(1);
  }

  const clientSource = loadClientSource();
  const failures = [];
  const debt = [];
  const info = [];

  for (const { type, transformer, kind } of SURFACE) {
    const iface = readInterface(type);
    if (!iface) {
      failures.push(`${type}: interface not found under src/types/ (searched recursively).`);
      continue;
    }
    const specFields = new Set(schemas[type] || []);
    if (specFields.size === 0) {
      failures.push(`${type}: no spec schema fields in vendored fixture.`);
      continue;
    }
    const method = findMethod(clientSource, transformer);
    if (!method) {
      failures.push(`${type}: transformer method '${transformer}' not found in src/client.ts.`);
      continue;
    }

    let bindings;
    try {
      if (kind === 'read') bindings = extractReadModelBindings(method);
      else if (kind === 'request') bindings = extractSearchRequestBindings(method, iface.properties);
      else bindings = extractResponseBindings(method);
    } catch (e) {
      failures.push(`${type}: ${e.message}`);
      continue;
    }
    if (bindings.size === 0) {
      failures.push(`${type}: extracted ZERO transformer bindings from '${transformer}' - gate cannot bind, failing closed.`);
      continue;
    }

    const allowed = (useAllowlist && ALLOWED_UNSERVED[type]) || {};
    const boundWires = new Set();

    for (const prop of iface.properties) {
      const wires = bindings.get(prop);
      if (!wires || wires.size === 0) {
        failures.push(
          `${type}.${prop}: UNRESOLVABLE - model property has no transformer mapping in '${transformer}'. ` +
            'A typed field the runtime never populates/serializes is exactly the #3254 failure class.'
        );
        continue;
      }
      for (const wire of wires) {
        boundWires.add(wire);
        if (specFields.has(wire)) continue;
        if (Object.prototype.hasOwnProperty.call(allowed, wire)) {
          if (!iface.deprecated.has(prop)) {
            failures.push(
              `${type}.${prop} -> '${wire}': allowlisted as unserved debt but the model property is not marked @deprecated. ` +
                'Allowlist entries name debt; the model must carry the deprecation.'
            );
          } else {
            debt.push(`${type}.${prop} -> '${wire}': ${allowed[wire]}`);
          }
          continue;
        }
        failures.push(
          `${type}.${prop} -> '${wire}': model declares a wire field ABSENT from the pinned spec schema ` +
            `(${type}). The server does not serve/read it - fiction field (#3254 class).`
        );
      }
    }

    // Allowlist hygiene: entries must stay live in both directions.
    for (const wire of Object.keys(allowed)) {
      if (specFields.has(wire)) {
        failures.push(
          `${type}: allowlist entry '${wire}' is STALE - the pinned spec now serves it. Remove the entry.`
        );
      } else if (!boundWires.has(wire)) {
        failures.push(
          `${type}: allowlist entry '${wire}' is STALE - no model property maps to it any more. Remove the entry.`
        );
      }
    }

    const missed = [...specFields].filter((f) => !boundWires.has(f)).sort();
    if (missed.length > 0) {
      info.push(`${type}: spec fields not modeled (informational): ${JSON.stringify(missed)}`);
    }
  }

  console.log('audit-binding gate: model -> transformer -> pinned spec');
  console.log(`  surface: ${SURFACE.map((s) => s.type).join(', ')}`);
  if (debt.length > 0) {
    console.log('\nKnown debt (allowlisted, deprecated on the model):');
    for (const d of debt) console.log(`  ~ ${d}`);
  }
  if (info.length > 0) {
    console.log('\nInformational:');
    for (const i of info) console.log(`  i ${i}`);
  }
  if (failures.length > 0) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  x ${f}`);
    console.error(`\nFAIL audit-binding gate: ${failures.length} binding violation(s).`);
    process.exit(1);
  }
  console.log('\nPASS audit-binding gate: every model wire field resolves to the pinned spec.');
}

main();
