/**
 * Types for the AuthZEN type generator, so its own test suite can be written in
 * TypeScript like every other test in this repository.
 *
 * This describes a build SCRIPT, not the wire contract — the wire contract's
 * types are generated into `src/types/authzen.gen.ts` and are never hand-written.
 * Keeping the generator itself in plain JavaScript means it runs with `node`
 * alone: a generator that needed the TypeScript toolchain to run could not be
 * invoked from a CI step that has not installed it yet.
 */

export declare class SurfaceError extends Error {}

export interface TypeRef {
  kind: string;
  ref: string;
  enum: string;
  items: TypeRef | null;
  value: TypeRef | null;
}

export interface Field {
  name: string;
  required: boolean;
  type: TypeRef;
  doc: string;
  minItems: number;
  minLength: number;
  requiresMembers: string[];
  const: string;
}

export interface Type {
  name: string;
  fields: Field[];
  doc: string;
  exactlyOneOf: string[][];
}

export interface Enum {
  name: string;
  values: string[];
  doc: string;
}

export interface Surface {
  artifact: string;
  artifactVersion: number;
  profile: string;
  contractSchemaVersion: string;
  sourceSchemaId: string;
  sourceSchemaSha256: string;
  enums: Enum[];
  types: Type[];
}

export declare const SURFACE_PATH: string;
export declare const OUTPUT_PATH: string;
export declare const VENDORED_ARTIFACT_SHA256: string;

export declare function verifyVendoredDigest(raw: string): void;

export declare function parseSurface(rawText: string): Surface;
export declare function emit(surface: Surface): string;
export declare function typeName(artifactName: string): string;
export declare function enumTypeName(artifactName: string): string;
export declare function enumValuesName(artifactName: string): string;
export declare function enumConstName(artifactName: string, value: string): string;
export declare function validatorName(artifactName: string): string;
export declare function fieldName(wireName: string): string;
export declare function main(argv: string[]): number;
