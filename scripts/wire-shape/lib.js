/**
 * Shared helpers for the wire-shape contract CI (QF-15 TypeScript arm).
 *
 * Used by:
 * - scripts/wire-shape/validate.js  (the PR-blocking gate)
 * - scripts/wire-shape/refresh.js   (the baseline regenerator)
 *
 * Mirrors the structure of axonflow-sdk-python's tests/test_wire_shape.py
 * and axonflow-sdk-go's internal/wireshape package so the three SDKs'
 * gates stay conceptually aligned. See the Python/Go equivalents for
 * the design rationale; short version:
 *
 *   - "wire shape" = the set of property names that go on the JSON wire
 *   - authoritative source = OpenAPI spec, loaded from the getaxonflow/
 *     axonflow community mirror pinned via `openapi_specs_sha` in the
 *     baseline JSON
 *   - gate fails on drift NOT covered by the baseline; existing drift
 *     is burned down over time through targeted follow-up PRs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const YAML = require('yaml');

const SDK_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(SDK_ROOT, 'src');
const CLIENT_TS = path.join(SRC_DIR, 'client.ts');
const BASELINE_PATH = path.join(SDK_ROOT, 'tests', 'fixtures', 'wire-shape-baseline.json');

/**
 * Convert a camelCase identifier to snake_case. Handles three boundaries:
 * - acronym → word: `AIRequest` → `AI_Request` (preserves consecutive caps)
 * - lowercase → uppercase: `myField` → `my_Field`
 * - lowercase letter → digit: `per1k` → `per_1k`
 *
 * Digit → lowercase letter is intentionally NOT a boundary so that
 * `1k` stays as a unit-suffix (matches OpenAPI convention `input_per_1k`,
 * `tokens_per_1k`, etc.).
 */
function toSnakeCase(s) {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([a-z])(\d)/g, '$1_$2')
    .toLowerCase();
}

/**
 * Read src/client.ts (the hand-rolled snake_case ↔ camelCase
 * transformer surface) and return a Set of every snake_case identifier
 * that appears anywhere in the file. Used as the safety-net check for
 * the case-normalizer below: we only treat a TS interface field as
 * "bridged to its snake_case wire form" if the snake form actually
 * appears in client.ts. Without this guard a missing transformer would
 * pass the gate by silent normalization.
 */
function loadTransformerEvidence() {
  if (!fs.existsSync(CLIENT_TS)) {
    return new Set();
  }
  const content = fs.readFileSync(CLIENT_TS, 'utf8');
  // Snake-case-shaped identifier: starts with a lowercase letter, must
  // contain at least one underscore, lowercase + digits + underscores
  // only. Avoids matching uppercase constants like `MAX_RETRIES`.
  const matches = content.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) || [];
  return new Set(matches);
}

/**
 * Load every *.yaml in specDir. Returns {merged, crossSpecDuplicates,
 * intraFileDuplicates}.
 *
 * - merged[name] = sorted field names; last-loaded declaration wins on
 *   cross-spec name collision (matches Python/Go behavior).
 * - crossSpecDuplicates[name] = {specFile: [fields]} for schemas that
 *   appear in >1 file with DIFFERENT shapes. Identical redundant
 *   declarations are benign and filtered out.
 * - intraFileDuplicates[file][name] = count of declarations for
 *   schemas declared >1 time in a single file. YAML parsers normally
 *   collapse duplicate keys silently (seen with the real PolicyMatch
 *   duplicate in orchestrator-api.yaml); we walk the YAML document
 *   node tree manually so the gate can see those collisions.
 */
function loadAllSchemas(specDir) {
  const merged = {};
  const allDecls = {};
  const intraFileDuplicates = {};

  const names = fs.readdirSync(specDir)
    .filter((n) => n.endsWith('.yaml'))
    .sort();

  for (const name of names) {
    const full = path.join(specDir, name);
    const text = fs.readFileSync(full, 'utf8');
    const doc = YAML.parseDocument(text);
    const schemasNode = findSchemasNode(doc);
    if (!schemasNode) {
      continue;
    }

    const intraCounts = {};
    for (const pair of schemasNode.items) {
      const schemaName = pair.key?.value;
      if (typeof schemaName !== 'string') {
        continue;
      }
      intraCounts[schemaName] = (intraCounts[schemaName] || 0) + 1;

      const schemaValue = pair.value;
      if (!schemaValue || !schemaValue.items) {
        continue;
      }
      const propsNode = findMapChild(schemaValue, 'properties');
      if (!propsNode || !propsNode.items) {
        continue;
      }
      const fields = propsNode.items
        .map((p) => p.key?.value)
        .filter((v) => typeof v === 'string')
        .sort();
      if (fields.length === 0) {
        continue;
      }
      if (!allDecls[schemaName]) {
        allDecls[schemaName] = {};
      }
      allDecls[schemaName][name] = fields;
      merged[schemaName] = fields;
    }

    for (const [schemaName, count] of Object.entries(intraCounts)) {
      if (count > 1) {
        if (!intraFileDuplicates[name]) {
          intraFileDuplicates[name] = {};
        }
        intraFileDuplicates[name][schemaName] = count;
      }
    }
  }

  const crossSpecDuplicates = {};
  for (const [schemaName, decls] of Object.entries(allDecls)) {
    const specFiles = Object.keys(decls);
    if (specFiles.length < 2) {
      continue;
    }
    const shapes = new Set(specFiles.map((f) => decls[f].join('|')));
    if (shapes.size > 1) {
      crossSpecDuplicates[schemaName] = decls;
    }
  }

  return { merged, crossSpecDuplicates, intraFileDuplicates };
}

