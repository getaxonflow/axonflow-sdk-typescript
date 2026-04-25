/**
 * Generic policy with full metadata. Mirrors the OpenAPI `Policy`
 * schema; SDK consumers historically only saw the rules-shape, but
 * the wire emits a richer object with category, tier, action,
 * pattern, lifecycle timestamps, and ownership scoping.
 */
export interface Policy {
  /**
   * Policy UUID
   */
  id: string;

  /**
   * Human-readable policy identifier (e.g. `sys_sqli_union_select`).
   */
  policy_id?: string;

  /**
   * Policy name
   */
  name: string;

  /**
   * Free-form description.
   */
  description?: string;

  /**
   * Policy type
   */
  type: 'static' | 'dynamic';

  /**
   * Policy category for grouping and filtering.
   */
  category?: string;

  /**
   * Policy tier in the hierarchy.
   */
  tier?: 'system' | 'organization' | 'tenant';

  /**
   * Regex pattern (for static policies).
   */
  pattern?: string;

  /**
   * Severity level.
   */
  severity?: 'critical' | 'high' | 'medium' | 'low';

  /**
   * Action to take when the policy fires.
   */
  action?: 'block' | 'require_approval' | 'redact' | 'warn' | 'log';

  /**
   * Multiple actions for fan-out policies.
   */
  actions?: string[];

  /**
   * Conditions for dynamic policies.
   */
  conditions?: Array<Record<string, unknown>>;

  /**
   * Is the policy enabled?
   */
  enabled: boolean;

  /**
   * Policy rules (legacy shape; static policies expose `pattern`
   * directly on the wire instead).
   */
  rules?: PolicyRule[];

  /**
   * Priority (lower numbers = higher priority)
   */
  priority: number;

  /** Organization ID for organization-tier policies. */
  organization_id?: string;
  /** Tenant ID for tenant-tier policies. */
  tenant_id?: string;
  /** Creation timestamp. */
  created_at?: string;
  /** Last-update timestamp. */
  updated_at?: string;
  /** Author of the policy. */
  created_by?: string;
  /** Last editor. */
  updated_by?: string;
  /** Version counter for change tracking. */
  version?: number;
}

export interface PolicyRule {
  /**
   * Rule condition
   */
  condition: {
    field: string;
    operator: 'equals' | 'contains' | 'regex' | 'greater' | 'less';
    value: any;
  };

  /**
   * Action to take if condition matches
   */
  action: 'allow' | 'deny' | 'redact' | 'modify' | 'log';

  /**
   * Optional message
   */
  message?: string;
}
