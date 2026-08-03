/**
 * #3254 - audit model: additive real-wire fields + deprecations.
 *
 * These tests feed RAW wire JSON through the real client parse path
 * (mocked fetch -> orchestratorRequest -> parseAuditLogEntry), never a
 * hand-built camelCase object, so they exercise the transformer and not
 * just the type shape.
 *
 * Fixture provenance:
 *   tests/fixtures/audit-search-live-3254.json is a REAL capture taken
 *   2026-08-03 from an isolated community v9.13.0 stack (session 3254,
 *   clone of getaxonflow/axonflow tag v9.13.0, df027c788): two entries
 *   written via POST /api/v1/audit/tool-call and read back via
 *   POST /api/v1/audit/search through the agent proxy. The wire carries
 *   policy_decision / policy_details / response_time_ms and NONE of the
 *   seven fiction fields (query_summary, success, blocked, risk_score,
 *   latency_ms, policy_violations, metadata).
 *
 * The old-server and both-present payloads below are HAND-MODIFIED
 * variants of that capture and say so inline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AxonFlow } from '../src/client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const liveCapture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'audit-search-live-3254.json'), 'utf8')
);

describe('#3254 audit real-wire fields', () => {
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

  const mockResponse = (data: unknown, status = 200) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });

  describe('real captured payload through the real parse path', () => {
    it('populates policyDecision/policyDetails/responseTimeMs and leaves fiction fields at defaults', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(liveCapture));

      const result = await client.searchAuditLogs({ limit: 10 });

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(2);

      // Entry 0 is the failure-shaped probe: verdict "error" proves the
      // policy_decision set is OPEN (not the allowed/blocked/redacted trio).
      const errEntry = result.entries[0];
      expect(errEntry.policyDecision).toBe('error');
      expect(errEntry.policyDetails).toMatchObject({
        success: false,
        tool_name: 's3254_blocked_probe',
      });
      expect(errEntry.responseTimeMs).toBe(0);

      const okEntry = result.entries[1];
      expect(okEntry.policyDecision).toBe('allowed');
      expect(okEntry.policyDetails).toMatchObject({
        success: true,
        tool_name: 's3254_capture_probe',
      });
      expect(okEntry.responseTimeMs).toBe(0);

      // Real fields still parse.
      expect(errEntry.id).toBe('audit_1785794706_23m371y7');
      expect(errEntry.tenantId).toBe('community');
      expect(errEntry.requestType).toBe('tool_call_audit');
      expect(errEntry.timestamp).toBeInstanceOf(Date);

      // The seven fiction fields: the real server never sends them, so
      // they must sit at their historical parse defaults - unchanged
      // behavior, now documented as deprecated.
      for (const entry of result.entries) {
        expect(entry.querySummary).toBe('');
        expect(entry.success).toBe(true); // historical default, even on the error row
        expect(entry.blocked).toBe(false);
        expect(entry.riskScore).toBe(0);
        expect(entry.latencyMs).toBe(0);
        expect(entry.policyViolations).toEqual([]);
        expect(entry.metadata).toEqual({});
      }
    });
  });

  describe('old-server tolerance', () => {
    it('parses a payload WITHOUT the three new fields; new fields stay undefined', async () => {
      // HAND-MODIFIED variant of the live capture: the three #3254 wire
      // fields are stripped to simulate a pre-9.x/old server response.
      const oldServer = JSON.parse(JSON.stringify(liveCapture)) as {
        entries: Record<string, unknown>[];
      };
      for (const e of oldServer.entries) {
        delete e.policy_decision;
        delete e.policy_details;
        delete e.response_time_ms;
      }
      mockFetch.mockReturnValueOnce(mockResponse(oldServer));

      const result = await client.searchAuditLogs();

      expect(result.entries).toHaveLength(2);
      for (const entry of result.entries) {
        expect(entry.policyDecision).toBeUndefined();
        expect(entry.policyDetails).toBeUndefined();
        expect(entry.responseTimeMs).toBeUndefined();
        // Real fields unaffected.
        expect(entry.tenantId).toBe('community');
      }
    });
  });

  describe('both-present', () => {
    it('parses fictional AND real fields in one payload without collision', async () => {
      // HAND-MODIFIED variant of the live capture: the seven fiction wire
      // tags are ADDED alongside the real #3254 fields.
      const both = JSON.parse(JSON.stringify(liveCapture)) as {
        entries: Record<string, unknown>[];
      };
      Object.assign(both.entries[0], {
        query_summary: 'legacy summary',
        success: false,
        blocked: true,
        risk_score: 0.9,
        latency_ms: 123,
        policy_violations: ['legacy-policy'],
        metadata: { legacy: true },
      });
      mockFetch.mockReturnValueOnce(mockResponse(both));

      const result = await client.searchAuditLogs();
      const entry = result.entries[0];

      // Deprecated fields still parse when (hypothetically) present.
      expect(entry.querySummary).toBe('legacy summary');
      expect(entry.success).toBe(false);
      expect(entry.blocked).toBe(true);
      expect(entry.riskScore).toBe(0.9);
      expect(entry.latencyMs).toBe(123);
      expect(entry.policyViolations).toEqual(['legacy-policy']);
      expect(entry.metadata).toEqual({ legacy: true });

      // And the real fields coexist untouched.
      expect(entry.policyDecision).toBe('error');
      expect(entry.responseTimeMs).toBe(0);
      expect(entry.policyDetails).toMatchObject({ tool_name: 's3254_blocked_probe' });
    });
  });

  describe('search request serialization', () => {
    it('serializes action to `action` and keeps requestType serializing to `request_type`', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ entries: [], total: 0, limit: 100, offset: 0 }));

      await client.searchAuditLogs({ action: 'blocked', requestType: 'llm_chat' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
      expect(body.action).toBe('blocked');
      // Deprecated but still sent - harmless, the 9.x server ignores it.
      expect(body.request_type).toBe('llm_chat');
      // No camelCase leakage onto the wire.
      expect(body).not.toHaveProperty('requestType');
    });

    it('omits action from the wire when not set', async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ entries: [], total: 0, limit: 100, offset: 0 }));

      await client.searchAuditLogs({ userEmail: 'a@b.c' });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
      expect(body).not.toHaveProperty('action');
      expect(body.user_email).toBe('a@b.c');
    });
  });
});
