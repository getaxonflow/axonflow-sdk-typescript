/**
 * #3254 pin-advance batch - masfeat models: additive real-wire fields +
 * deprecations (RegistrySummary, AISystemRegistry, KillSwitch).
 *
 * These tests feed RAW wire JSON through the real client parse path
 * (mocked fetch -> masfeat methods -> mapSystemResponse /
 * mapKillSwitchResponse / the getRegistrySummary literal), never a
 * hand-built camelCase object.
 *
 * Fixture provenance: the payloads below are SOURCE-DERIVED fixtures, NOT
 * captures. They are constructed field-by-field from the server structs at
 * the pinned community tag v9.13.0 (df027c788):
 * platform/orchestrator/masfeat/types.go - AISystemRegistry (json tags
 * id/org_id/system_id/system_name/use_case/status/risk_rating_impact/
 * risk_rating_complexity/risk_rating_reliance/materiality_classification/
 * owner_team/owner_email/created_at/updated_at/created_by/...),
 * RegistrySummary (org_id/total_systems/active_systems/high_materiality/
 * medium_materiality/low_materiality/assessments_due/
 * kill_switches_triggered), KillSwitch (id/org_id/system_id/status/
 * trigger_reason/trigger_conditions/auto_trigger_enabled/thresholds/
 * triggered_at/triggered_by/restored_at/restored_by/restore_reason/
 * created_at/updated_at). The masfeat module is enterprise-gated
 * (//go:build enterprise), so the community s3254 stack 404s these routes -
 * a live capture was attempted and is reported in the PR body; these
 * fixtures stand on the struct definitions instead.
 */

import { AxonFlow } from '../src/client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// SOURCE-DERIVED wire payloads (see provenance note above). Every key is a
// json tag that exists on the v9.13.0 server struct; the seven fiction
// wire tags (high_materiality_count, by_use_case, by_status,
// technical_owner, business_owner, customer_impact, model_complexity,
// human_reliance, triggered_reason) are deliberately ABSENT, as they are
// on the real wire.
const registrySummaryWire = {
  org_id: 'org-3254',
  total_systems: 7,
  active_systems: 5,
  high_materiality: 2,
  medium_materiality: 3,
  low_materiality: 2,
  assessments_due: 4,
  kill_switches_triggered: 1,
};

const aiSystemWire = {
  id: 'sys-3254',
  org_id: 'org-3254',
  system_id: 'credit-model-v9',
  system_name: 'Credit Scoring v9',
  use_case: 'credit_scoring',
  status: 'active',
  risk_rating_impact: 4,
  risk_rating_complexity: 3,
  risk_rating_reliance: 5,
  materiality_classification: 'high',
  owner_team: 'risk-eng',
  owner_email: 'owner@bank.example',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  created_by: 'admin@bank.example',
};

const killSwitchWire = {
  id: 'ks-3254',
  org_id: 'org-3254',
  system_id: 'credit-model-v9',
  status: 'triggered',
  trigger_reason: 'bias threshold breached',
  trigger_conditions: { bias_max: 0.1 },
  auto_trigger_enabled: true,
  accuracy_threshold: 0.95,
  bias_threshold: 0.1,
  error_rate_threshold: 0.05,
  triggered_at: '2026-08-03T10:00:00Z',
  triggered_by: 'auto-trigger',
  restored_at: '2026-08-03T11:00:00Z',
  restored_by: 'ops@bank.example',
  restore_reason: 'model retrained',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-03T11:00:00Z',
};

