/**
 * The wire-shape baseline is pinned to the platform commit the committed spec
 * snapshot names.
 *
 * The snapshot, tests/fixtures/openapi, lives inside this repository, so a git
 * checkout's HEAD there is the SDK's own commit. Every snapshot file's
 * generated header names the platform commit it was derived at instead, and
 * these tests pin the baseline's openapi_specs_sha, the refresh and the
 * validator to it.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveSpecsSha, snapshotCommit } from '../scripts/wire-shape/lib';

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(__dirname, 'fixtures', 'openapi');
const PINNED: string = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'wire-shape-baseline.json'), 'utf8')
).openapi_specs_sha;
const OTHER_COMMIT = '0'.repeat(40);

const made: string[] = [];

function copySnapshot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-shape-pin-'));
  made.push(dir);
  for (const name of fs.readdirSync(SNAPSHOT_DIR)) {
    if (name.endsWith('.yaml')) {
      fs.copyFileSync(path.join(SNAPSHOT_DIR, name), path.join(dir, name));
    }
  }
  return dir;
}

function rewrite(file: string, from: string, to: string): void {
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split(from).join(to));
}

function yamlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.yaml'))
    .sort()
    .map(name => path.join(dir, name));
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('snapshotCommit', () => {
  it("reads the committed snapshot's commit, which is the baseline's openapi_specs_sha", () => {
    expect(PINNED).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshotCommit(SNAPSHOT_DIR)).toBe(PINNED);
  });

  it('refuses a snapshot whose files name different commits', () => {
    const dir = copySnapshot();
    rewrite(yamlFiles(dir)[0], `platform commit ${PINNED}`, `platform commit ${OTHER_COMMIT}`);
    expect(() => snapshotCommit(dir)).toThrow('2 platform commits');
  });

  it('refuses a header naming another file', () => {
    const dir = copySnapshot();
    fs.renameSync(yamlFiles(dir)[0], path.join(dir, 'renamed-api.yaml'));
    expect(() => snapshotCommit(dir)).toThrow('renamed-api.yaml: the header does not name');
  });

  it('refuses an abbreviated commit', () => {
    const dir = copySnapshot();
    for (const file of yamlFiles(dir)) {
      rewrite(file, PINNED, PINNED.slice(0, 9));
    }
    expect(() => snapshotCommit(dir)).toThrow('the header does not name');
  });

  it('names no commit for a directory that is not a generated snapshot', () => {
    const dir = copySnapshot();
    for (const file of yamlFiles(dir)) {
      fs.writeFileSync(file, 'openapi: 3.0.0\ncomponents:\n  schemas: {}\n');
    }
    expect(snapshotCommit(dir)).toBeNull();
  });
});

describe('resolveSpecsSha', () => {
  it('takes the commit from the snapshot, and an explicit --sha may repeat it', () => {
    expect(resolveSpecsSha(SNAPSHOT_DIR, null)).toBe(PINNED);
    expect(resolveSpecsSha(SNAPSHOT_DIR, PINNED)).toBe(PINNED);
  });

  it('refuses a --sha that contradicts the snapshot', () => {
    expect(() => resolveSpecsSha(SNAPSHOT_DIR, OTHER_COMMIT)).toThrow(
      `disagrees with ${SNAPSHOT_DIR}, whose generated headers name platform commit ${PINNED}`
    );
  });

  it('requires --sha for a directory that is not a generated snapshot', () => {
    const dir = copySnapshot();
    for (const file of yamlFiles(dir)) {
      fs.writeFileSync(file, 'openapi: 3.0.0\ncomponents:\n  schemas: {}\n');
    }
    expect(() => resolveSpecsSha(dir, null)).toThrow('pass --sha');
    expect(resolveSpecsSha(dir, OTHER_COMMIT)).toBe(OTHER_COMMIT);
  });
});

describe('the validator', () => {
  it('fails when the snapshot names a commit other than the baseline pin', () => {
    // Consistent headers naming another commit: only the pin gate can object.
    const dir = copySnapshot();
    for (const file of yamlFiles(dir)) {
      rewrite(file, PINNED, OTHER_COMMIT);
    }
    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'wire-shape', 'validate.js')], {
        cwd: ROOT,
        env: { ...process.env, AXONFLOW_OPENAPI_SPECS_DIR: dir },
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
    } catch (e) {
      const failed = e as { status: number; stderr: string };
      status = failed.status;
      stderr = failed.stderr;
    }
    expect(status).toBe(1);
    expect(stderr).toContain(
      `The snapshot's headers name platform commit ${OTHER_COMMIT}, but the baseline's openapi_specs_sha is ${PINNED}.`
    );
  }, 60000);
});
