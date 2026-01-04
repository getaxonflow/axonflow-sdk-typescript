/**
 * Policy CRUD types for AxonFlow SDK
 * Part of Unified Policy Architecture v2.0.0
 */

// ============================================================================
// Policy Categories and Tiers
// ============================================================================

/**
 * Policy categories for organization and filtering
 */
export type PolicyCategory =
  | 'security-sqli'
  | 'security-admin'
  | 'pii-global'
  | 'pii-us'
  | 'pii-eu'
  | 'pii-india'
  | 'dynamic-risk'
  | 'dynamic-compliance'
  | 'dynamic-security'
  | 'dynamic-cost'
  | 'dynamic-access'
  | 'custom';

/**
 * Policy tiers determine where policies apply
 * - system: Platform-wide policies (read-only, managed by AxonFlow)
 * - organization: Organization-specific policies (Enterprise)
 * - tenant: Tenant-specific policies
 */
export type PolicyTier = 'system' | 'organization' | 'tenant';

/**
 * Override action for policy overrides
 * - block: Immediately block the request
 * - require_approval: Pause for human approval (HITL)
 * - redact: Mask sensitive content
 * - warn: Log warning, allow request
 * - log: Audit only
 */
export type OverrideAction = 'block' | 'require_approval' | 'redact' | 'warn' | 'log';

/**
 * Action to take when policy matches
 * - block: Immediately block the request
 * - require_approval: Pause for human approval (HITL)
 * - redact: Mask sensitive content
 * - warn: Log warning, allow request
 * - log: Audit only
 * - allow: Explicitly allow (for overrides)
 */
export type PolicyAction = 'block' | 'require_approval' | 'redact' | 'warn' | 'log' | 'allow';

/**
 * Policy severity levels
 */
export type PolicySeverity = 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// Static Policy Types
// ============================================================================

/**
 * Static policy definition
 */
export interface StaticPolicy {
  /** Unique policy identifier */
  id: string;
  /** Human-readable policy name */
  name: string;
  /** Policy description */
  description?: string;
  /** Policy category for grouping and filtering */
  category: PolicyCategory;
  /** Policy tier (system, organization, tenant) */
  tier: PolicyTier;
  /** Regex pattern to match against input */
  pattern: string;
  /** Severity level (critical, high, medium, low) */
  severity: PolicySeverity;
  /** Whether the policy is enabled */
  enabled: boolean;
  /** Action to take when pattern matches */
  action: PolicyAction;
  /** Organization ID (for organization-tier policies) */
  organizationId?: string;
  /** Tenant ID (for tenant-tier policies) */
  tenantId?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Version number for tracking changes */
  version?: number;
  /** Whether this policy has an active override */
  hasOverride?: boolean;
  /** Active override details */
  override?: PolicyOverride;
}

/**
 * Options for listing static policies
 */
export interface ListStaticPoliciesOptions {
  /** Filter by category */
  category?: PolicyCategory;
  /** Filter by tier */
  tier?: PolicyTier;
  /** Filter by organization ID (Enterprise) */
  organizationId?: string;
  /** Filter by enabled status */
  enabled?: boolean;
  /** Maximum number of results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort field */
  sortBy?: 'name' | 'severity' | 'category' | 'createdAt' | 'updatedAt';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Search query for name/description */
  search?: string;
}

/**
 * Request to create a new static policy
 */
export interface CreateStaticPolicyRequest {
  /** Human-readable policy name */
  name: string;
  /** Policy description */
  description?: string;
  /** Policy category */
  category: PolicyCategory;
  /** Policy tier (defaults to 'tenant' for custom policies) */
  tier?: PolicyTier;
  /** Organization ID for organization-tier policies (Enterprise) */
  organizationId?: string;
  /** Regex pattern to match */
  pattern: string;
  /** Severity level (critical, high, medium, low) */
  severity?: PolicySeverity;
  /** Whether the policy is enabled */
  enabled?: boolean;
  /** Action to take when pattern matches */
  action?: PolicyAction;
}

/**
 * Request to update an existing static policy
 */
export interface UpdateStaticPolicyRequest {
  /** Updated policy name */
  name?: string;
  /** Updated description */
  description?: string;
  /** Updated category */
  category?: PolicyCategory;
  /** Updated pattern */
  pattern?: string;
  /** Updated severity */
  severity?: PolicySeverity;
  /** Updated enabled status */
  enabled?: boolean;
  /** Updated action */
  action?: PolicyAction;
}

// ============================================================================
// Policy Override Types
// ============================================================================

/**
 * Policy override configuration
 */
export interface PolicyOverride {
  /** Policy ID this override applies to */
  policy_id: string;
  /** Override action */
  action_override: OverrideAction;
  /** Reason for the override */
  override_reason: string;
  /** Who created the override */
  created_by?: string;
  /** When the override was created */
  created_at: string;
  /** When the override expires (optional) */
  expires_at?: string;
  /** Whether the override is currently active */
  active: boolean;
}

/**
 * Request to create a policy override
 */
export interface CreatePolicyOverrideRequest {
  /** Override action */
  action_override: OverrideAction;
  /** Reason for the override */
  override_reason: string;
  /** Optional expiration date (ISO 8601 format) */
  expires_at?: string;
}

