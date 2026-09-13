// Types for the parts of lib.js that tests import. lib.js is plain Node
// tooling; this declaration lets strict TypeScript tests call it.

/** The full platform commit a generated snapshot's headers name, or null for a plain specs directory. */
export declare function snapshotCommit(dir: string): string | null;

/** The platform commit to pin the baseline to; throws on a contradicting or missing --sha. */
export declare function resolveSpecsSha(dir: string, explicit: string | null): string;
