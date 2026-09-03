// Copyright 2026 AxonFlow
// SPDX-License-Identifier: MIT

/**
 * The repository distributes under exactly one licence, and says so in exactly
 * one way.
 *
 * # Why this test exists
 *
 * Two files in this MIT-licensed SDK declared Apache-2.0. `LICENSE` has read
 * `MIT License` since the initial commit, so neither was ever a relicence
 * question -- they were wrong statements about files that were MIT all along.
 * Drift of that kind is invisible from inside the repository that has it:
 * nothing fails, nothing warns, and the wrong string is copied forward by the
 * next file made from it. It was found only when all twenty-two repositories'
 * `licenseInfo` were read side by side.
 *
 * The sibling Go SDK had the same class at seventeen files, and thirteen of
 * those were a form the original cross-repo search could not see at all. That
 * is why the rules below are written to a shape rather than to a list of known
 * offenders.
 *
 * # The two rules, and how wide each one really is
 *
 * The identifier rule is the strong one, because it is closed under the syntax
 * rather than over a list of phrasings: every SPDX identifier tag anywhere in
 * the tree, in any case, must name MIT, whatever licence a future copy-paste
 * brings with it. The prose rule is a backstop and is only as wide as
 * FORBIDDEN_PHRASES -- an enumerated list, therefore incomplete by
 * construction, which is why it is not the rule this test leans on.
 *
 * Both are needed, and each is blind to what the other catches: an identifier
 * rule cannot see an Apache prose block, and a prose rule cannot see a bare
 * tag. The Go sibling had thirteen of the former and four of the latter.
 *
 * # Two things learned the hard way, portable to the other SDKs
 *
 * The needles are assembled by concatenation, and the tag is never spelled out
 * in this file in any case. A guard whose marker string collides with the prose
 * beside it either fails against itself or has to exempt itself, and an
 * exemption is a hole. The Java sibling caught its own documentation three
 * times before this was settled.
 *
 * Absence of a declaration is deliberately NOT an error. A file with no header
 * inside a repository with one LICENSE is unambiguous; a file declaring a
 * DIFFERENT licence is the defect. Most files here carry no header and are left
 * alone. Requiring a declaration to be PRESENT is a stronger and separate
 * property from requiring none to CONTRADICT, and only the latter protects the
 * licence.
 */

import * as fs from 'fs';
import * as path from 'path';

const LICENSE_NAME = 'MIT License';

/** Split so this file is not a hit for the scan it drives. */
const SPDX_TAG = 'SPDX' + '-License-Identifier:';

/**
 * Comment terminators that can follow an identifier on the same line. An
 * identifier is read from a line of SOURCE and a block or markup comment closes
 * after it. Comparing the raw remainder of the line would report a
 * correctly-MIT file as a contradiction: a false positive, in the direction
 * that gets a guard deleted rather than fixed.
 */
const COMMENT_TERMINATORS = ['*/', '-->', '#>', '--%>'];

/**
 * Licence prose this repository must not be distributing under. Assembled
 * piecewise; see the file comment. Enumerated, hence a backstop rather than the
 * primary rule.
 */
const FORBIDDEN_PHRASES = [
  'Apache' + ' License, Version 2.0',
  // The same licence without the "Version", which is how prose usually names it
  // and which the comma-bearing form does not contain as a substring.
  'Apache' + ' License 2.0',
  'Business' + ' Source License',
  'GNU' + ' General Public License',
  'Mozilla' + ' Public License',
];

/**
 * Path SEGMENTS that are dependencies, build output or VCS metadata rather than
 * this repository's own source. Matched segment-wise, not as a path prefix: a
 * prefix test would only ever exclude a root-level directory, and
 * `node_modules` appears nested.
 *
 * `node_modules` is a DELIBERATE, CATEGORICAL EXEMPTION and saying so plainly
 * matters, because the rules below would otherwise read as covering it. A
 * dependency tree is third-party code that legitimately keeps its own licence;
 * scanning it would fail the guard on correct code, which is how a guard gets
 * deleted rather than fixed. Measured on the sibling Go SDK, one `go mod vendor`
 * produces 17 files of which 7 carry Apache prose and 15 carry a non-AxonFlow
 * copyright notice.
 */
const NOT_SOURCE = ['.git', 'node_modules', 'dist', 'build', 'coverage'];

