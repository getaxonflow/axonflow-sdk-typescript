/**
 * Every outbound request path must pass the heartbeat trigger.
 *
 * The heartbeat fires on the client's FIRST OUTBOUND REQUEST
 * (axonflow-enterprise#3682), which makes "which code paths count as a request"
 * a correctness question rather than a detail.
 *
 * A GATE PLACED AT SOME CALLERS IS NOT A GATE ON THE OTHERS. Before the trigger
 * moved, the constructor pinged, so a method issuing a request without the hook
 * cost nothing. After the move it costs everything: a process whose only
 * outbound call is such a method never pings at all. The Go SDK had one of
 * these (`StreamExecutionStatus`); the Python SDK had TEN.
 *
 * This SDK routes every public request through `_fetch`, which calls
 * `_preRequestHook`. That is a good design and this test is what keeps it true:
 * a new bare `fetch(` in `client.ts` fails here until its author does something
 * about it.
 *
 * WHAT THIS GUARD CAN AND CANNOT SEE. It is a SOURCE SCAN, so it is only as
 * wide as the syntax it matches: a bare `fetch(` call in `client.ts`. It would
 * NOT see a request issued through some future helper that hides the call, and
 * it is not a substitute for thinking about the trigger when adding a request
 * path. Said plainly rather than left for someone to discover.
 */

import * as fs from 'fs';
import * as path from 'path';

const CLIENT = path.join(__dirname, '..', 'src', 'client.ts');

/**
 * Modules deliberately OUTSIDE this census, and why.
 *
 * `src/community.ts` issues one bare `fetch` to `/api/v1/register` from
 * `registerTry`, a MODULE-LEVEL exported function rather than a client method:
 * registration is how a tenant is created, so there is no client and no
 * configured endpoint for a heartbeat to describe. Pinging there would report a
 * deployment that does not exist yet. The Go SDK exempts `register.go` and the
 * Python SDK exempts `community.py` on identical grounds.
 *
 * Named here rather than left implicit, so "the census only reads client.ts" is
 * a decision on the record instead of an accident of scope.
 */
const OUT_OF_SCOPE_MODULES: Record<string, string> = {
  'src/community.ts':
    'module-level tenant registration — no client, no endpoint, nothing for a heartbeat to describe',
};

/**
 * A bare `fetch(` — but NOT `this._fetch(`, which is the wrapper, and not a
 * `.fetch(` method call on some other object.
 *
 * The receiver is part of the pattern for the reason the Go census learned the
 * hard way: widening a needle until it matches everything produces false
 * positives, and a guard that cries wolf trains the next reader to add a bogus
 * exemption to make the test pass. Then the census means nothing.
 */
const BARE_FETCH = /(?<![.\w])fetch\s*\(/;

/**
 * Sites in `client.ts` allowed to call `fetch` directly, and why.
 *
 * Both are inside `_fetch` ITSELF — the wrapper that calls the hook — so they
 * are covered by definition. The count is what is pinned: a third bare `fetch(`
 * means a new request path.
 */
const ALLOWED_BARE_FETCH_CALLS = 2;

function scan(): { line: number; text: string }[] {
  const src = fs.readFileSync(CLIENT, 'utf8').split('\n');
  const hits: { line: number; text: string }[] = [];
  src.forEach((line, i) => {
    const trimmed = line.trim();
    // Prose mentioning a call is not a call. A marker string colliding with the
    // comment beside it is its own failure mode.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (BARE_FETCH.test(line)) hits.push({ line: i + 1, text: trimmed });
  });
  return hits;
}

describe('the heartbeat request-site census', () => {
  it('finds no unaccounted bare fetch() in client.ts', () => {
    const hits = scan();

    // POSITIVE CONTROL. A scan finding nothing has stopped working — a renamed
    // file, a changed spelling — and an empty result would otherwise read as
    // "no bypasses", which is the most dangerous way for a source-scanning
    // guard to fail.
    expect(hits.length).toBeGreaterThan(0);

    // Both permitted calls live inside `_fetch` itself, the wrapper that calls
    // the hook. If this fails, the new site either belongs behind
    // `this._fetch(...)` or must call `this._preRequestHook()` itself.
    const rendered = hits.map(h => `  client.ts:${h.line}  ${h.text}`).join('\n');
    expect(
      hits.length
      // The message carries the sites, so a failure names them rather than
      // reporting a bare number nobody can act on.
    ).toBe(ALLOWED_BARE_FETCH_CALLS);
    expect(rendered).toContain('fetch(');
  });

  it('the out-of-scope modules still look the way this census assumes', () => {
    // The exclusion rests on `registerTry` being module-level and client-free.
    // If that stops being true the exclusion is stale, so the premise is
    // asserted rather than trusted.
    const community = fs.readFileSync(path.join(__dirname, '..', 'src', 'community.ts'), 'utf8');
    expect(Object.keys(OUT_OF_SCOPE_MODULES)).toContain('src/community.ts');
    expect(community).toContain('export async function registerTry');
    expect(community).not.toContain('this._fetch');
    expect(community).not.toContain('_preRequestHook');
  });

  it('the needle has no false positives', () => {
    // Ported from the Go review, where widening a needle to a bare `.Get(`
    // flagged three `Header.Get(...)` sites that issue no request at all.
    for (const notARequest of [
      'const response = await this._fetch(url, { method: "GET" });',
      'const r = await client.fetch(url);',
      'const cached = this._cache.prefetch(key);',
    ]) {
      expect(BARE_FETCH.test(notARequest)).toBe(false);
    }

    // And it must still match the real spelling.
    for (const isARequest of [
      '      return fetch(input, init ? { ...init, headers } : { headers });',
      '      const response = await fetch(url, request);',
    ]) {
      expect(BARE_FETCH.test(isARequest)).toBe(true);
    }
  });

  it('the census can actually fail', () => {
    // A census that cannot fail is decorative. Feed the detector a bypass and
    // assert it is flagged, so "no bypasses" above is a measurement rather than
    // an artifact of a regex matching nothing.
    const bypass = '    const r = await fetch(this.config.endpoint + "/x", { method: "POST" });';
    expect(BARE_FETCH.test(bypass)).toBe(true);
  });
});
