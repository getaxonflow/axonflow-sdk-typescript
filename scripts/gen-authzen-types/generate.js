#!/usr/bin/env node
/**
 * Emit this SDK's AuthZEN wire types from the platform's canonical artifact.
 *
 * # Why the types are generated rather than written
 *
 * The AuthZEN surface ships in five SDKs. Hand-transcribing the same twenty
 * shapes five times produces five slightly different opinions about which
 * fields are optional, and the resulting drift does not look like a bug: it
 * looks like one SDK marking a field required that the others mark optional,
 * discovered by a customer whose request is rejected by a server another SDK
 * talks to happily. The platform reduces its canonical JSON Schema to
 * `platform/decision/surface/authzen-surface.json`; every SDK vendors that one
 * file and generates from it, and every SDK's CI regenerates and diffs.
 *
 * # Why it emits VALIDATORS, not only interfaces
 *
 * A TypeScript interface is erased at runtime. `JSON.parse(body) as
 * AuthZENResponse` is a claim, not a check: a decision missing its operational
 * state, or carrying a member this build has never heard of, satisfies the
 * compiler and reaches the caller. The generated validators are the only place
 * this SDK can actually refuse a body it cannot interpret, so they are
 * generated from the same artifact as the interfaces and cannot drift from
 * them.
 *
 * # The generated file is committed
 *
 * A consumer running `npm install @axonflow/sdk` must receive working types
 * without running a generator, so the output is committed. That is only worth
 * something if something proves the committed bytes are the output of the
 * committed input, which tests/authzen-generator.test.ts does.
 *
 * Usage:
 *   node scripts/gen-authzen-types/generate.js           # write the module
 *   node scripts/gen-authzen-types/generate.js --check   # fail if out of date
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SURFACE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'authzen-surface.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src', 'types', 'authzen.gen.ts');
const SURFACE_REL = 'tests/fixtures/authzen-surface.json';

// The artifact name and format version this emitter understands. A format
// change is a deliberate migration, not something to generate through: types
// that look right and describe a different contract are worse than a build
// failure.
const SUPPORTED_ARTIFACT = 'axonflow-authzen-surface';
const SUPPORTED_ARTIFACT_VERSION = 1;

// The sha256 of the vendored artifact FILE, verified byte-for-byte against
// `platform/decision/surface/authzen-surface.json` on axonflow-enterprise main
// (commit afff5d1a0), against the copy in axonflow-sdk-go, and against the copy
// in axonflow-sdk-python.
//
// This is the only control that pins FIDELITY. The regeneration gate answers
// "is the committed module the output of the committed artifact"; it says
// nothing about whether the committed artifact is the platform's, and an edit to
// the vendored file plus a regeneration satisfies it completely. The artifact's
// own `source_schema_sha256` cannot close that gap either: it is a string inside
// the file, so it moves with any edit that bothers to change it. Only a digest
// recorded OUTSIDE the file does.
//
// Bumping it is the deliberate act of re-vendoring: re-copy from the platform,
// update this constant, regenerate, and name the platform commit in the PR.
const VENDORED_ARTIFACT_SHA256 = '7f768b8ad0d6278d3531e1410decad172459808ebda627da44dca5bb4c9f36f8';

// The column limit prettier is configured with. Generated code is formatted and
// linted like every other module here, so the emitter has to respect it: a file
// nobody may hand-edit cannot be fixed by hand when it fails `format:check`.
const MAX_COLUMNS = 100;

const SURFACE_MEMBERS = new Set([
  'artifact',
  'artifact_version',
  'profile',
  'contract_schema_version',
  'source_schema_id',
  'source_schema_sha256',
  'enums',
  'types',
]);
const ENUM_MEMBERS = new Set(['name', 'doc', 'values']);
const TYPE_MEMBERS = new Set(['name', 'doc', 'fields', 'exactly_one_of']);
const FIELD_MEMBERS = new Set([
  'name',
  'doc',
  'required',
  'type',
  'min_items',
  'min_length',
  'requires_members',
  'const',
]);
const TYPEREF_MEMBERS = new Set(['kind', 'ref', 'enum', 'items', 'value']);

const SCALAR_TS = { string: 'string', bool: 'boolean', int: 'number' };

class SurfaceError extends Error {}

// Reserved words plus the members every object already carries. A field named
// `constructor` or `__proto__` generates "successfully" and produces an
// interface whose validator writes over machinery the runtime owns.
const RESERVED_FIELD_NAMES = new Set([
  'constructor',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
]);

// A TypeScript property name this emitter is willing to write unquoted.
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Refuse doc text this emitter cannot safely place in a block comment.
 *
 * The artifact is first-party, so the realistic failure is the benign one: a
 * `*​/` arriving in a platform doc comment ends the emitted comment early and
 * the module stops compiling. "The emitter refuses what it cannot render" is
 * this file's own claim, and it did not hold for any string it copied.
 */
function checkDoc(where, doc) {
  if (doc.includes('*/')) {
    throw new SurfaceError(
      `${where}: the doc text contains "*/", which would end the emitted block comment ` +
        `early and change what the generated module means`
    );
  }
}

