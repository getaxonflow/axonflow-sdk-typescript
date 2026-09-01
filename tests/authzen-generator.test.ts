/**
 * The AuthZEN type generator, and the gate that keeps its output honest.
 *
 * `src/types/authzen.gen.ts` is committed so a consumer running
 * `npm install @axonflow/sdk` receives working types and validators without
 * running a generator. A committed generated file is only worth something if
 * something proves the bytes are the output of the current input — otherwise
 * "generated" is a claim in a header comment rather than a fact.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import * as gen from '../scripts/gen-authzen-types/generate';
import * as generated from '../src/types/authzen.gen';

const REPO_ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'gen-authzen-types', 'generate.js');

function surface(): ReturnType<typeof gen.parseSurface> {
  return gen.parseSurface(fs.readFileSync(gen.SURFACE_PATH, 'utf8'));
}

function committed(): string {
  return fs.readFileSync(gen.OUTPUT_PATH, 'utf8');
}

/**
 * Rejoin implicitly concatenated string literals.
 *
 * The emitter breaks a message that would exceed the column limit, so a test
 * searching for the message as one run of characters would report it missing on
 * exactly the longest — and most informative — messages.
 */
function joinLiterals(source: string): string {
  return source.replace(/'\s*\n\s*\+?\s*'/g, '');
}

describe('the committed file is current', () => {
  it('regenerating reproduces the committed bytes', () => {
    // Fails on BOTH edits: changing the artifact without regenerating, and
    // hand-editing the generated file.
    expect(gen.emit(surface())).toBe(committed());
  });

  it('agrees with the --check mode CI runs', () => {
    // CI runs `--check` in the lint job, where a failure names the fix in one
    // line; this test runs in the test job. Two gates over one property are
    // only worth having if they cannot report different answers.
    expect(() => execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT })).not.toThrow();
  });
});

describe('generation is deterministic', () => {
  it('emits byte-identical output 16 times', () => {
    // Why the check above can be trusted. Every type and field arrives from
    // JSON; if any ordering leaked from a Set or an object key walk, the
    // regeneration gate would fail on unrelated pull requests until somebody
    // deleted it as flaky — which is how a working guard gets removed for being
    // right at the wrong moment.
    const first = gen.emit(surface());
    for (let attempt = 0; attempt < 16; attempt += 1) {
      expect(gen.emit(surface())).toBe(first);
    }
  });

  it('parses deterministically too', () => {
    // A stable emitter over an unstable parse is still unstable.
    const first = JSON.stringify(surface());
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(JSON.stringify(surface())).toBe(first);
    }
  });
});

describe('the output covers the whole artifact', () => {
  // The anti-vacuity guard. The two blocks above compare the generator against
  // itself, so both stay green over a generator that emitted an empty file.

  it('has a non-empty artifact to cover', () => {
    expect(surface().types.length).toBeGreaterThan(0);
    expect(surface().enums.length).toBeGreaterThan(0);
  });

  it('declares every type and field with the artifact optionality', () => {
    const source = committed();
    surface().types.forEach(type => {
      const header = `export interface ${gen.typeName(type.name)} {`;
      expect(source).toContain(header);
      // Scoped to THIS interface's block. A whole-file search reads the
      // envelope's OPTIONAL `evaluations` while checking the bulk's REQUIRED
      // one and reports a defect that is not there — two types legitimately
      // share a field name.
      const block = source.split(header)[1].split('\n}\n')[0];
      type.fields.forEach(field => {
        const required = `\n  ${field.name}: `;
        const optional = `\n  ${field.name}?: `;
        const declared = block.includes(required) || block.includes(optional);
        expect(declared).toBe(true);
        // Optionality must survive into the declaration, or a client omits a
        // field the server requires — or demands one it does not — and gets a
        // refusal it cannot explain.
        expect(block.includes(optional)).toBe(!field.required);
      });
    });
  });

  it('exports every enum value as a constant with the artifact value', () => {
    // Read from the IMPORTED module rather than by matching source text: the
    // emitter wraps a declaration that would exceed the column limit, so a
    // literal match silently stops covering exactly the longest values.
    const module = generated as unknown as Record<string, unknown>;
    surface().enums.forEach(enumDef => {
      const values = module[gen.enumValuesName(enumDef.name)] as string[];
      expect(values).toEqual(enumDef.values);
      enumDef.values.forEach(value => {
        expect(module[gen.enumConstName(enumDef.name, value)]).toBe(value);
      });
    });
  });

  it('emits a runtime validator for every type', () => {
    // The half a TypeScript interface cannot do. Without these there is no
    // strict decoding at all: `JSON.parse(body) as AuthZENResponse` is a claim,
    // not a check.
    const module = generated as unknown as Record<string, unknown>;
    surface().types.forEach(type => {
      expect(typeof module[gen.validatorName(type.name)]).toBe('function');
    });
  });

  it('emits the rules no interface can carry', () => {
    const source = joinLiterals(committed());
    expect(source).toContain('exactly one of evaluation or evaluations must be set');
    expect(source).toContain('it has no shared base to inherit one from');
    expect(source).toContain('needs at least 1 entry');
    expect(source).toContain('is present but too short');
  });

  it('exports no name with a naive plural suffix', () => {
    // Every exported name is a public compatibility commitment through v11. A
    // pluraliser that appends "s" to a derived name produces things like
    // `allAuthZENCategorys`: a name that reads as a typo, in a public API,
    // frozen for two major releases.
    const offenders = Object.keys(generated).filter(name =>
      /(?:[bcdfghjklmnpqrstvwxz]y|s|x|ch|sh)s$/.test(name)
    );
    expect(offenders).toEqual([]);
  });
});