/**
 * Files that must appear in the scan. These are not a count -- a floor is a
 * number someone tunes until it passes. Each anchor pins one root the walk
 * claims to cover, so a walk that silently stopped short of `tests/` or
 * `runtime-e2e/` fails here rather than passing over an empty set.
 */
const ANCHORS = [
  'LICENSE',
  'README.md',
  'CHANGELOG.md',
  'package.json',
  'src/types/hitl.ts',
  'tests/hitl.test.ts',
  'scripts/postinstall.js',
  'runtime-e2e/read_path_identity/test.sh',
  '.github/workflows/test.yml',
];

/** Matches a line ASSERTING copyright ownership: the word, an optional (c), a year. */
const COPYRIGHT_NOTICE = /copyright\s+(\(c\)\s*)?[0-9]{4}/i;

/**
 * Every SPDX identifier declared on a line, in order; empty if none.
 *
 * Every occurrence, not the first. Reading only the first turns a false
 * positive into a false NEGATIVE, which is the worse direction and the one that
 * ships: `<!-- ...: MIT --> <!-- ...: Apache-2.0 -->` truncated at the first
 * terminator reads as plain MIT and the Apache declaration beside it passes in
 * silence.
 *
 * Case-insensitive because the file comment claims closure under the syntax,
 * and a case-sensitive scan makes that claim false. A guard narrower than its
 * own comment is worse than a narrow guard: the comment is what the next person
 * relies on.
 */
export function declaredIdentifiers(line: string): string[] {
  const found: string[] = [];
  const lower = line.toLowerCase();
  const lowerTag = SPDX_TAG.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(lowerTag, from);
    if (at < 0) return found;
    const valueStart = at + SPDX_TAG.length;
    let end = line.length;
    for (const terminator of COMMENT_TERMINATORS) {
      const c = line.indexOf(terminator, valueStart);
      if (c >= 0 && c < end) end = c;
    }
    const next = lower.indexOf(lowerTag, valueStart);
    if (next >= 0 && next < end) end = next;
    found.push(line.slice(valueStart, end).trim());
    from = valueStart;
  }
}

export function isNotSource(rel: string): boolean {
  return rel
    .split(path.sep)
    .join('/')
    .split('/')
    .some(s => NOT_SOURCE.includes(s));
}

const repoRoot = path.resolve(__dirname, '..');

/** Every scannable file, keyed by its repository-relative path. */
function tree(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoRoot, full).split(path.sep).join('/');
      if (isNotSource(rel)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        // latin1 never throws on arbitrary bytes, so a file this test was not
        // expecting cannot turn a licence assertion into a decoding error.
        out.set(rel, fs.readFileSync(full, 'latin1'));
      }
    }
  };
  walk(repoRoot);
  return out;
}

/**
 * The header region of a file, as (1-based line number, text) pairs, with lines
 * inside a block comment omitted.
 *
 * Block-comment awareness is not decoration: a `#!` at column 0 inside a
 * `/* … *\/` block is documentation, not a shebang, and flagging it is a false
 * positive on correct code — the failure mode that gets a guard deleted. Lines
 * beginning `//` are already excluded by the anchors below, which match at
 * column 0.
 *
 * Five lines rather than one, because a shebang that has been re-spaced AND
 * pushed down by an inserted header escapes a three-line window by one line.
 */
function headerLines(content: string): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  let inBlock = false;
  content
    .split('\n')
    .slice(0, 5)
    .forEach((line, i) => {
      const opened = line.includes('/*');
      const closed = line.includes('*/');
      if (!inBlock && !opened) out.push([i + 1, line]);
      if (opened && !closed) inBlock = true;
      if (inBlock && closed) inBlock = false;
    });
  return out;
}