/** Refuse a value this emitter cannot safely place in a string literal. */
function checkLiteral(where, value) {
  if (/['"\\\n\r`$]/.test(value)) {
    throw new SurfaceError(
      `${where}: the value ${JSON.stringify(value)} carries a quote, a backslash, a newline ` +
        `or a template-literal metacharacter, which this emitter will not put inside a ` +
        `generated string literal`
    );
  }
}

/** Refuse a name that cannot become a TypeScript property. */
function checkIdentifier(where, name) {
  if (!IDENTIFIER.test(name)) {
    throw new SurfaceError(
      `${where}: ${JSON.stringify(name)} is not a valid TypeScript identifier, so it cannot ` +
        `become an interface member this emitter writes unquoted`
    );
  }
  if (RESERVED_FIELD_NAMES.has(name)) {
    throw new SurfaceError(
      `${where}: ${JSON.stringify(name)} is a member every object already carries; a ` +
        `generated validator writing to it would write over machinery the runtime owns`
    );
  }
}

/** Read a numeric bound, refusing one that would silently do nothing. */
function parseBound(where, member, raw) {
  if (!(member in raw)) return 0;
  const value = raw[member];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SurfaceError(`${where}: \`${member}\` must be a JSON integer, got ${value}`);
  }
  if (value < 0) {
    throw new SurfaceError(
      `${where}: \`${member}\` is ${value}; a negative bound reads as a constraint and ` +
        `disables one`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Refuse an artifact member this emitter does not understand.
 *
 * Strictness is the point. A member the platform added and this emitter
 * ignores is a construct this SDK would silently omit — the
 * declared-but-never-emitted class, arriving through the generator built to
 * prevent it. Failing here costs one obvious CI error; ignoring it costs a
 * field four other SDKs have and this one does not.
 */
function rejectUnknown(where, obj, known) {
  const unknown = Object.keys(obj)
    .filter(key => !known.has(key))
    .sort();
  if (unknown.length > 0) {
    throw new SurfaceError(
      `${where}: the artifact carries ${JSON.stringify(unknown)}, which this emitter does ` +
        `not understand. Generating around it would silently drop it from this SDK.`
    );
  }
}

function parseTypeRef(where, raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SurfaceError(`${where}: a type must be an object`);
  }
  rejectUnknown(where, raw, TYPEREF_MEMBERS);
  if (typeof raw.kind !== 'string' || raw.kind === '') {
    throw new SurfaceError(`${where}: a type must name a kind`);
  }
  return {
    kind: raw.kind,
    ref: raw.ref || '',
    enum: raw.enum || '',
    items: 'items' in raw ? parseTypeRef(`${where}[]`, raw.items) : null,
    value: 'value' in raw ? parseTypeRef(`${where}{}`, raw.value) : null,
  };
}

function parseField(where, raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SurfaceError(`${where}: a field must be an object`);
  }
  rejectUnknown(where, raw, FIELD_MEMBERS);
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw new SurfaceError(`${where}: a field must be named`);
  }
  const at = `${where}.${raw.name}`;
  checkIdentifier(at, raw.name);
  const doc = raw.doc || '';
  checkDoc(at, doc);
  const constValue = raw.const || '';
  if (constValue) checkLiteral(`${at}.const`, constValue);
  // `required` is read STRICTLY, matching the sibling emitter. A coerced read
  // (Python's `bool("false")` is True) makes the string "false" mean required in
  // one SDK and optional in the other, from one artifact, with both regeneration
  // gates green.
  if ('required' in raw && typeof raw.required !== 'boolean') {
    throw new SurfaceError(`${at}: \`required\` must be a JSON boolean, got ${raw.required}`);
  }
  const type = parseTypeRef(at, raw.type);
  const minItems = parseBound(at, 'min_items', raw);
  const minLength = parseBound(at, 'min_length', raw);
  // A bound the emitter would silently drop is worse than one it cannot render:
  // a `min_length` on a bool looks like a live constraint in the artifact and
  // enforces nothing in the SDK.
  if (minItems && type.kind !== 'array') {
    throw new SurfaceError(
      `${at}: \`min_items\` is declared on a ${type.kind} field; it is only meaningful on ` +
        `an array, and emitting nothing for it would leave a constraint the artifact ` +
        `declares and no SDK enforces`
    );
  }
  if (minLength && type.kind !== 'string' && type.kind !== 'enum') {
    throw new SurfaceError(
      `${at}: \`min_length\` is declared on a ${type.kind} field; it is only meaningful on ` +
        `a string, and emitting nothing for it would leave a constraint the artifact ` +
        `declares and no SDK enforces`
    );
  }
  const requiresMembers = raw.requires_members || [];
  if (new Set(requiresMembers).size !== requiresMembers.length) {
    throw new SurfaceError(`${at}: \`requires_members\` names the same member twice`);
  }
  return {
    name: raw.name,
    required: raw.required === true,
    type,
    doc,
    minItems,
    minLength,
    requiresMembers,
    const: constValue,
  };
}