describe('a planted drift is caught', () => {
  // A guard that cannot fail is worse than none. Each case plants a change in a
  // COPY of the artifact and asserts the generator's output moves. The first is
  // the one the gate exists for: a field whose NAME is unchanged and whose
  // SHAPE is not — the drift a name-only comparison, or a human skimming a
  // diff, sails past.

  function drifted(mutate: (doc: any) => void): string {
    const doc = JSON.parse(fs.readFileSync(gen.SURFACE_PATH, 'utf8'));
    mutate(doc);
    return gen.emit(gen.parseSurface(JSON.stringify(doc)));
  }

  it('catches a same-name field-shape drift', () => {
    const output = drifted(doc => {
      const subject = doc.types.find((t: any) => t.name === 'authzen_subject');
      const field = subject.fields.find((f: any) => f.name === 'id');
      expect(field.required).toBe(true); // the fixture still plants a drift
      field.required = false;
    });
    expect(output).not.toBe(committed());

    const header = 'export interface AuthZENSubject {';
    // Scoped to the subject's own block: `request_id?: string` exists
    // legitimately on AuthZENError, and a whole-file search would report the
    // drift as already present in the committed file.
    expect(output.split(header)[1].split('\n}\n')[0]).toContain('id?: string;');
    expect(committed().split(header)[1].split('\n}\n')[0]).not.toContain('id?: string;');

    // The control: without the mutation the same pipeline reproduces the
    // committed bytes, so the assertion above is about the drift, not the copy.
    expect(gen.emit(surface())).toBe(committed());
  });

  it('catches a renamed field', () => {
    const output = drifted(doc => {
      const subject = doc.types.find((t: any) => t.name === 'authzen_subject');
      subject.fields.find((f: any) => f.name === 'id').name = 'identifier';
    });
    expect(output).not.toBe(committed());
  });

  it('catches an added enum value', () => {
    const output = drifted(doc => {
      doc.enums.find((e: any) => e.name === 'operational_state').values.push('QUARANTINE');
    });
    expect(output).toContain('QUARANTINE');
    expect(committed()).not.toContain('QUARANTINE');
  });

  it('catches a dropped min_items', () => {
    // min_items is the bulk envelope's "at least one entry" rule. It is checked
    // separately because it is emitted by a different branch from the type and
    // optionality assertions above — a gate that only compared field names and
    // types would report clean while the rule that stops a zero-entry envelope
    // disappeared.
    const output = drifted(doc => {
      const bulk = doc.types.find((t: any) => t.name === 'authzen_bulk');
      delete bulk.fields.find((f: any) => f.name === 'evaluations').min_items;
    });
    // Scoped to the bulk's OWN validator: approval_requirement.all_of also
    // declares min_items 1, so a whole-file search finds the message either
    // way and the assertion would pass over a rule that had vanished.
    const header = 'export function validateAuthZENBulk';
    const block = (source: string) => source.split(header)[1].split('\n}\n')[0];
    expect(block(output)).not.toContain('needs at least 1 entry');
    expect(block(committed())).toContain('needs at least 1 entry');
  });

  it('catches a dropped requires_members', () => {
    const output = drifted(doc => {
      const envelope = doc.types.find((t: any) => t.name === 'authzen_envelope');
      delete envelope.fields.find((f: any) => f.name === 'evaluation').requires_members;
    });
    expect(output).not.toContain('it has no shared base to inherit one from');
    expect(committed()).toContain('it has no shared base to inherit one from');
  });
});