describe('licence metadata', () => {
  it('the scan reaches every root it claims to cover', () => {
    const files = tree();
    const missing = ANCHORS.filter(a => !files.has(a));
    expect(missing).toEqual([]);
  });

  it('LICENSE is the MIT text', () => {
    const text = fs.readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8');
    // Strip \r so a CRLF checkout does not fail with the self-denying message
    // `expected "MIT License" but was "MIT License"`.
    expect(text.split('\n')[0].replace(/\r$/, '')).toBe(LICENSE_NAME);
    expect(text).toContain('Permission is hereby granted, free of charge');
  });

  it('package.json declares MIT, which is what npm publishes', () => {
    // LICENSE is what GitHub reads; this field is what the registry publishes
    // and what every downstream `npm ls --json` licence audit sees. They can
    // disagree, so both are asserted.
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.license).toBe('MIT');
  });

  it('every SPDX identifier in the tree names MIT', () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const [file, content] of tree()) {
      for (const line of content.split('\n')) {
        for (const declared of declaredIdentifiers(line)) {
          seen++;
          if (declared !== 'MIT') wrong.push(`${file}: ${declared}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    // Without this, a walk that read nothing would satisfy the assertion above.
    expect(seen).toBeGreaterThan(0);
  });

  it('no file carries the prose of another licence', () => {
    const hits: string[] = [];
    for (const [file, content] of tree()) {
      if (file === 'LICENSE') continue; // it IS the licence text
      for (const phrase of FORBIDDEN_PHRASES) {
        if (content.includes(phrase)) hits.push(`${file}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('every copyright notice is AxonFlow’s', () => {
    // Scope stated precisely: this covers THIS REPOSITORY'S OWN SOURCE, not
    // `node_modules`, which the walk skips wholesale. An earlier version of this
    // comment in the Go sibling claimed the guard had "no exemption list at all"
    // and that a vendored file would "force the decision" -- both false, and R3
    // proved it with a real vendor tree that passed every licence rule. A guard
    // narrower than its own comment is worse than a narrow guard, because the
    // comment is what the next person relies on.
    //
    // What it does catch is the realistic drift: a third-party helper pasted
    // into `src/` beside the code that uses it, where nothing marks it as
    // someone else's and any header pass sweeps it into MIT.
    const foreign: string[] = [];
    let seen = 0;
    for (const [file, content] of tree()) {
      for (const line of content.split('\n')) {
        if (!COPYRIGHT_NOTICE.test(line)) continue;
        seen++;
        if (!line.includes('AxonFlow')) foreign.push(`${file}: ${line.trim()}`);
      }
    }
    expect(foreign).toEqual([]);
    expect(seen).toBeGreaterThan(0);
  });

  describe('the identifier reader, in BOTH directions', () => {
    // A recogniser has two failure directions and needs a case for each. Rows
    // are built from SPDX_TAG rather than written out, so this test's own cases
    // are not hits for the tree scan it describes.
    const cases: Array<[string, string, string[]]> = [
      // ACCEPTS: MIT however the surrounding comment closes.
      ['line comment', `// ${SPDX_TAG} MIT`, ['MIT']],
      ['block body', ` * ${SPDX_TAG} MIT`, ['MIT']],
      ['block closed', `/* ${SPDX_TAG} MIT */`, ['MIT']],
      ['markup', `<!-- ${SPDX_TAG} MIT -->`, ['MIT']],
      ['hash', `# ${SPDX_TAG} MIT`, ['MIT']],
      // Every terminator is exercised, so dropping one fails here rather than
      // silently narrowing what the reader understands.
      ['jsp', `<%-- ${SPDX_TAG} MIT --%>`, ['MIT']],
      ['powershell', `<# ${SPDX_TAG} MIT #>`, ['MIT']],
      // CASE: the file comment claims closure under the syntax.
      ['lowercase tag', `// ${SPDX_TAG.toLowerCase()} Apache-2.0`, ['Apache-2.0']],
      ['uppercase tag', `// ${SPDX_TAG.toUpperCase()} BUSL-1.1`, ['BUSL-1.1']],
      ['lowercase mit', `// ${SPDX_TAG.toLowerCase()} MIT`, ['MIT']],
      // STILL CATCHES: a foreign identifier is not laundered.
      ['apache in block', `/* ${SPDX_TAG} Apache-2.0 */`, ['Apache-2.0']],
      ['busl in markup', `<!-- ${SPDX_TAG} BUSL-1.1 -->`, ['BUSL-1.1']],
      ['expression', `// ${SPDX_TAG} MIT OR GPL-3.0`, ['MIT OR GPL-3.0']],
      // THE FALSE-NEGATIVE DIRECTION, which is the one that ships.
      [
        'two tags markup',
        `<!-- ${SPDX_TAG} MIT --> <!-- ${SPDX_TAG} Apache-2.0 -->`,
        ['MIT', 'Apache-2.0'],
      ],
      ['two tags block', `/* ${SPDX_TAG} MIT */ /* ${SPDX_TAG} BUSL-1.1 */`, ['MIT', 'BUSL-1.1']],
      ['two tags abutting', `${SPDX_TAG} MIT ${SPDX_TAG} Apache-2.0`, ['MIT', 'Apache-2.0']],
      // A line that declares nothing yields nothing, so `seen` counts only real ones.
      ['no declaration', "import * as fs from 'fs';", []],
    ];
    it.each(cases)('%s', (_name, line, want) => {
      expect(declaredIdentifiers(line)).toEqual(want);
    });
  });

  it('dependency and build output is not scanned', () => {
    // Segment-wise, not prefix: node_modules appears nested, so a prefix test
    // would walk every transitive dependency's licence headers.
    for (const rel of [
      'node_modules/x/i.js',
      'src/x/node_modules/y.js',
      '.git/config',
      'dist/i.js',
    ]) {
      expect(isNotSource(rel)).toBe(true);
    }
    // ...while a real source path that merely CONTAINS the word is still scanned.
    for (const rel of ['src/types/hitl.ts', 'src/distribution/x.ts', 'tests/hitl.test.ts']) {
      expect(isNotSource(rel)).toBe(false);
    }
  });

  it('a shebang stays on line 1', () => {
    // A licence sweep rewrites the top of a file, and a shebang is only a
    // shebang on line 1. Reordered below an inserted header it stops being one,
    // and nothing in a test suite notices.
    //
    // SCOPE, stated because the obvious phrasing overclaims: this checks the
    // shebang's POSITION and SPELLING, not the executable bit. Asserting the bit
    // would fail on correct code here — this repo has 16 shebang-bearing files
    // and only 8 are executable, because an npm lifecycle script like
    // `scripts/postinstall.js` is run by node and legitimately stays 644. So the
    // harm this pins is "the interpreter line stops being read", not "the file
    // stops being executable"; the latter was not true of half these files to
    // begin with.
    const misplaced: string[] = [];
    for (const [file, content] of tree()) {
      if (!/\.(js|mjs|cjs|sh|ts)$/.test(file)) continue;
      for (const [n, line] of headerLines(content)) {
        if (line.startsWith('#!') && n !== 1) misplaced.push(`${file}:${n}`);
      }
    }
    expect(misplaced).toEqual([]);
  });

  it('a shebang is not re-spaced into an inert comment', () => {
    // `# !/usr/bin/env node` is a comment, not a shebang. The position rule
    // above keys on the literal `#!`, so a sweep that inserted a space makes the
    // line inert to the kernel AND invisible to that rule at the same time --
    // the two failures conceal each other, and only this rule sees either.
    //
    // The window is the header region rather than line 1, because the second
    // broken ordering is re-spaced AND pushed down by an inserted header. At a
    // three-line window that case escapes by one line.
    const respaced: string[] = [];
    for (const [file, content] of tree()) {
      if (!/\.(js|mjs|cjs|sh|ts)$/.test(file)) continue;
      for (const [n, line] of headerLines(content)) {
        if (/^#[ \t]+!/.test(line)) respaced.push(`${file}:${n}`);
      }
    }
    expect(respaced).toEqual([]);
  });

  it('a shebang-looking line inside a comment is not a shebang', () => {
    // The false-positive direction, pinned with a fixture rather than left to
    // the tree happening not to contain one. A `#!` at column 0 inside a block
    // comment is documentation; flagging it fails correct code, which is the
    // failure mode that gets a guard deleted rather than fixed.
    const inComment = ['/*', '#!/usr/bin/env node', '*/', 'export const x = 1;'].join('\n');
    expect(headerLines(inComment).map(([, l]) => l)).not.toContain('#!/usr/bin/env node');

    // ...and the control: outside a comment the same line IS seen, so the
    // exclusion cannot be satisfied by seeing nothing at all.
    const real = ['#!/usr/bin/env node', 'export const x = 1;'].join('\n');
    expect(headerLines(real).map(([, l]) => l)).toContain('#!/usr/bin/env node');
  });

  it('the phrase rule can actually fire', () => {
    // The prose rule asserts an ABSENCE across a tree that is currently clean,
    // so on its own it would pass identically if `includes` never matched.
    const planted = '// Licensed under the ' + 'Apache' + ' License, Version 2.0';
    expect(FORBIDDEN_PHRASES.some(p => planted.includes(p))).toBe(true);
  });
});