function parseEnum(raw, seen) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SurfaceError('an enum must be an object');
  }
  rejectUnknown('enum', raw, ENUM_MEMBERS);
  const name = raw.name || '';
  const values = raw.values || [];
  if (!name) throw new SurfaceError('an enum must be named');
  if (seen.has(name)) throw new SurfaceError(`the artifact declares the enum "${name}" twice`);
  if (values.length === 0) throw new SurfaceError(`enum "${name}" has no values`);
  if (new Set(values).size !== values.length) {
    throw new SurfaceError(`enum "${name}" repeats a value`);
  }
  seen.add(name);
  const doc = raw.doc || '';
  checkDoc(`enum ${name}`, doc);
  values.forEach(value => checkLiteral(`enum ${name}`, value));
  return { name, values, doc };
}

function parseType(raw, seen) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SurfaceError('a type must be an object');
  }
  rejectUnknown('type', raw, TYPE_MEMBERS);
  const name = raw.name || '';
  if (!name) throw new SurfaceError('a type must be named');
  if (seen.has(name)) throw new SurfaceError(`the artifact declares the type "${name}" twice`);
  seen.add(name);
  const fields = (raw.fields || []).map(field => parseField(name, field));
  if (fields.length === 0) throw new SurfaceError(`type "${name}" has no fields`);
  const fieldNames = fields.map(field => field.name);
  if (new Set(fieldNames).size !== fieldNames.length) {
    throw new SurfaceError(`type "${name}" declares a field twice`);
  }
  const exactlyOneOf = (raw.exactly_one_of || []).map(group => {
    if (group.length < 2) {
      throw new SurfaceError(
        `type "${name}" has an exactly-one-of group with ${group.length} members`
      );
    }
    if (new Set(group).size !== group.length) {
      throw new SurfaceError(
        `type "${name}" names the same member twice in an exactly-one-of group; one member ` +
          `cannot be present exactly twice, so the emitted type could never be built`
      );
    }
    group.forEach(member => {
      if (!fieldNames.includes(member)) {
        throw new SurfaceError(
          `type "${name}" names "${member}" in an exactly-one-of group but has no such field`
        );
      }
    });
    return group;
  });
  const doc = raw.doc || '';
  checkDoc(`type ${name}`, doc);
  return { name, fields, doc, exactlyOneOf };
}

/**
 * Decode the artifact strictly and check that it hangs together.
 *
 * Every reference must resolve inside the document. A dangling one would
 * otherwise become a TypeScript name that does not exist, and the failure would
 * surface as a compile error in generated code rather than as a statement about
 * the artifact.
 */
