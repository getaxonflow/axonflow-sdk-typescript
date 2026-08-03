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
const GATEWAY_TS = path.join(SDK_ROOT, 'src', 'types', 'gateway.ts');
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
};

// ---------------------------------------------------------------------------
// Model discovery (interface properties + @deprecated marks)
// ---------------------------------------------------------------------------

function readInterface(typeName) {
  const text = fs.readFileSync(GATEWAY_TS, 'utf8');
  const sourceFile = ts.createSourceFile(GATEWAY_TS, text, ts.ScriptTarget.Latest, true);
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === typeName) {
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
        const spreadWires = collectAccesses(prop.expression, 'data');
        let sawInner = false;
        function findInner(n) {
          if (ts.isObjectLiteralExpression(n)) {
            sawInner = true;
            for (const inner of n.properties) {
              if (ts.isPropertyAssignment(inner) && inner.name) {
                const name = inner.name.text || inner.name.escapedText?.toString();
                if (!name) continue;
                const wires = collectAccesses(inner.initializer, 'data');
                addBinding(bindings, name, wires.size > 0 ? wires : spreadWires);
              }
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
  if (specsDir && fs.existsSync(specsDir) && fs.statSync(specsDir).isDirectory()) {
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
      failures.push(`${type}: interface not found in src/types/gateway.ts.`);
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
