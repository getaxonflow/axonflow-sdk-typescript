/**
 * Tests for decisions.explain (ADR-043) + decisions.list (Session γ #1982)
 * + audit search filter parity (ADR-042).
 */

import { AxonFlow, buildListDecisionsQuery } from '../src/client';
import { RateLimitError, APIError, AuthenticationError } from '../src/errors';
import type { AuditSearchRequest } from '../src/types/gateway';
import type { DecisionExplanation, ListDecisionsOptions } from '../src/types/decisions';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Decision Explainability (ADR-043)', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tenant: 'test-tenant',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockResponse = (data: unknown, status = 200) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });

  describe('explainDecision', () => {
    it('rejects empty decision ID', async () => {
      await expect(client.explainDecision('')).rejects.toThrow(/required/);
    });

    it('calls the correct endpoint and parses full payload', async () => {
      const raw = {
        decision_id: 'dec_wf1_step2',
        timestamp: '2026-04-17T12:00:00Z',
        decision: 'blocked',
        reason: 'SQL injection detected',
        risk_level: 'high',
        policy_matches: [
          {
            policy_id: 'pol-sqli',
            policy_name: 'SQL Injection Detector',
            action: 'deny',
            risk_level: 'high',
            allow_override: true,
            policy_description: 'Blocks SQL injection',
          },
        ],
        matched_rules: [
          {
            policy_id: 'pol-sqli',
            rule_id: 'r-1',
            rule_text: 'UNION SELECT',
            matched_on: 'query.sql',
          },
        ],
        override_available: true,
        override_existing_id: 'ov-abc',
        historical_hit_count_session: 3,
        policy_source_link: 'https://policies.axonflow/sqli',
        tool_signature: 'Bash',
      };
      mockFetch.mockReturnValueOnce(mockResponse(raw));

      const exp: DecisionExplanation = await client.explainDecision('dec_wf1_step2');

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0] as string;
      expect(url).toContain('/api/v1/decisions/dec_wf1_step2/explain');
      expect((callArgs[1] as { method: string }).method).toBe('GET');

      expect(exp.decisionId).toBe('dec_wf1_step2');
      expect(exp.decision).toBe('blocked');
      expect(exp.policyMatches).toHaveLength(1);
      expect(exp.policyMatches[0].policyId).toBe('pol-sqli');
      expect(exp.policyMatches[0].allowOverride).toBe(true);
      expect(exp.matchedRules).toHaveLength(1);
      expect(exp.matchedRules![0].ruleText).toBe('UNION SELECT');
      expect(exp.overrideAvailable).toBe(true);
      expect(exp.overrideExistingId).toBe('ov-abc');
      expect(exp.historicalHitCountSession).toBe(3);
      expect(exp.toolSignature).toBe('Bash');
      expect(exp.timestamp).toBeInstanceOf(Date);
    });

    it('URL-encodes the decision ID', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          decision_id: 'a/b',
          timestamp: '2026-04-17T12:00:00Z',
          decision: 'allowed',
          reason: '',
          policy_matches: [],
          override_available: false,
          historical_hit_count_session: 0,
        })
      );
      await client.explainDecision('a/b');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('a%2Fb/explain');
    });

    it('tolerates unknown extra fields for forward compatibility', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          decision_id: 'dec-1',
          timestamp: '2026-04-17T12:00:00Z',
          decision: 'allowed',
          reason: '',
          policy_matches: [],
          override_available: false,
          historical_hit_count_session: 0,
          future_field_unknown: { nested: true },
        })
      );
      const exp = await client.explainDecision('dec-1');
      expect(exp.decisionId).toBe('dec-1');
    });

    it('surfaces the full request context + contextTruncated (v8.4.0)', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          decision_id: 'dec-ctx',
          timestamp: '2026-05-30T12:00:00Z',
          decision: 'blocked',
          reason: '',
          policy_matches: [],
          override_available: false,
          historical_hit_count_session: 0,
          context: {
            x_ai_agent: 'refund-bot',
            x_session_id: 'sess-42',
            x_leader_identity: 'ops-lead',
          },
          context_truncated: true,
        })
      );
      const exp = await client.explainDecision('dec-ctx');
      expect(exp.context).toEqual({
        x_ai_agent: 'refund-bot',
        x_session_id: 'sess-42',
        x_leader_identity: 'ops-lead',
      });
      expect(exp.contextTruncated).toBe(true);
    });

    it('leaves context + contextTruncated undefined for pre-v8.4.0 rows', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          decision_id: 'dec-1',
          timestamp: '2026-04-17T12:00:00Z',
          decision: 'allowed',
          reason: '',
          policy_matches: [],
          override_available: false,
          historical_hit_count_session: 0,
        })
      );
      const exp = await client.explainDecision('dec-1');
      expect(exp.context).toBeUndefined();
      expect(exp.contextTruncated).toBeUndefined();
    });

    it('handles minimal responses without optional fields', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          decision_id: 'dec-1',
          timestamp: '2026-04-17T12:00:00Z',
          decision: 'allowed',
          reason: '',
          policy_matches: [],
          override_available: false,
          historical_hit_count_session: 0,
        })
      );
      const exp = await client.explainDecision('dec-1');
      expect(exp.matchedRules).toBeUndefined();
      expect(exp.overrideExistingId).toBeUndefined();
    });
  });

  describe('AuditSearchRequest new filters (ADR-042/ADR-043)', () => {
    it('sends decision_id when set', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ entries: [], total: 0, limit: 100, offset: 0 }));
      const req: AuditSearchRequest = { decisionId: 'dec-abc' };
      await client.searchAuditLogs(req);

      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
      expect(body.decision_id).toBe('dec-abc');
    });

    it('sends policy_name when set', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ entries: [], total: 0, limit: 100, offset: 0 }));
      const req: AuditSearchRequest = { policyName: 'SQL Injection Detector' };
      await client.searchAuditLogs(req);

      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
      expect(body.policy_name).toBe('SQL Injection Detector');
    });

    it('sends override_id when set', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ entries: [], total: 0, limit: 100, offset: 0 }));
      const req: AuditSearchRequest = { overrideId: 'ov-xyz' };
      await client.searchAuditLogs(req);

      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
      expect(body.override_id).toBe('ov-xyz');
    });

    it('omits all three filter fields when unset', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ entries: [], total: 0, limit: 100, offset: 0 }));
      await client.searchAuditLogs({});

      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
      expect(body.decision_id).toBeUndefined();
      expect(body.policy_name).toBeUndefined();
      expect(body.override_id).toBeUndefined();
    });
  });
});