function parseSurface(rawText) {
  let doc;
  try {
    doc = JSON.parse(rawText);
  } catch (err) {
    throw new SurfaceError(`the surface artifact is not valid JSON: ${err.message}`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new SurfaceError('the surface artifact must be a JSON object');
  }
  rejectUnknown('artifact', doc, SURFACE_MEMBERS);

  const enumNames = new Set();
  const enums = (doc.enums || []).map(raw => parseEnum(raw, enumNames));
  const typeNames = new Set();
  const types = (doc.types || []).map(raw => parseType(raw, typeNames));

  const surface = {
    artifact: doc.artifact || '',
    artifactVersion: doc.artifact_version || 0,
    profile: doc.profile || '',
    contractSchemaVersion: doc.contract_schema_version || '',
    sourceSchemaId: doc.source_schema_id || '',
    sourceSchemaSha256: doc.source_schema_sha256 || '',
    enums,
    types,
  };
  checkReferences(surface, typeNames, enumNames);
  return surface;
}

function checkReferences(surface, types, enums) {
  surface.types.forEach(type => {
    type.fields.forEach(field => {
      checkRef(`${type.name}.${field.name}`, field.type, types, enums);
      field.requiresMembers.forEach(member => {
        if (field.type.kind !== 'ref' || !field.type.ref) {
          throw new SurfaceError(
            `${type.name}.${field.name} declares requires_members on a non-reference field; ` +
              `there is no type to require them of`
          );
        }
        const referenced = surface.types.find(candidate => candidate.name === field.type.ref);
        if (!referenced.fields.some(candidate => candidate.name === member)) {
          throw new SurfaceError(
            `${type.name}.${field.name} requires the member "${member}" of ` +
              `"${field.type.ref}", which has no such field`
          );
        }
      });
    });
  });
}

/**
 * Refuse a container nested inside a container.
 *
 * The artifact declares none today. Refusing rather than rendering keeps the two
 * SDKs in step: a construct one emitter generates for and the other refuses is a
 * release where four SDKs ship and one does not build.
 */
function checkContainerItem(where, item) {
  if (item.kind === 'array' || item.kind === 'map') {
    throw new SurfaceError(
      `${where} nests a ${item.kind} inside a container; no SDK emitter renders that yet, ` +
        `and generating for it in one language and not another is how a five-SDK release ` +
        `becomes a four-SDK release`
    );
  }
}

function checkRef(where, ref, types, enums) {
  switch (ref.kind) {
    case 'ref':
      if (!types.has(ref.ref)) {
        throw new SurfaceError(
          `${where} references the type "${ref.ref}", which the artifact does not define`
        );
      }
      return;
    case 'enum':
      if (!enums.has(ref.enum)) {
        throw new SurfaceError(
          `${where} references the enum "${ref.enum}", which the artifact does not define`
        );
      }
      return;
    case 'array':
      if (!ref.items) throw new SurfaceError(`${where} is an array with no item type`);
      checkContainerItem(`${where}[]`, ref.items);
      checkRef(`${where}[]`, ref.items, types, enums);
      return;
    case 'map':
      if (!ref.value) throw new SurfaceError(`${where} is a map with no value type`);
      checkContainerItem(`${where}{}`, ref.value);
      checkRef(`${where}{}`, ref.value, types, enums);
      return;
    case 'object':
      return;
    default:
      if (!SCALAR_TS[ref.kind]) {
        throw new SurfaceError(`${where} has the unsupported type kind "${ref.kind}"`);
      }
  }
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------
//
// Every generated name carries the AuthZEN prefix. It is not decoration: this
// package already exports `Obligation`-shaped names from the PEP surface, and a
// generated type of the same name would collide on `export *`. Prefixing
// everything, rather than only what collides today, keeps the rule mechanical —
// a future collision does not require inventing a new convention under time
// pressure.
//
// NOTE ON PLURALISATION: nothing here appends "s" to a derived name. The
// per-enum value list is `<ENUM>_VALUES`, not `allAuthZENCategorys`, because a
// naive pluraliser produces names that read as typos — and every generated name
// is a public compatibility commitment through v11.

function pascal(text) {
  return text
    .replace(/[.\-]/g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function stripPrefix(name) {
  return name.startsWith('authzen_') ? name.slice('authzen_'.length) : name;
}

function typeName(artifactName) {
  return `AuthZEN${pascal(stripPrefix(artifactName))}`;
}

function enumTypeName(artifactName) {
  return `AuthZEN${pascal(stripPrefix(artifactName))}`;
}

function enumValuesName(artifactName) {
  return `AUTHZEN_${stripPrefix(artifactName).toUpperCase()}_VALUES`;
}

function enumConstName(artifactName, value) {
  const stem = stripPrefix(artifactName).toUpperCase();
  return `AUTHZEN_${stem}_${value.toUpperCase().replace(/[.\-]/g, '_')}`;
}

/**
 * The property name for a wire member.
 *
 * The artifact's members are lower_snake_case; this SDK's public interfaces are
 * camelCase everywhere else, but these are NOT converted. The AuthZEN request
 * and response ARE the wire documents — they are serialised verbatim — and a
 * camelCase property would mean a translation layer between every field name a
 * server refusal's JSON Pointer names and the field a caller wrote. The pointer
 * is the whole diagnostic value of a refusal on this surface, so the wire name
 * is the property name.
 */
function fieldName(wireName) {
  return wireName;
}

function validatorName(artifactName) {
  return `validate${typeName(artifactName)}`;
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

function wrap(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = words[0];
  words.slice(1).forEach(word => {
    if (current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current += ` ${word}`;
    }
  });
  lines.push(current);
  return lines;
}

function docComment(out, indent, text) {
  const lines = wrap(text, 84 - indent.length);
  if (lines.length === 0) return;
  out.push(`${indent}/**`);
  lines.forEach(line => out.push(`${indent} * ${line}`));
  out.push(`${indent} */`);
}

function lineComment(out, indent, text) {
  wrap(text, 84 - indent.length).forEach(line => out.push(`${indent}// ${line}`));
}

function tsType(ref) {
  if (SCALAR_TS[ref.kind]) return SCALAR_TS[ref.kind];
  if (ref.kind === 'enum') return enumTypeName(ref.enum);
  if (ref.kind === 'object') return 'Record<string, unknown>';
  if (ref.kind === 'ref') return typeName(ref.ref);
  if (ref.kind === 'array') return `${tsType(ref.items)}[]`;
  if (ref.kind === 'map') return `Record<string, ${tsType(ref.value)}>`;
  throw new SurfaceError(`unsupported type kind "${ref.kind}"`);
}

/**
 * Emit a statement, breaking it the way the repository's formatter would.
 *
 * The emitter has to produce the ALREADY-formatted shape, not merely valid
 * code. A generated file the formatter would rewrite is a file the regeneration
 * gate reports as drift on every unrelated pull request — until somebody
 * deletes the gate for being noisy. So the three shapes that overflow are
 * rendered here, deterministically, rather than by shelling out to a formatter
 * whose version the gate would then have to reproduce.
 */
function pushConst(out, name, tsAlias, value) {
  const single = `export const ${name}: ${tsAlias} = ${value};`;
  if (single.length <= MAX_COLUMNS) {
    out.push(single);
    return;
  }
  out.push(`export const ${name}: ${tsAlias} =`);
  out.push(`  ${value};`);
}

function pushSignature(out, fnName, returnType) {
  const single = `export function ${fnName}(value: unknown, at: string): ${returnType} {`;
  if (single.length <= MAX_COLUMNS) {
    out.push(single);
    return;
  }
  out.push(`export function ${fnName}(`);
  out.push('  value: unknown,');
  out.push('  at: string');
  out.push(`): ${returnType} {`);
}

function pushMemberList(out, indent, members) {
  const inline = `${indent}authzenNoExtraMembers(obj, at, [${members
    .map(m => `'${m}'`)
    .join(', ')}]);`;
  if (inline.length <= MAX_COLUMNS) {
    out.push(inline);
    return;
  }
  out.push(`${indent}authzenNoExtraMembers(obj, at, [`);
  members.forEach(member => out.push(`${indent}  '${member}',`));
  out.push(`${indent}]);`);
}

function pushFail(out, indent, pointerExpr, message) {
  const inline = `${indent}authzenFail(${pointerExpr}, '${message}');`;
  if (inline.length <= MAX_COLUMNS) {
    out.push(inline);
    return;
  }
  out.push(`${indent}authzenFail(`);
  out.push(`${indent}  ${pointerExpr},`);
  out.push(`${indent}  '${message}'`);
  out.push(`${indent});`);
}

function emitEnum(out, enumDef) {
  const alias = enumTypeName(enumDef.name);
  const valuesConst = enumValuesName(enumDef.name);
  docComment(
    out,
    '',
    `${alias} is a closed set of values the server may send. The trailing ` +
      `\`(string & {})\` keeps an unrecognised value from a newer server assignable ` +
      `instead of a compile error, while the named members still autocomplete. Use ` +
      `${valuesConst} to tell a value this build knows from one it does not.`
  );
  // The formatter collapses a union that fits on one line and explodes one
  // that does not, so the emitter renders whichever shape it would have
  // produced. A file the formatter rewrites is drift the regeneration gate
  // reports on every unrelated pull request.
  const members = [...enumDef.values.map(value => `'${value}'`), '(string & {})'];
  const inline = `export type ${alias} = ${members.join(' | ')};`;
  if (inline.length <= MAX_COLUMNS) {
    out.push(inline);
  } else {
    out.push(`export type ${alias} =`);
    members.forEach((member, index) => {
      const last = index === members.length - 1;
      out.push(`  | ${member}${last ? ';' : ''}`);
    });
  }
  out.push('');
  enumDef.values.forEach(value => {
    pushConst(out, enumConstName(enumDef.name, value), alias, `'${value}'`);
  });
  out.push('');
  lineComment(out, '', `Every value of ${enumDef.name} this build knows, in the artifact's order.`);
  out.push(`export const ${valuesConst}: readonly ${alias}[] = [`);
  enumDef.values.forEach(value => out.push(`  ${enumConstName(enumDef.name, value)},`));
  out.push('];');
  out.push('');
}

function emitInterface(out, type) {
  const name = typeName(type.name);
  docComment(out, '', type.doc || `${name} is part of the AuthZEN wire surface.`);
  out.push(`export interface ${name} {`);
  type.fields.forEach((field, index) => {
    if (index > 0) out.push('');
    if (field.doc) docComment(out, '  ', field.doc);
    if (field.const) lineComment(out, '  ', `The only value the server sends is '${field.const}'.`);
    const optional = field.required ? '' : '?';
    out.push(`  ${fieldName(field.name)}${optional}: ${tsType(field.type)};`);
  });
  out.push('}');
  out.push('');
}

/**
 * Render the runtime validator for one type.
 *
 * This is the half a TypeScript interface cannot do. Every check here closes a
 * way for a body the server would refuse — or one this build cannot interpret —
 * to reach a caller wearing the right type.
 */
function emitValidator(out, type) {
  const name = typeName(type.name);
  docComment(
    out,
    '',
    `Validate an unknown value as ${name}, or throw naming the member at fault. ` +
      `Unknown members are REFUSED rather than dropped: on the response path an ` +
      `unrecognised member is a server speaking a profile this build does not ` +
      `understand, and quietly ignoring it would mean acting on a partial reading of ` +
      `an authorization decision.`
  );
  pushSignature(out, validatorName(type.name), name);
  out.push('  const obj = authzenObject(value, at);');
  pushMemberList(
    out,
    '  ',
    type.fields.map(field => field.name)
  );

  type.fields.forEach(field => {
    const member = fieldName(field.name);
    const pointer = `\`\${at}/${field.name}\``;
    const access = `obj['${field.name}']`;
    out.push(`  if (${access} === undefined || ${access} === null) {`);
    if (field.required) {
      pushFail(out, '    ', pointer, 'is required');
    } else {
      out.push(`    delete obj['${field.name}'];`);
    }
    out.push('  } else {');
    out.push(...emitFieldChecks(field, access, pointer, '    '));
    out.push('  }');
  });

  type.exactlyOneOf.forEach(group => {
    const present = group.map(member => `obj['${member}'] !== undefined`).join(', ');
    out.push('  {');
    const inline = `    const set = [${present}].filter(Boolean).length;`;
    if (inline.length <= MAX_COLUMNS) {
      out.push(inline);
    } else {
      out.push(`    const set = [${present}].filter(`);
      out.push('      Boolean');
      out.push('    ).length;');
    }
    out.push('    if (set !== 1) {');
    out.push(
      `      authzenFail(at, \`exactly one of ${group.join(' or ')} must be set, \${set} are\`);`
    );
    out.push('    }');
    out.push('  }');
  });

  type.fields.forEach(field => {
    field.requiresMembers.forEach(member => {
      out.push(`  if (obj['${field.name}'] !== undefined) {`);
      out.push(`    const nested = obj['${field.name}'] as Record<string, unknown>;`);
      out.push(`    if (nested['${member}'] === undefined || nested['${member}'] === null) {`);
      pushFail(
        out,
        '      ',
        `\`\${at}/${field.name}\``,
        `has no ${member}; it has no shared base to inherit one from`
      );
      out.push('    }');
      out.push('  }');
    });
  });

  out.push(`  return obj as unknown as ${name};`);
  out.push('}');
  out.push('');
}

function emitFieldChecks(field, access, pointer, indent) {
  const lines = [];
  const ref = field.type;
  if (ref.kind === 'string' || ref.kind === 'enum') {
    // The binding is emitted only when something reads it: an unused `raw`
    // is a lint error on a file nobody is allowed to hand-fix.
    // `const` no longer emits a check (see below), so only a minLength reads it.
    const reads = field.minLength > 0;
    lines.push(
      reads
        ? `${indent}const raw = authzenString(${access}, ${pointer});`
        : `${indent}authzenString(${access}, ${pointer});`
    );
    if (field.minLength > 0) {
      lines.push(`${indent}if (raw.length < ${field.minLength}) {`);
      pushFail(
        lines,
        `${indent}  `,
        pointer,
        `must be at least ${field.minLength} character(s); it is present but too short`
      );
      lines.push(`${indent}}`);
    }
    // `const` is DELIBERATELY not enforced here, and the sibling emitter makes
    // the same choice.
    //
    // The only const in the contract is the response context's profile, and the
    // hand-written client already refuses a profile it cannot read with a
    // message that names the version it does speak and tells the caller to
    // upgrade - which is exactly the guidance wanted at the v11 cutover.
    // Enforcing it here too put a second check in front of the first: the
    // generated one fired, the actionable message became dead code, and the
    // test named for it passed on the generated message instead. One rule, one
    // enforcement site, and the constant is emitted so that site can name it.
    return lines;
  }
  if (ref.kind === 'bool') {
    lines.push(`${indent}authzenBoolean(${access}, ${pointer});`);
    return lines;
  }
  if (ref.kind === 'int') {
    lines.push(`${indent}authzenInteger(${access}, ${pointer});`);
    return lines;
  }
  if (ref.kind === 'object') {
    lines.push(`${indent}authzenObject(${access}, ${pointer});`);
    return lines;
  }
  if (ref.kind === 'map') {
    lines.push(`${indent}const entries = authzenObject(${access}, ${pointer});`);
    lines.push(`${indent}Object.keys(entries).forEach(key => {`);
    lines.push(
      `${indent}  ${scalarCheck(ref.value, 'entries[key]', `\`\${${pointer}}/\${key}\``)}`
    );
    lines.push(`${indent}});`);
    return lines;
  }
  if (ref.kind === 'ref') {
    // The SANITISED child is stored back, not merely checked.
    //
    // Without the write-back the parent keeps reading the caller's original
    // object, and an explicit `null` on an optional nested member survives:
    // the child validator deletes it from ITS copy, that copy is discarded,
    // and a cross-object rule below — `evaluation has no subject` — then asks
    // `=== undefined` of a member that is still `null` and concludes it is
    // present. An envelope with `"subject": null` was accepted by exactly the
    // check written to refuse it.
    lines.push(`${indent}${access} = ${validatorName(ref.ref)}(${access}, ${pointer});`);
    return lines;
  }
  if (ref.kind === 'array') {
    lines.push(`${indent}const items = authzenArray(${access}, ${pointer});`);
    if (field.minItems > 0) {
      lines.push(`${indent}if (items.length < ${field.minItems}) {`);
      const entry = field.minItems === 1 ? 'entry' : 'entries';
      pushFail(lines, `${indent}  `, pointer, `needs at least ${field.minItems} ${entry}`);
      lines.push(`${indent}}`);
    }
    if (ref.items.kind === 'ref') {
      lines.push(`${indent}${access} = items.map((item, index) =>`);
      lines.push(`${indent}  ${validatorName(ref.items.ref)}(item, \`\${${pointer}}/\${index}\`)`);
      lines.push(`${indent});`);
    } else {
      lines.push(`${indent}items.forEach((item, index) => {`);
      lines.push(`${indent}  ${scalarCheck(ref.items, 'item', `\`\${${pointer}}/\${index}\``)}`);
      lines.push(`${indent}});`);
    }
    return lines;
  }
  throw new SurfaceError(`unsupported type kind "${ref.kind}"`);
}

function scalarCheck(ref, expr, pointer) {
  if (ref.kind === 'string' || ref.kind === 'enum') return `authzenString(${expr}, ${pointer});`;
  if (ref.kind === 'bool') return `authzenBoolean(${expr}, ${pointer});`;
  if (ref.kind === 'int') return `authzenInteger(${expr}, ${pointer});`;
  if (ref.kind === 'object') return `authzenObject(${expr}, ${pointer});`;
  if (ref.kind === 'ref') return `${validatorName(ref.ref)}(${expr}, ${pointer});`;
  throw new SurfaceError(`unsupported nested kind "${ref.kind}"`);
}

function checkEmittable(surface) {
  if (surface.types.length === 0 || surface.enums.length === 0) {
    throw new SurfaceError(
      `the artifact describes ${surface.types.length} types and ${surface.enums.length} ` +
        `enums; generating from an empty surface would silently produce an empty SDK`
    );
  }
  if (surface.artifact !== SUPPORTED_ARTIFACT) {
    throw new SurfaceError(
      `${SURFACE_REL} is not an AuthZEN surface artifact (artifact="${surface.artifact}")`
    );
  }
  if (surface.artifactVersion !== SUPPORTED_ARTIFACT_VERSION) {
    throw new SurfaceError(
      `artifact format version ${surface.artifactVersion} is not supported by this emitter; ` +
        `a format change is a deliberate migration, not something to generate through`
    );
  }
}

function emitHeader(out, surface) {
  out.push('/**');
  out.push(' * AuthZEN wire types and validators. GENERATED FILE — DO NOT EDIT.');
  out.push(' *');
  out.push(` * Source: ${SURFACE_REL}`);
  out.push(` *   artifact:        ${surface.artifact} v${surface.artifactVersion}`);
  out.push(` *   profile:         ${surface.profile}`);
  out.push(` *   contract schema: ${surface.contractSchemaVersion}`);
  out.push(` *   schema digest:   ${surface.sourceSchemaSha256}`);
  out.push(' *');
  out.push(' * Regenerate with:');
  out.push(' *');
  out.push(' *   node scripts/gen-authzen-types/generate.js');
  out.push(' *');
  out.push(' * Editing this file by hand is pointless: tests/authzen-generator.test.ts');
  out.push(' * regenerates it in memory and compares bytes, so a hand edit fails CI on the');
  out.push(' * next run.');
  out.push(' */');
  out.push('');
  lineComment(
    out,
    '',
    `The profile a Policy Enforcement Point negotiates to receive anything beyond the ` +
      `boolean decision. AuthZEN 1.0's response is a bare boolean; the four-valued state, ` +
      `the obligations, the approval challenge and the safe reason code all ride in the ` +
      `response context and are returned ONLY to a caller that asked for them by version.`
  );
  out.push(`export const AUTHZEN_PROFILE_V1 = '${surface.profile}';`);
  out.push('');
  lineComment(
    out,
    '',
    `The contract version these types were generated from. It is the value the server ` +
      `echoes in AuthZENResponseContext.schema_version.`
  );
  out.push(`export const AUTHZEN_CONTRACT_SCHEMA_VERSION = '${surface.contractSchemaVersion}';`);
  out.push('');
  lineComment(
    out,
    '',
    `The digest of the JSON Schema the artifact was reduced from. It is carried so a ` +
      `support conversation can establish which contract a deployed SDK was built against ` +
      `without reading its dependency tree.`
  );
  out.push(`export const AUTHZEN_SOURCE_SCHEMA_SHA256 =`);
  out.push(`  '${surface.sourceSchemaSha256}';`);
  out.push('');
  out.push(...RUNTIME_HELPERS);
  out.push('');
}