describe('#3254 masfeat real-wire fields', () => {
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

  describe('RegistrySummary through the real parse path', () => {
    it('populates the real wire fields and keeps the deprecated fallbacks working', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(registrySummaryWire));

      const summary = await client.masfeat.getRegistrySummary();

      // New real fields (#3254).
      expect(summary.orgId).toBe('org-3254');
      expect(summary.highMateriality).toBe(2);
      expect(summary.mediumMateriality).toBe(3);
      expect(summary.lowMateriality).toBe(2);
      expect(summary.assessmentsDue).toBe(4);
      expect(summary.killSwitchesTriggered).toBe(1);

      // Real pre-existing fields.
      expect(summary.totalSystems).toBe(7);
      expect(summary.activeSystems).toBe(5);

      // Deprecated dual-read props stay populated via the real-wire
      // fallback (unchanged behavior).
      expect(summary.highMaterialityCount).toBe(2);
      expect(summary.mediumMaterialityCount).toBe(3);
      expect(summary.lowMaterialityCount).toBe(2);

      // Pure fiction props stay at their historical {} defaults - the
      // server never sends by_use_case/by_status.
      expect(summary.byUseCase).toEqual({});
      expect(summary.byStatus).toEqual({});
    });

    it('old-server tolerance: a payload without org_id/assessments_due/kill_switches_triggered parses', async () => {
      // HAND-MODIFIED source-derived payload: optional-coverage fields
      // stripped to simulate an older server.
      const old: Record<string, unknown> = { ...registrySummaryWire };
      delete old.org_id;
      delete old.assessments_due;
      delete old.kill_switches_triggered;
      mockFetch.mockReturnValueOnce(mockResponse(old));

      const summary = await client.masfeat.getRegistrySummary();
      expect(summary.orgId).toBeUndefined();
      expect(summary.assessmentsDue).toBeUndefined();
      expect(summary.killSwitchesTriggered).toBeUndefined();
      expect(summary.totalSystems).toBe(7);
      expect(summary.highMateriality).toBe(2);
    });
  });

  describe('AISystemRegistry through the real parse path', () => {
    it('populates ownerEmail/riskRating* and keeps the deprecated fallbacks working', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(aiSystemWire));

      const sys = await client.masfeat.getSystem('sys-3254');

      // New real fields (#3254).
      expect(sys.ownerEmail).toBe('owner@bank.example');
      expect(sys.riskRatingImpact).toBe(4);
      expect(sys.riskRatingComplexity).toBe(3);
      expect(sys.riskRatingReliance).toBe(5);

      // Deprecated dual-read props stay populated via the real-wire
      // fallbacks (unchanged behavior): businessOwner falls back to
      // owner_email, customerImpact/modelComplexity/humanReliance fall
      // back to risk_rating_*.
      expect(sys.businessOwner).toBe('owner@bank.example');
      expect(sys.customerImpact).toBe(4);
      expect(sys.modelComplexity).toBe(3);
      expect(sys.humanReliance).toBe(5);

      // technicalOwner is PURE fiction: the wire has no technical_owner
      // and no fallback exists - always undefined against real servers.
      expect(sys.technicalOwner).toBeUndefined();

      // Real pre-existing fields.
      expect(sys.ownerTeam).toBe('risk-eng');
      expect(sys.materialityClassification).toBe('high');
      expect(sys.createdAt).toBeInstanceOf(Date);
    });

    it('old-server tolerance: a payload without owner_email/risk_rating_* parses', async () => {
      // HAND-MODIFIED source-derived payload: new-coverage fields stripped.
      const old: Record<string, unknown> = { ...aiSystemWire };
      delete old.owner_email;
      delete old.risk_rating_impact;
      delete old.risk_rating_complexity;
      delete old.risk_rating_reliance;
      mockFetch.mockReturnValueOnce(mockResponse(old));

      const sys = await client.masfeat.getSystem('sys-3254');
      expect(sys.ownerEmail).toBeUndefined();
      expect(sys.riskRatingImpact).toBeUndefined();
      expect(sys.riskRatingComplexity).toBeUndefined();
      expect(sys.riskRatingReliance).toBeUndefined();
      expect(sys.systemName).toBe('Credit Scoring v9');
    });
  });

  describe('both-present: fiction and real keys on one payload, different values', () => {
    // Canonical-parity discriminators (batch R3): a payload serving BOTH
    // the fiction key and the real key with DIFFERENT values. The new real
    // props must read ONLY the real key (never shadowed by fiction), and
    // the deprecated dual-read props surface the fiction key first,
    // exactly as their JSDoc documents. These are HAND-BUILT hypothetical
    // payloads - no real 9.x server sends the fiction keys.
    it('RegistrySummary: real props read only real keys; deprecated props prefer fiction', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          total_systems: 1,
          active_systems: 1,
          high_materiality: 2,
          high_materiality_count: 9,
          medium_materiality: 3,
          medium_materiality_count: 9,
          low_materiality: 0,
          low_materiality_count: 9,
          by_use_case: { fiction: 1 },
          by_status: { fiction: 2 },
        })
      );
      const s = await client.masfeat.getRegistrySummary();
      // Real props carry the real key even when fiction is present and
      // even when the real value is 0.
      expect(s.highMateriality).toBe(2);
      expect(s.mediumMateriality).toBe(3);
      expect(s.lowMateriality).toBe(0);
      // Deprecated dual-reads surface the fiction key first (documented).
      expect(s.highMaterialityCount).toBe(9);
      expect(s.mediumMaterialityCount).toBe(9);
      expect(s.lowMaterialityCount).toBe(9);
      expect(s.byUseCase).toEqual({ fiction: 1 });
      expect(s.byStatus).toEqual({ fiction: 2 });
    });

    it('AISystemRegistry: real props unshadowed; deprecated props prefer fiction', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          ...aiSystemWire,
          owner_email: 'real@x',
          business_owner: 'fiction@x',
          technical_owner: 'fiction-tech@x',
          customer_impact: 9,
          risk_rating_impact: 2,
          model_complexity: 9,
          risk_rating_complexity: 3,
          human_reliance: 9,
          risk_rating_reliance: 4,
        })
      );
      const sys = await client.masfeat.getSystem('s1');
      expect(sys.ownerEmail).toBe('real@x');
      expect(sys.riskRatingImpact).toBe(2);
      expect(sys.riskRatingComplexity).toBe(3);
      expect(sys.riskRatingReliance).toBe(4);
      expect(sys.businessOwner).toBe('fiction@x');
      expect(sys.technicalOwner).toBe('fiction-tech@x');
      expect(sys.customerImpact).toBe(9);
      expect(sys.modelComplexity).toBe(9);
      expect(sys.humanReliance).toBe(9);
    });

    it('KillSwitch: real triggerReason unshadowed; deprecated triggeredReason prefers fiction', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          ...killSwitchWire,
          trigger_reason: 'real reason',
          triggered_reason: 'fiction reason',
        })
      );
      const ks = await client.masfeat.getKillSwitch('s1');
      expect(ks.triggerReason).toBe('real reason');
      expect(ks.triggeredReason).toBe('fiction reason');
    });
  });

  describe('KillSwitch through the real parse path', () => {
    it('populates triggerReason/triggerConditions/restoreReason and keeps the deprecated fallback working', async () => {
      mockFetch.mockReturnValueOnce(mockResponse(killSwitchWire));

      const ks = await client.masfeat.getKillSwitch('credit-model-v9');

      // New real fields (#3254).
      expect(ks.triggerReason).toBe('bias threshold breached');
      expect(ks.triggerConditions).toEqual({ bias_max: 0.1 });
      expect(ks.restoreReason).toBe('model retrained');

      // Deprecated triggeredReason stays populated via the real
      // trigger_reason fallback (unchanged behavior).
      expect(ks.triggeredReason).toBe('bias threshold breached');

      // Real pre-existing fields.
      expect(ks.status).toBe('triggered');
      expect(ks.autoTriggerEnabled).toBe(true);
      expect(ks.triggeredAt).toBeInstanceOf(Date);
    });

    it('parses the nested {kill_switch: {...}} envelope with the new fields', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ kill_switch: killSwitchWire, message: 'triggered' })
      );

      const ks = await client.masfeat.triggerKillSwitch('credit-model-v9', {
        reason: 'bias threshold breached',
      });
      expect(ks.triggerReason).toBe('bias threshold breached');
      expect(ks.restoreReason).toBe('model retrained');
    });

    it('old-server tolerance: a payload without trigger_reason/trigger_conditions/restore_reason parses', async () => {
      // HAND-MODIFIED source-derived payload: optional fields stripped
      // (they are omitempty on the server struct).
      const old: Record<string, unknown> = { ...killSwitchWire };
      delete old.trigger_reason;
      delete old.trigger_conditions;
      delete old.restore_reason;
      mockFetch.mockReturnValueOnce(mockResponse(old));

      const ks = await client.masfeat.getKillSwitch('credit-model-v9');
      expect(ks.triggerReason).toBeUndefined();
      expect(ks.triggerConditions).toBeUndefined();
      expect(ks.restoreReason).toBeUndefined();
      // With trigger_reason absent the deprecated dual-read is also
      // undefined - both spellings absent means genuinely no reason.
      expect(ks.triggeredReason).toBeUndefined();
      expect(ks.status).toBe('triggered');
    });
  });
});