function findSchemasNode(doc) {
  // doc.contents is a YAMLMap
  const top = doc.contents;
  if (!top || !top.items) {
    return null;
  }
  const components = findMapChild(top, 'components');
  if (!components || !components.items) {
    return null;
  }
  const schemas = findMapChild(components, 'schemas');
  if (!schemas || !schemas.items) {
    return null;
  }
  return schemas;
}

function findMapChild(mapNode, key) {
  if (!mapNode || !mapNode.items) {
    return null;
  }
  for (const pair of mapNode.items) {
    if (pair.key?.value === key) {
      return pair.value;
    }
  }
  return null;
}

/**
 * Walk src/**\/*.ts and return {InterfaceName: sortedPropertyNames}
 * for every top-level exported interface with at least one property.
 *
 * Uses the TypeScript compiler API (ts.createSourceFile +
 * ts.forEachChild) rather than regex parsing so nested types,
 * computed property names, and JSDoc-decorated fields are handled
 * correctly. Covers:
 *   - export interface Foo { ... }
 *   - export type Foo = { ... } (type-alias object literals)
 *
 * Skips:
 *   - union/discriminated types: export type Foo = 'a' | 'b'
 *   - non-exported declarations
 *   - .test.ts and .d.ts files
 */
function discoverSDKInterfaces() {
  const result = {};
  walkTsFiles(SRC_DIR, (filePath) => {
    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    ts.forEachChild(sourceFile, (node) => collectTopLevelTypes(node, result));
  });
  return canonicalizeWireNames(result);
}

/**
 * Canonicalize each TS interface field name to its on-the-wire form.
 *
 * The TS SDK convention is camelCase TS properties + hand-rolled
 * snake_case transformers in client.ts. Comparing TS in-memory names
 * to OpenAPI wire names produces false drift (cosmetic camelCase ↔
 * snake_case mismatches that the transformers already bridge).
 *
 * For each TS field name:
 *   - If it's already snake_case, keep it.
 *   - If its snake_case form appears in client.ts (transformer
 *     evidence), output the snake_case form.
 *   - If it's camelCase but no transformer evidence is found, emit a
 *     console.warn and KEEP the camelCase name. The validator will
 *     then surface this as drift, which is the correct behavior — a
 *     camelCase TS field with no bridging transformer means the SDK
 *     is wired to read/write camelCase on the wire, which won't match
 *     a snake_case OpenAPI spec.
 *
 * Mirrors the wire-name extraction the Python (pydantic alias),
 * Go (`json:"…"` tag), and Java (`@JsonProperty(…)`) discovery layers
 * already do natively.
 */
function canonicalizeWireNames(typeMap) {
  const evidence = loadTransformerEvidence();
  const out = {};
  // Per-type unbridged tracker — used downstream to suppress noise on
  // SDK-internal config types (every field camelCase, none bridged) and
  // surface only the wire-bound types where a transformer is missing.
  const unbridgedByType = {};
  for (const [typeName, fields] of Object.entries(typeMap)) {
    const canonical = new Set();
    let bridged = 0;
    const unbridgedHere = [];
    for (const field of fields) {
      const snake = toSnakeCase(field);
      if (snake === field) {
        // Already snake_case or a single word — no normalization needed.
        canonical.add(field);
        continue;
      }
      if (evidence.has(snake)) {
        canonical.add(snake);
        bridged += 1;
      } else {
        unbridgedHere.push(field);
        canonical.add(field);
      }
    }
    out[typeName] = [...canonical].sort();
    // Only flag a type as having unbridged fields if at least one OTHER
    // field in the same type IS bridged. If no field is bridged, the
    // type is almost certainly SDK-internal (configs, options, adapter
    // metadata) and the whole type isn't wire-bound — there's nothing
    // for a transformer to bridge against.
    if (unbridgedHere.length > 0 && bridged > 0) {
      unbridgedByType[typeName] = unbridgedHere;
    }
  }
  const unbridgedFlat = Object.entries(unbridgedByType).flatMap(([t, fs]) =>
    fs.map((f) => `${t}.${f}`),
  );
  if (unbridgedFlat.length > 0) {
    console.warn(
      `wire-shape: ${unbridgedFlat.length} TS field(s) on wire-bound types ` +
        `are camelCase with no snake_case transformer evidence in client.ts; ` +
        `keeping camelCase (may surface as drift):\n  ${unbridgedFlat
          .slice(0, 20)
          .join('\n  ')}` +
        (unbridgedFlat.length > 20
          ? `\n  ... and ${unbridgedFlat.length - 20} more`
          : ''),
    );
  }
  return out;
}