// The primitive checks every generated validator shares. They are emitted
// rather than imported so the generated module is self-contained: a consumer
// reading src/types/authzen.gen.ts sees the whole contract, and the hand-written
// client cannot accidentally become a place where a validation rule lives.
const RUNTIME_HELPERS = [
  '/**',
  ' * Raised when a value does not match the AuthZEN contract. The message always',
  ' * names a JSON Pointer, because on this surface the pointer IS the diagnosis:',
  ' * "unsupported_subject" without the offending member is a puzzle.',
  ' */',
  'export class AuthZENSchemaError extends Error {',
  '  public readonly pointer: string;',
  '',
  '  constructor(pointer: string, detail: string) {',
  "    super(`${pointer || '/'} ${detail}`);",
  "    this.name = 'AuthZENSchemaError';",
  '    this.pointer = pointer;',
  '    Object.setPrototypeOf(this, AuthZENSchemaError.prototype);',
  '  }',
  '}',
  '',
  'export function authzenFail(pointer: string, detail: string): never {',
  '  throw new AuthZENSchemaError(pointer, detail);',
  '}',
  '',
  'export function authzenObject(value: unknown, at: string): Record<string, unknown> {',
  "  if (typeof value !== 'object' || value === null || Array.isArray(value)) {",
  "    authzenFail(at, 'must be an object');",
  '  }',
  '  return { ...(value as Record<string, unknown>) };',
  '}',
  '',
  'export function authzenString(value: unknown, at: string): string {',
  "  if (typeof value !== 'string') {",
  "    authzenFail(at, 'must be a string');",
  '  }',
  '  return value as string;',
  '}',
  '',
  'export function authzenBoolean(value: unknown, at: string): boolean {',
  "  if (typeof value !== 'boolean') {",
  "    authzenFail(at, 'must be a boolean');",
  '  }',
  '  return value as boolean;',
  '}',
  '',
  '// An integer, not merely a number. The artifact distinguishes them, and a',
  '// fractional schema_version is not a schema_version.',
  'export function authzenInteger(value: unknown, at: string): number {',
  "  if (typeof value !== 'number' || !Number.isInteger(value)) {",
  "    authzenFail(at, 'must be an integer');",
  '  }',
  '  return value as number;',
  '}',
  '',
  'export function authzenArray(value: unknown, at: string): unknown[] {',
  '  if (!Array.isArray(value)) {',
  "    authzenFail(at, 'must be an array');",
  '  }',
  '  return value as unknown[];',
  '}',
  '',
  '/**',
  ' * Refuse a member the contract does not declare.',
  ' *',
  ' * On the RESPONSE path this is the whole strictness argument: a member this',
  ' * build has never heard of means the server is speaking a profile it cannot',
  ' * fully read, and dropping it silently would mean acting on a partial reading',
  ' * of an authorization decision. On the REQUEST path it catches a member the',
  ' * caller invented before it becomes a 422.',
  ' */',
  'export function authzenNoExtraMembers(',
  '  obj: Record<string, unknown>,',
  '  at: string,',
  '  known: readonly string[]',
  '): void {',
  '  const extra = Object.keys(obj)',
  '    .filter(key => !known.includes(key))',
  '    .sort();',
  '  if (extra.length > 0) {',
  "    authzenFail(at, `carries members this build does not understand: ${extra.join(', ')}`);",
  '  }',
  '}',
];