// ============================================================================
// Dynamic Policy Types
// ============================================================================

/**
 * Condition for dynamic policy evaluation
 */
export interface DynamicPolicyCondition {
  /** Field to evaluate */
  field: string;
  /** Comparison operator */
  operator: string;
  /** Value to compare against */
  value: unknown;
}

/**
 * Action to take when dynamic policy conditions are met
 */
export interface DynamicPolicyAction {
  /** Action type: "block", "alert", "redact", "log", "route", "modify_risk" */
  type: string;
  /** Action configuration */
  config?: Record<string, unknown>;
}

/**
 * Dynamic policy definition
 *
 * Dynamic policies are LLM-powered policies that can evaluate complex,
 * context-aware rules that can't be expressed with simple regex patterns.
 */
export interface DynamicPolicy {
  /** Unique policy identifier */
  id: string;
  /** Human-readable policy name */
  name: string;
  /** Policy description */
  description?: string;
  /** Policy type: "risk", "content", "user", "cost" */
  type: string;
  /** Conditions for policy evaluation */
  conditions?: DynamicPolicyCondition[];
  /** Actions to take when conditions are met */
  actions?: DynamicPolicyAction[];
  /** Priority for policy evaluation (higher = evaluated first) */
  priority: number;
  /** Whether the policy is enabled */
  enabled: boolean;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Options for listing dynamic policies
 */
export interface ListDynamicPoliciesOptions {
  /** Filter by policy type: "risk", "content", "user", "cost" */
  type?: string;
  /** Filter by enabled status */
  enabled?: boolean;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort field */
  sortBy?: 'name' | 'type' | 'priority' | 'created_at' | 'updated_at';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Search query */
  search?: string;
}

/**
 * Request to create a dynamic policy
 */
export interface CreateDynamicPolicyRequest {
  /** Policy name */
  name: string;
  /** Policy description */
  description?: string;
  /** Policy type: "risk", "content", "user", "cost" */
  type: string;
  /** Conditions for policy evaluation */
  conditions?: DynamicPolicyCondition[];
  /** Actions to take when conditions are met */
  actions?: DynamicPolicyAction[];
  /** Priority for policy evaluation */
  priority?: number;
  /** Whether the policy is enabled */
  enabled?: boolean;
}

/**
 * Request to update a dynamic policy
 */
export interface UpdateDynamicPolicyRequest {
  /** Updated name */
  name?: string;
  /** Updated description */
  description?: string;
  /** Updated type */
  type?: string;
  /** Updated conditions */
  conditions?: DynamicPolicyCondition[];
  /** Updated actions */
  actions?: DynamicPolicyAction[];
  /** Updated priority */
  priority?: number;
  /** Updated enabled status */
  enabled?: boolean;
}

// ============================================================================
// Pattern Testing Types
// ============================================================================

/**
 * Result of testing a regex pattern
 */
export interface TestPatternResult {
  /** Whether the pattern is valid */
  valid: boolean;
  /** Error message if pattern is invalid */
  error?: string;
  /** The pattern that was tested */
  pattern: string;
  /** The inputs that were tested */
  inputs: string[];
  /** Match results for each input */
  matches: TestPatternMatch[];
}

/**
 * Individual pattern match result
 */
export interface TestPatternMatch {
  /** The input that was tested */
  input: string;
  /** Whether the pattern matched */
  matched: boolean;
  /** Captured groups if any */
  groups?: string[];
}

// ============================================================================
// Policy Version Types
// ============================================================================

/**
 * Policy version history entry
 */
export interface PolicyVersion {
  /** Version number */
  version: number;
  /** Who made the change */
  changedBy?: string;
  /** When the change was made */
  changedAt: string;
  /** Type of change */
  changeType: 'created' | 'updated' | 'enabled' | 'disabled' | 'deleted';
  /** Description of changes */
  changeDescription?: string;
  /** Previous values (for updates) */
  previousValues?: Record<string, unknown>;
  /** New values */
  newValues?: Record<string, unknown>;
}

// ============================================================================
// Effective Policies Types
// ============================================================================

/**
 * Options for getting effective policies
 */
export interface EffectivePoliciesOptions {
  /** Filter by category */
  category?: PolicyCategory;
  /** Include disabled policies */
  includeDisabled?: boolean;
  /** Include overridden policies */
  includeOverridden?: boolean;
}

/**
 * Response containing effective policies with tier inheritance applied
 */
export interface EffectivePoliciesResponse {
  /** Effective policies after tier inheritance */
  policies: StaticPolicy[] | DynamicPolicy[];
  /** Inheritance chain information */
  inheritance: {
    /** System policies count */
    systemPolicies: number;
    /** Organization policies count */
    organizationPolicies: number;
    /** Tenant policies count */
    tenantPolicies: number;
    /** Overrides applied */
    overridesApplied: number;
  };
}

// ============================================================================
// Paginated Response Type
// ============================================================================

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  /** Array of items */
  items: T[];
  /** Total number of items */
  total: number;
  /** Current page limit */
  limit: number;
  /** Current offset */
  offset: number;
  /** Whether there are more items */
  hasMore: boolean;
}