function walkTsFiles(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, cb);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      cb(full);
    }
  }
}

function collectTopLevelTypes(node, out) {
  if (!hasExportModifier(node)) {
    return;
  }
  if (ts.isInterfaceDeclaration(node)) {
    const fields = extractInterfaceProps(node);
    if (fields.length > 0) {
      out[node.name.text] = fields;
    }
    return;
  }
  if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
    const fields = extractTypeLiteralProps(node.type);
    if (fields.length > 0) {
      out[node.name.text] = fields;
    }
  }
}

function hasExportModifier(node) {
  return (
    node.modifiers &&
    node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function extractInterfaceProps(iface) {
  // A `heritageClauses` (e.g. `interface Foo extends Bar`) means the
  // interface inherits members from its parents that we won't see by
  // walking iface.members alone. The wire-shape gate would then
  // under-report fields and silently miss drift on inherited
  // properties. The TS SDK has no such interfaces today; flag it
  // loudly the first time one appears so coverage gets resolved
  // before it ships, instead of slipping past as invisible
  // under-counting.
  if (iface.heritageClauses && iface.heritageClauses.length > 0) {
    const parents = [];
    for (const clause of iface.heritageClauses) {
      for (const t of clause.types || []) {
        const expr = t.expression;
        if (expr && ts.isIdentifier(expr)) {
          parents.push(expr.text);
        }
      }
    }
    console.warn(
      `wire-shape: interface ${iface.name.text} extends [${parents.join(', ')}]; ` +
        'inherited fields are NOT walked. Add explicit field flattening to ' +
        'scripts/wire-shape/lib.js::extractInterfaceProps before merging an ' +
        'extending wire interface, or wire-shape coverage will be incomplete.',
    );
  }
  const names = [];
  for (const member of iface.members) {
    const name = propertyName(member);
    if (name !== null) {
      names.push(name);
    }
  }
  names.sort();
  return names;
}

function extractTypeLiteralProps(typeLit) {
  const names = [];
  for (const member of typeLit.members) {
    const name = propertyName(member);
    if (name !== null) {
      names.push(name);
    }
  }
  names.sort();
  return names;
}

function propertyName(member) {
  if (!ts.isPropertySignature(member) || !member.name) {
    return null;
  }
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
    return member.name.text;
  }
  // Computed names like [K in keyof T] — skip.
  return null;
}

/**
 * Baseline structure mirrors Python's tests/fixtures/wire_shape_baseline.json
 * and Go's testdata/wire_shape_baseline.json so all three SDKs'
 * tooling can speak the same format.
 */
function emptyBaseline() {
  return {
    openapi_specs_sha: '',
    cross_spec_duplicates: {},
    intra_file_duplicates: {},
    registered_types: [],
    per_type_drift: {},
  };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return emptyBaseline();
  }
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  return {
    ...emptyBaseline(),
    ...parsed,
    cross_spec_duplicates: parsed.cross_spec_duplicates || {},
    intra_file_duplicates: parsed.intra_file_duplicates || {},
    registered_types: parsed.registered_types || [],
    per_type_drift: parsed.per_type_drift || {},
  };
}

function writeBaseline(baseline) {
  const dir = path.dirname(BASELINE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${BASELINE_PATH}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(baseline, null, 2) + '\n');
    fs.renameSync(tmp, BASELINE_PATH);
  } catch (e) {
    // Don't leave a `.tmp.<pid>` sidecar behind — the next run from
    // the same PID would collide and confuse a future writer.
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* tmp may not exist yet; ignore */
    }
    throw e;
  }
}

function difference(a, b) {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x)).sort();
}

module.exports = {
  loadAllSchemas,
  discoverSDKInterfaces,
  loadBaseline,
  writeBaseline,
  emptyBaseline,
  difference,
  SDK_ROOT,
  SRC_DIR,
  BASELINE_PATH,
};