function emit(surface) {
  checkEmittable(surface);
  const out = [];
  emitHeader(out, surface);
  surface.enums.forEach(enumDef => emitEnum(out, enumDef));
  surface.types.forEach(type => emitInterface(out, type));
  surface.types.forEach(type => emitValidator(out, type));

  let rendered = out.join('\n');
  while (rendered.includes('\n\n\n')) {
    rendered = rendered.replace(/\n\n\n/g, '\n\n');
  }
  rendered = `${rendered.replace(/\n+$/, '')}\n`;

  const tooLong = rendered
    .split('\n')
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(entry => entry.line.length > MAX_COLUMNS);
  if (tooLong.length > 0) {
    // Fail rather than emit something the formatter would rewrite: a file the
    // formatter reformats is a file the regeneration gate reports as drift on
    // every unrelated pull request, until somebody deletes the gate.
    throw new SurfaceError(
      `the emitter produced ${tooLong.length} line(s) over ${MAX_COLUMNS} columns, ` +
        `starting at line ${tooLong[0].index}: ${tooLong[0].line.trim().slice(0, 60)}...`
    );
  }
  return rendered;
}

/**
 * Refuse a vendored artifact that is not the one this SDK was pinned to.
 *
 * Without this the regeneration gate is a closed loop: edit the artifact,
 * regenerate, and both the CI check and the byte-comparison test are green while
 * the SDK now describes a contract the platform never published. This is the
 * only check that looks OUTSIDE the file.
 */
