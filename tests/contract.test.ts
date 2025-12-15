/**
 * Contract Tests for AxonFlow SDK
 *
 * These tests validate that the SDK correctly parses responses from the Agent API.
 * Fixtures are recorded from real Agent API responses to ensure contract compliance.
 *
 * Key validations:
 * - Datetime parsing with nanosecond precision
 * - Policy name extraction from policy_info
 * - Processing time parsing
 * - Response schema validation
 */

import * as fs from 'fs';
import * as path from 'path';

// Load fixtures
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture<T>(name: string): T {
  const filePath = path.join(fixturesDir, name);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

// Types matching Agent API response structure
interface AgentQueryResponse {
  request_id: string;
  success: boolean;
  blocked: boolean;
  block_reason?: string;
  data: any;
  policy_info: {
    policies_evaluated: string[];
    processing_time: string;
    risk_score: number;
    categories?: string[];
    violations?: Array<{
      type: string;
      pattern: string;
      confidence: number;
      location: string;
      [key: string]: any;
    }>;
  };
  metadata: {
    version: string;
    region: string;
    timestamp: string;
  };
}

interface AgentPlanResponse {
  request_id: string;
  success: boolean;
  blocked: boolean;
  plan_id: string;
  data: {
    steps: Array<{
      id: string;
      name: string;
      type: string;
      description: string;
      dependsOn: string[];
      agent: string;
      parameters: Record<string, any>;
    }>;
    domain: string;
    complexity: number;
    parallel: boolean;
  };
  policy_info: {
    policies_evaluated: string[];
    processing_time: string;
    risk_score: number;
  };
  metadata: Record<string, any>;
}

interface AgentPreCheckResponse {
  context_id: string;
  approved: boolean;
  approved_data: Record<string, any>;
  policies: string[];
  expires_at: string;
  block_reason?: string;
  rate_limit?: {
    limit: number;
    remaining: number;
    reset_at: string;
  };
  metadata: Record<string, any>;
}

interface AgentAuditResponse {
  success: boolean;
  audit_id: string;
  metadata: Record<string, any>;
}

describe('Contract Tests - Agent API Response Parsing', () => {
  describe('Query Response - Success', () => {
    let fixture: AgentQueryResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentQueryResponse>('query_success.json');
    });

    it('should have required fields', () => {
      expect(fixture.request_id).toBeDefined();
      expect(typeof fixture.request_id).toBe('string');
      expect(fixture.success).toBe(true);
      expect(fixture.blocked).toBe(false);
    });

    it('should parse policy_info correctly', () => {
      expect(fixture.policy_info).toBeDefined();
      expect(Array.isArray(fixture.policy_info.policies_evaluated)).toBe(true);
      expect(fixture.policy_info.policies_evaluated.length).toBeGreaterThan(0);
    });

    it('should extract policy name from policies_evaluated', () => {
      const policyName = fixture.policy_info.policies_evaluated[0];
      expect(policyName).toBe('default-policy');
      expect(typeof policyName).toBe('string');
    });

    it('should parse processing_time string', () => {
      const processingTime = fixture.policy_info.processing_time;
      expect(processingTime).toMatch(/^\d+\.?\d*ms$/);

      // Extract numeric value
      const numericValue = parseFloat(processingTime.replace('ms', ''));
      expect(numericValue).toBeGreaterThan(0);
      expect(numericValue).toBeLessThan(10000); // Sanity check
    });

    it('should parse timestamp with nanosecond precision', () => {
      const timestamp = fixture.metadata.timestamp;
      // RFC3339 with nanoseconds: 2025-12-15T14:30:45.123456789Z
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/);

      // JavaScript Date should handle this (truncates to milliseconds)
      const date = new Date(timestamp);
      expect(date.getTime()).toBeGreaterThan(0);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it('should have valid risk_score', () => {
      expect(fixture.policy_info.risk_score).toBeGreaterThanOrEqual(0);
      expect(fixture.policy_info.risk_score).toBeLessThanOrEqual(1);
    });
  });

  describe('Query Response - Blocked (PII)', () => {
    let fixture: AgentQueryResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentQueryResponse>('query_blocked_pii.json');
    });

    it('should indicate blocked status', () => {
      expect(fixture.blocked).toBe(true);
      expect(fixture.block_reason).toBeDefined();
      expect(fixture.block_reason).toContain('PII');
    });

    it('should extract policy name from blocked response', () => {
      const policyName = fixture.policy_info.policies_evaluated[0];
      expect(policyName).toBe('pii-detection-ssn');
    });

    it('should include violation details', () => {
      expect(fixture.policy_info.violations).toBeDefined();
      expect(Array.isArray(fixture.policy_info.violations)).toBe(true);
      expect(fixture.policy_info.violations!.length).toBeGreaterThan(0);

      const violation = fixture.policy_info.violations![0];
      expect(violation.type).toBe('pii');
      expect(violation.pattern).toBe('ssn');
      expect(violation.confidence).toBeGreaterThan(0.9);
    });

    it('should have high risk_score for PII violation', () => {
      expect(fixture.policy_info.risk_score).toBeGreaterThan(0.9);
    });

    it('should parse nanosecond timestamp in blocked response', () => {
      const timestamp = fixture.metadata.timestamp;
      const date = new Date(timestamp);
      expect(isNaN(date.getTime())).toBe(false);

      // Verify it's a reasonable date (within this century)
      expect(date.getFullYear()).toBeGreaterThanOrEqual(2024);
      expect(date.getFullYear()).toBeLessThanOrEqual(2030);
    });
  });

  describe('Query Response - Blocked (SQL Injection)', () => {
    let fixture: AgentQueryResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentQueryResponse>('query_blocked_sqli.json');
    });

    it('should indicate SQL injection block', () => {
      expect(fixture.blocked).toBe(true);
      expect(fixture.block_reason).toContain('SQL injection');
    });

    it('should have security category', () => {
      expect(fixture.policy_info.categories).toContain('security');
      expect(fixture.policy_info.categories).toContain('sql-injection');
    });

    it('should have maximum risk score for SQLi', () => {
      expect(fixture.policy_info.risk_score).toBeGreaterThanOrEqual(0.99);
    });
  });

  describe('Plan Generation Response', () => {
    let fixture: AgentPlanResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentPlanResponse>('plan_generate.json');
    });

    it('should have plan_id', () => {
      expect(fixture.plan_id).toBeDefined();
      expect(typeof fixture.plan_id).toBe('string');
      expect(fixture.plan_id.length).toBeGreaterThan(0);
    });

    it('should have valid steps array', () => {
      expect(fixture.data.steps).toBeDefined();
      expect(Array.isArray(fixture.data.steps)).toBe(true);
      expect(fixture.data.steps.length).toBeGreaterThan(0);
    });

    it('should have valid step structure', () => {
      const step = fixture.data.steps[0];
      expect(step.id).toBeDefined();
      expect(step.name).toBeDefined();
      expect(step.type).toBeDefined();
      expect(step.description).toBeDefined();
      expect(Array.isArray(step.dependsOn)).toBe(true);
      expect(step.agent).toBeDefined();
      expect(step.parameters).toBeDefined();
    });

    it('should have domain information', () => {
      expect(fixture.data.domain).toBe('travel');
    });

    it('should have complexity score', () => {
      expect(fixture.data.complexity).toBeGreaterThanOrEqual(1);
      expect(fixture.data.complexity).toBeLessThanOrEqual(10);
    });

    it('should parse processing time for plan generation', () => {
      const processingTime = fixture.policy_info.processing_time;
      const numericValue = parseFloat(processingTime.replace('ms', ''));
      // Plan generation typically takes longer
      expect(numericValue).toBeGreaterThan(10);
    });
  });

  describe('Pre-Check Response - Approved', () => {
    let fixture: AgentPreCheckResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentPreCheckResponse>('pre_check_approved.json');
    });

    it('should have context_id', () => {
      expect(fixture.context_id).toBeDefined();
      expect(typeof fixture.context_id).toBe('string');
    });

    it('should indicate approval', () => {
      expect(fixture.approved).toBe(true);
      expect(fixture.block_reason).toBeUndefined();
    });

    it('should have approved_data', () => {
      expect(fixture.approved_data).toBeDefined();
      expect(fixture.approved_data.query).toBeDefined();
    });

    it('should parse expires_at with nanosecond precision', () => {
      const expiresAt = fixture.expires_at;
      expect(expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/);

      const date = new Date(expiresAt);
      expect(isNaN(date.getTime())).toBe(false);

      // expires_at should be in the future (or recent past for fixture)
      const now = new Date('2025-12-15T14:35:00Z');
      expect(date.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should have rate_limit information', () => {
      expect(fixture.rate_limit).toBeDefined();
      expect(fixture.rate_limit!.limit).toBeGreaterThan(0);
      expect(fixture.rate_limit!.remaining).toBeLessThanOrEqual(fixture.rate_limit!.limit);
    });

    it('should parse rate_limit reset_at', () => {
      const resetAt = new Date(fixture.rate_limit!.reset_at);
      expect(isNaN(resetAt.getTime())).toBe(false);
    });
  });

  describe('Pre-Check Response - Blocked', () => {
    let fixture: AgentPreCheckResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentPreCheckResponse>('pre_check_blocked.json');
    });

    it('should indicate blocked status', () => {
      expect(fixture.approved).toBe(false);
      expect(fixture.block_reason).toBeDefined();
    });

    it('should still have context_id for audit trail', () => {
      expect(fixture.context_id).toBeDefined();
    });

    it('should have empty approved_data when blocked', () => {
      expect(Object.keys(fixture.approved_data).length).toBe(0);
    });
  });

  describe('Audit Response', () => {
    let fixture: AgentAuditResponse;

    beforeAll(() => {
      fixture = loadFixture<AgentAuditResponse>('audit_success.json');
    });

    it('should indicate success', () => {
      expect(fixture.success).toBe(true);
    });

    it('should have audit_id', () => {
      expect(fixture.audit_id).toBeDefined();
      expect(typeof fixture.audit_id).toBe('string');
    });

    it('should have metadata with timestamp', () => {
      expect(fixture.metadata).toBeDefined();
      expect(fixture.metadata.timestamp).toBeDefined();
    });
  });

  describe('Datetime Parsing Edge Cases', () => {
    const testCases = [
      { name: 'standard RFC3339', value: '2025-12-15T14:30:45Z' },
      { name: 'milliseconds', value: '2025-12-15T14:30:45.123Z' },
      { name: 'microseconds', value: '2025-12-15T14:30:45.123456Z' },
      { name: 'nanoseconds', value: '2025-12-15T14:30:45.123456789Z' },
    ];

    testCases.forEach(({ name, value }) => {
      it(`should parse ${name} precision`, () => {
        const date = new Date(value);
        expect(isNaN(date.getTime())).toBe(false);
        expect(date.getFullYear()).toBe(2025);
        expect(date.getMonth()).toBe(11); // December is 11
        expect(date.getDate()).toBe(15);
      });
    });
  });

  describe('Processing Time Parsing', () => {
    const testCases = [
      { input: '3.456ms', expected: 3.456 },
      { input: '0.001ms', expected: 0.001 },
      { input: '100ms', expected: 100 },
      { input: '45.678912345ms', expected: 45.678912345 },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should parse "${input}" to ${expected}`, () => {
        const numericValue = parseFloat(input.replace('ms', ''));
        expect(numericValue).toBeCloseTo(expected, 10);
      });
    });
  });

  describe('SDK Response Transformation', () => {
    it('should transform Agent response to SDK GovernanceResponse format', () => {
      const agentResponse = loadFixture<AgentQueryResponse>('query_success.json');

      // Simulate SDK transformation logic (from client.ts checkPolicies)
      const policyName = agentResponse.policy_info.policies_evaluated[0] || 'agent-policy';
      const sdkResponse = {
        requestId: 'test-request-id',
        allowed: !agentResponse.blocked,
        violations: agentResponse.blocked
          ? [
              {
                type: 'security' as const,
                severity: 'high' as const,
                description: agentResponse.block_reason || 'Request blocked by policy',
                policy: policyName,
                action: 'blocked' as const,
              },
            ]
          : [],
        modifiedRequest: agentResponse.data,
        policies: agentResponse.policy_info.policies_evaluated,
        audit: {
          timestamp: Date.now(),
          duration: parseFloat(agentResponse.policy_info.processing_time.replace('ms', '')) || 0,
          tenant: 'test-tenant',
        },
      };

      expect(sdkResponse.allowed).toBe(true);
      expect(sdkResponse.violations).toHaveLength(0);
      expect(sdkResponse.policies).toContain('default-policy');
      // Verify duration preserves decimal precision
      expect(sdkResponse.audit.duration).toBeCloseTo(3.456, 3);
    });

    it('should transform blocked response with policy name extraction', () => {
      const agentResponse = loadFixture<AgentQueryResponse>('query_blocked_pii.json');

      const policyName = agentResponse.policy_info.policies_evaluated[0] || 'agent-policy';
      const sdkResponse = {
        requestId: 'test-request-id',
        allowed: !agentResponse.blocked,
        violations: agentResponse.blocked
          ? [
              {
                type: 'security' as const,
                severity: 'high' as const,
                description: agentResponse.block_reason || 'Request blocked by policy',
                policy: policyName,
                action: 'blocked' as const,
              },
            ]
          : [],
        modifiedRequest: agentResponse.data,
        policies: agentResponse.policy_info.policies_evaluated,
        audit: {
          timestamp: Date.now(),
          duration: parseFloat(agentResponse.policy_info.processing_time.replace('ms', '')) || 0,
          tenant: 'test-tenant',
        },
      };

      expect(sdkResponse.allowed).toBe(false);
      expect(sdkResponse.violations).toHaveLength(1);
      expect(sdkResponse.violations[0].policy).toBe('pii-detection-ssn');
      expect(sdkResponse.violations[0].description).toContain('PII');
      // Verify duration preserves decimal precision (5.234789123ms)
      expect(sdkResponse.audit.duration).toBeCloseTo(5.234789123, 6);
    });

    it('should transform pre-check response with datetime handling', () => {
      const agentResponse = loadFixture<AgentPreCheckResponse>('pre_check_approved.json');

      // Simulate SDK transformation (from client.ts getPolicyApprovedContext)
      const expiresAt = agentResponse.expires_at
        ? new Date(agentResponse.expires_at)
        : new Date(Date.now() + 5 * 60 * 1000);

      const sdkResponse = {
        contextId: agentResponse.context_id,
        approved: agentResponse.approved,
        approvedData: agentResponse.approved_data || {},
        policies: agentResponse.policies || [],
        expiresAt,
        blockReason: agentResponse.block_reason,
        rateLimitInfo: agentResponse.rate_limit
          ? {
              limit: agentResponse.rate_limit.limit,
              remaining: agentResponse.rate_limit.remaining,
              resetAt: new Date(agentResponse.rate_limit.reset_at),
            }
          : undefined,
      };

      expect(sdkResponse.contextId).toBe('ctx_pre_check_001');
      expect(sdkResponse.approved).toBe(true);
      expect(sdkResponse.expiresAt).toBeInstanceOf(Date);
      expect(sdkResponse.rateLimitInfo).toBeDefined();
      expect(sdkResponse.rateLimitInfo!.limit).toBe(1000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty policies_evaluated array gracefully', () => {
      const mockResponse = {
        policy_info: {
          policies_evaluated: [],
          processing_time: '1ms',
        },
      };

      // SDK should fallback to 'agent-policy' when array is empty
      const policyName = mockResponse.policy_info.policies_evaluated[0] || 'agent-policy';
      expect(policyName).toBe('agent-policy');
    });

    it('should handle undefined policy_info gracefully', () => {
      const mockResponse: { policy_info?: { policies_evaluated?: string[] } } = {};

      // SDK should handle missing policy_info
      const policyName = mockResponse.policy_info?.policies_evaluated?.[0] || 'agent-policy';
      expect(policyName).toBe('agent-policy');
    });

    it('should handle processing_time with 0ms value', () => {
      const processingTime = '0ms';
      const numericValue = parseFloat(processingTime.replace('ms', ''));
      expect(numericValue).toBe(0);
    });

    it('should handle very large processing_time values', () => {
      const processingTime = '9999.999999999ms';
      const numericValue = parseFloat(processingTime.replace('ms', ''));
      expect(numericValue).toBeCloseTo(9999.999999999, 6);
    });

    it('should handle timestamps without fractional seconds', () => {
      const timestamp = '2025-12-15T14:30:45Z';
      const date = new Date(timestamp);
      expect(isNaN(date.getTime())).toBe(false);
      expect(date.getFullYear()).toBe(2025);
    });

    it('should handle rate_limit being undefined', () => {
      const mockResponse: {
        rate_limit?: { limit: number; remaining: number };
      } = {
        rate_limit: undefined,
      };

      const rateLimitInfo = mockResponse.rate_limit
        ? {
            limit: mockResponse.rate_limit.limit,
            remaining: mockResponse.rate_limit.remaining,
          }
        : undefined;

      expect(rateLimitInfo).toBeUndefined();
    });

    it('should handle null data field in blocked response', () => {
      const mockResponse = {
        blocked: true,
        data: null,
      };

      // SDK transformation should handle null data
      const modifiedRequest = mockResponse.data;
      expect(modifiedRequest).toBeNull();
    });
  });

  describe('Fixture Validation', () => {
    const fixtureFiles = [
      'query_success.json',
      'query_blocked_pii.json',
      'query_blocked_sqli.json',
      'plan_generate.json',
      'pre_check_approved.json',
      'pre_check_blocked.json',
      'audit_success.json',
    ];

    fixtureFiles.forEach(filename => {
      it(`should load and parse ${filename} as valid JSON`, () => {
        expect(() => {
          loadFixture(filename);
        }).not.toThrow();
      });
    });

    it('should throw error for non-existent fixture', () => {
      expect(() => {
        loadFixture('non_existent_fixture.json');
      }).toThrow();
    });
  });
});