describe('the parser refuses what it cannot generate', () => {
  // An artifact member this emitter does not understand is a construct the
  // platform added and this SDK would silently omit — the
  // declared-but-never-emitted class, arriving through the generator built to
  // prevent it.

  const VALID = JSON.stringify({
    artifact: 'axonflow-authzen-surface',
    artifact_version: 1,
    profile: 'p',
    contract_schema_version: 'v',
    source_schema_id: 'i',
    source_schema_sha256: 's',
    enums: [{ name: 'e', values: ['a'] }],
    types: [{ name: 't', fields: [{ name: 'f', required: true, type: { kind: 'string' } }] }],
  });

  it('accepts the control fixture', () => {
    // Without this every case below could be passing because the fixture itself
    // is malformed.
    expect(() => gen.parseSurface(VALID)).not.toThrow();
  });

  it.each([
    ['an unknown artifact member', '"enums":', '"transport":"grpc","enums":'],
    ['an unknown type kind', '{"kind":"string"}', '{"kind":"decimal"}'],
    ['a dangling type reference', '{"kind":"string"}', '{"kind":"ref","ref":"nope"}'],
    ['a dangling enum reference', '{"kind":"string"}', '{"kind":"enum","enum":"nope"}'],
    ['an array with no item type', '{"kind":"string"}', '{"kind":"array"}'],
    ['a map with no value type', '{"kind":"string"}', '{"kind":"map"}'],
    ['an unknown field member', '"name":"f"', '"name":"f","widget":true'],
    ['an enum with no values', '"values":["a"]', '"values":[]'],
    ['a repeated enum value', '"values":["a"]', '"values":["a","a"]'],
    [
      'a type with no fields',
      '"fields":[{"name":"f","required":true,"type":{"kind":"string"}}]',
      '"fields":[]',
    ],
  ])('refuses %s', (_name, from, to) => {
    const document = VALID.replace(from, to);
    expect(document).not.toBe(VALID); // the fixture planted something
    expect(() => gen.parseSurface(document)).toThrow(gen.SurfaceError);
  });

  it('refuses an exactly-one-of naming a field that does not exist', () => {
    const doc = JSON.parse(VALID);
    doc.types[0].exactly_one_of = [['f', 'g']];
    expect(() => gen.parseSurface(JSON.stringify(doc))).toThrow(/no such field/);
  });

  it('refuses a duplicate type', () => {
    const doc = JSON.parse(VALID);
    doc.types.push(doc.types[0]);
    expect(() => gen.parseSurface(JSON.stringify(doc))).toThrow(/twice/);
  });
});

describe('the emitter refuses an unsupported artifact', () => {
  it('refuses an unsupported format version', () => {
    // A format change is a deliberate migration. Generating through one
    // produces types that look right and describe a different contract.
    expect(() => gen.emit({ ...surface(), artifactVersion: 2 })).toThrow(/format version/);
  });

  it('refuses a different artifact', () => {
    expect(() => gen.emit({ ...surface(), artifact: 'something-else' })).toThrow(
      /not an AuthZEN surface/
    );
  });

  it('refuses an empty surface', () => {
    expect(() => gen.emit({ ...surface(), types: [] })).toThrow(/empty surface/);
    expect(() => gen.emit({ ...surface(), enums: [] })).toThrow(/empty surface/);
  });

  it('refuses to emit a line the formatter would rewrite', () => {
    // The emitter is the authority on its own layout: a generated file the
    // formatter reformats is drift the regeneration gate reports on every
    // unrelated pull request, until somebody deletes the gate for being noisy.
    const long = 'x'.repeat(200);
    expect(() =>
      gen.emit({
        ...surface(),
        enums: [{ name: long, values: ['a'], doc: '' }, ...surface().enums],
      })
    ).toThrow(/columns/);
  });
});

describe('the vendored artifact matches the platform', () => {
  it('carries the digest, profile and contract version into the types', () => {
    // The three identifiers that make drift detectable at all. A vendored copy
    // with no provenance is a fork nobody has noticed yet.
    const s = surface();
    expect(s.profile).toBe(generated.AUTHZEN_PROFILE_V1);
    expect(s.contractSchemaVersion).toBe(generated.AUTHZEN_CONTRACT_SCHEMA_VERSION);
    expect(s.sourceSchemaSha256).toBe(generated.AUTHZEN_SOURCE_SCHEMA_SHA256);
    expect(generated.AUTHZEN_SOURCE_SCHEMA_SHA256.startsWith('sha256:')).toBe(true);
  });
});