function verifyVendoredDigest(raw) {
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  if (digest !== VENDORED_ARTIFACT_SHA256) {
    throw new SurfaceError(
      `${SURFACE_REL} has sha256 ${digest}, not the pinned ${VENDORED_ARTIFACT_SHA256}. The ` +
        `vendored artifact is a COPY of the platform's canonical surface, so editing it here ` +
        `silently forks the contract this SDK describes. If you are re-vendoring on purpose: ` +
        `copy the file from the platform again, update VENDORED_ARTIFACT_SHA256 in this ` +
        `script, regenerate, and name the platform commit in the pull request.`
    );
  }
}

function main(argv) {
  const check = argv.includes('--check');
  const raw = fs.readFileSync(SURFACE_PATH, 'utf8');
  verifyVendoredDigest(raw);
  const surface = parseSurface(raw);
  const rendered = emit(surface);

  if (check) {
    if (!fs.existsSync(OUTPUT_PATH)) {
      process.stderr.write(`--check: ${OUTPUT_PATH} does not exist\n`);
      return 1;
    }
    if (fs.readFileSync(OUTPUT_PATH, 'utf8') !== rendered) {
      process.stderr.write(
        `--check: src/types/authzen.gen.ts is not what ${SURFACE_REL} generates.\n` +
          `Regenerate it in the same change:\n  node scripts/gen-authzen-types/generate.js\n`
      );
      return 1;
    }
    process.stdout.write('src/types/authzen.gen.ts is current.\n');
    return 0;
  }

  fs.writeFileSync(OUTPUT_PATH, rendered, 'utf8');
  process.stdout.write('wrote src/types/authzen.gen.ts\n');
  return 0;
}

module.exports = {
  SurfaceError,
  VENDORED_ARTIFACT_SHA256,
  verifyVendoredDigest,
  SURFACE_PATH,
  OUTPUT_PATH,
  parseSurface,
  emit,
  typeName,
  enumTypeName,
  enumValuesName,
  enumConstName,
  validatorName,
  fieldName,
  main,
};

/**
 * Run `main` and report a refusal as a message, not a stack trace.
 *
 * The value of these gates is telling a maintainer what to do about the
 * failure. A stack trace in a CI log buries the one sentence that matters under
 * frames from this script.
 */
function cli(argv) {
  try {
    return main(argv);
  } catch (err) {
    if (!(err instanceof SurfaceError)) throw err;
    process.stderr.write(`gen-authzen-types: ${err.message}\n`);
    return 1;
  }
}

module.exports.cli = cli;

if (require.main === module) {
  process.exit(cli(process.argv.slice(2)));
}
