/**
 * The `cache` option is refused rather than silently ignored.
 *
 * sdk-typescript#267 / axonflow-enterprise#3682 item 4.
 *
 * The option was accepted, normalised into the internal config, and read by NO
 * request path — so responses were never cached, while the default resolved to
 * `enabled: true` and every client reported caching ON. A config option that
 * does nothing is worse than an absent one: the caller is making a cost and
 * latency assumption the SDK does not honour, and nothing tells them.
 */

import { AxonFlow } from '../src/client';
import { ConfigurationError } from '../src/errors';

const BASE = { endpoint: 'http://localhost:8080', clientId: 'id', clientSecret: 'secret' };

describe('the cache option', () => {
  it('throws a typed error when explicitly passed', () => {
    expect(() => new AxonFlow({ ...BASE, cache: { enabled: true, ttl: 60000 } })).toThrow(
      ConfigurationError
    );
  });

  it('throws even when the caller explicitly DISABLES it', () => {
    // `{ enabled: false }` looks like "I do not want caching", which the SDK
    // already delivers — but the caller still believes the option is wired up,
    // and the next person who flips it to true would get silence. The option
    // does not exist; saying so once is better than being right by accident.
    expect(() => new AxonFlow({ ...BASE, cache: { enabled: false } })).toThrow(ConfigurationError);
  });

  it('does NOT throw for a client that never mentions cache', () => {
    // THE LOAD-BEARING CASE. The old default was `enabled: config.cache?.enabled !== false`,
    // so every existing client — including the overwhelming majority that never
    // asked for a cache — resolved to "caching on". A blanket construction-time
    // throw would therefore break every application in existence, not just the
    // ones that opted in. Only an EXPLICIT `cache` is refused.
    expect(() => new AxonFlow(BASE)).not.toThrow();
  });

  it('does not throw for an explicit undefined', () => {
    // `{ ...opts, cache: undefined }` is what spreading a partial config
    // produces. It says nothing, so it is not an opt-in.
    expect(() => new AxonFlow({ ...BASE, cache: undefined })).not.toThrow();
  });

  it('names the problem, the fix, and the identity hazard', () => {
    let message = '';
    try {
      new AxonFlow({ ...BASE, cache: { enabled: true } });
    } catch (e) {
      message = (e as Error).message;
    }

    // A diagnostic that only says "not supported" sends the reader to the
    // changelog. This one has to carry why it never worked, what to do instead,
    // and the trap waiting for anyone who builds their own.
    expect(message).toContain('never had any effect');
    expect(message).toContain('cache at');
    expect(message).toContain('identity');
    expect(message).toContain('267');
  });

  it('no longer reports a cache that does not exist', () => {
    // The internal config used to carry `cache: { enabled: true, ttl: 60000 }`
    // for every client. Anything reading it — a debug dump, a support bundle —
    // would report caching as ON. There is nothing to report.
    const client = new AxonFlow(BASE);
    const config = (client as unknown as { config: Record<string, unknown> }).config;
    expect(config).not.toHaveProperty('cache');
  });

  it('the asUser docstring no longer claims a shared cache', () => {
    // The claim was in the shipped .d.ts hover, so it reached users as API
    // documentation. Asserted on the source because a docstring is the only
    // part of this change with no runtime behaviour to test.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'client.ts'), 'utf8');
    const asUserDoc = src.slice(
      src.indexOf('An empty token returns a client presenting no identity') - 3000,
      src.indexOf('An empty token returns a client presenting no identity')
    );
    expect(asUserDoc).not.toContain("shares this one's cache");
    expect(asUserDoc).toContain('It shares no CACHE');
  });
});