// ============================================================================
// listDecisions — Session γ contract tests (#1982)
// ============================================================================

describe('listDecisions (Session γ #1982)', () => {
  let client: AxonFlow;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AxonFlow({
      endpoint: 'http://localhost:8080',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tenant: 'test-tenant',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const ok = (data: unknown) =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });

  const status = (status: number, statusText: string, data: unknown) =>
    Promise.resolve({
      ok: false,
      status,
      statusText,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    });

  it('happy path — parses 3-row payload', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        decisions: [
          {
            decision_id: 'dec-1',
            timestamp: '2026-05-07T12:00:00Z',
            decision: 'blocked',
            policy_id: 'pol-sqli',
            tool_signature: 'postgres.query',
          },
          {
            decision_id: 'dec-2',
            timestamp: '2026-05-07T11:00:00Z',
            decision: 'allowed',
            policy_id: 'pol-default',
            tool_signature: 'github.status',
          },
          {
            decision_id: 'dec-3',
            timestamp: '2026-05-07T10:00:00Z',
            decision: 'needs_approval',
            policy_id: 'pol-amount',
            tool_signature: 'stripe.charge',
          },
        ],
      })
    );

    const got = await client.listDecisions();
    expect(got).toHaveLength(3);
    expect(got[0].decisionId).toBe('dec-1');
    expect(got[0].decision).toBe('blocked');
    expect(got[0].policyId).toBe('pol-sqli');
    expect(got[0].toolSignature).toBe('postgres.query');
    expect(got[2].decision).toBe('needs_approval');
  });

  it('surfaces the truncated request context on the summary (v8.4.0)', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        decisions: [
          {
            decision_id: 'dec-ctx',
            timestamp: '2026-05-30T12:00:00Z',
            decision: 'blocked',
            context: {
              x_ai_agent: 'refund-bot',
              x_session_id: 'sess-42',
              x_leader_identity: 'ops-lead',
            },
          },
        ],
      })
    );
    const got = await client.listDecisions();
    expect(got[0].context).toEqual({
      x_ai_agent: 'refund-bot',
      x_session_id: 'sess-42',
      x_leader_identity: 'ops-lead',
    });
  });

  it('leaves context undefined for decisions without one', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        decisions: [
          { decision_id: 'dec-noctx', timestamp: '2026-05-30T12:00:00Z', decision: 'allowed' },
        ],
      })
    );
    const got = await client.listDecisions();
    expect(got[0].context).toBeUndefined();
  });

  it('serializes every filter into the URL', async () => {
    mockFetch.mockReturnValueOnce(ok({ decisions: [] }));
    const opts: ListDecisionsOptions = {
      since: new Date('2026-05-07T00:00:00Z'),
      decision: 'blocked',
      policyId: 'pol-sqli',
      toolSignature: 'postgres.query',
      limit: 25,
    };
    await client.listDecisions(opts);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('since=2026-05-07T00%3A00%3A00Z');
    expect(calledUrl).toContain('decision=blocked');
    expect(calledUrl).toContain('policy_id=pol-sqli');
    expect(calledUrl).toContain('tool_signature=postgres.query');
    expect(calledUrl).toContain('limit=25');
  });

  it('omits unset filters from the URL', async () => {
    mockFetch.mockReturnValueOnce(ok({ decisions: [] }));
    await client.listDecisions({ decision: 'blocked' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('?decision=blocked');
    expect(calledUrl).not.toContain('since=');
    expect(calledUrl).not.toContain('policy_id=');
    expect(calledUrl).not.toContain('tool_signature=');
    expect(calledUrl).not.toContain('limit=');
  });

  it('429 surfaces typed RateLimitError with upgrade envelope', async () => {
    mockFetch.mockReturnValueOnce(
      status(429, 'Too Many Requests', {
        error:
          'Free tier shows the last 5 decisions in 24h. Pro raises this to 100 decisions in the last 30 days.',
        limit_type: 'decision_list_size',
        tier: 'Community',
        limit: 5,
        remaining: 0,
        upgrade: {
          tier: 'Pro',
          wording:
            'Free tier shows the last 5 decisions in 24h. Pro raises this to 100 decisions in the last 30 days.',
          compare_url: 'https://getaxonflow.com/pricing/',
          buy_url: 'https://buy.stripe.com/bJe28qbztcdVchjdkw8k800',
        },
      })
    );

    let caught: unknown;
    try {
      await client.listDecisions({ limit: 10 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RateLimitError);
    const rle = caught as RateLimitError;
    expect(rle.tier).toBe('Community');
    expect(rle.limitType).toBe('decision_list_size');
    expect(rle.limit).toBe(5);
    expect(rle.upgrade).toBeDefined();
    expect(rle.upgrade!.tier).toBe('Pro');
    expect(rle.upgrade!.compareUrl).toBe('https://getaxonflow.com/pricing/');
    expect(rle.upgrade!.buyUrl).toBe('https://buy.stripe.com/bJe28qbztcdVchjdkw8k800');
  });

  it('429 with malformed body falls back to APIError(429) — never silently OK', async () => {
    mockFetch.mockReturnValueOnce(status(429, 'Too Many Requests', 'not a json envelope'));

    let caught: unknown;
    try {
      await client.listDecisions();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(APIError);
    expect(caught).not.toBeInstanceOf(RateLimitError);
    expect((caught as APIError).statusCode).toBe(429);
  });

  it('401 surfaces as AuthenticationError', async () => {
    mockFetch.mockReturnValueOnce(
      status(401, 'Unauthorized', { error: 'X-Tenant-ID header is required' })
    );
    await expect(client.listDecisions()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('forward-compat — additive unknown fields ignored', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        decisions: [
          {
            decision_id: 'dec-fwd',
            timestamp: '2026-05-07T12:00:00Z',
            decision: 'blocked',
            policy_id: 'pol-x',
            tool_signature: 'tool-x',
            policy_version: 7,
            latest_policy_version: 9,
            arbitrary_unknown: 'ignored',
          },
        ],
        next_cursor: 'future_cursor_pagination',
      })
    );
    const got = await client.listDecisions();
    expect(got).toHaveLength(1);
    expect(got[0].decisionId).toBe('dec-fwd');
  });

  it('parses summaries that omit policy_id + tool_signature (dynamic-only blocks)', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        decisions: [
          { decision_id: 'dec-min', timestamp: '2026-05-07T12:00:00Z', decision: 'blocked' },
        ],
      })
    );
    const got = await client.listDecisions();
    expect(got[0].policyId).toBeUndefined();
    expect(got[0].toolSignature).toBeUndefined();
  });
});

describe('buildListDecisionsQuery (#1982)', () => {
  it('returns empty when opts is undefined or empty', () => {
    expect(buildListDecisionsQuery(undefined)).toBe('');
    expect(buildListDecisionsQuery({})).toBe('');
  });

  it('omits unset fields and emits stable order', () => {
    const qs = buildListDecisionsQuery({ decision: 'blocked', limit: 7 });
    expect(qs).toBe('decision=blocked&limit=7');
  });
});
