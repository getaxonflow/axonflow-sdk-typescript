/**
 * Tests for decisions.explain (ADR-043) + audit search filter parity (ADR-042).
 */

import { AxonFlow } from '../src/client';
import type { AuditSearchRequest } from '../src/types/gateway';
import type { DecisionExplanation } from '../src/types/decisions';

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
        decision: 'deny',
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
      expect(exp.decision).toBe('deny');
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
          decision: 'allow',
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
          decision: 'allow',
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

    it('handles minimal responses without optional fields', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          decision_id: 'dec-1',
          timestamp: '2026-04-17T12:00:00Z',
          decision: 'allow',
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
