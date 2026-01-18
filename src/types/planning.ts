/**
 * Multi-Agent Planning (MAP) types for AxonFlow SDK
 */

// ============================================================================
// Policy Enforcement Types (Issues #1019, #1020, #1021)
// ============================================================================

/**
 * Information about a matched policy during evaluation.
 * Used in both MAP (Multi-Agent Planning) and WCP (Workflow Control Plane)
 * policy enforcement.
 */
export interface PolicyMatch {
  /** Unique identifier of the matched policy */
  policyId: string;
  /** Human-readable name of the policy */
  policyName: string;
  /** Action taken by the policy (block, allow, redact, require_approval, warn, log) */
  action: string;
  /** Reason for the policy match or action taken */
  reason?: string;
}

/**
 * Result of policy evaluation for a workflow step or plan execution.
 * Provides comprehensive information about policy enforcement decisions.
 */
export interface PolicyEvaluationResult {
  /** Whether the operation is allowed to proceed */
  allowed: boolean;
  /** List of policy IDs that were applied */
  appliedPolicies: string[];
  /** Calculated risk score (0-100) based on policy evaluation */
  riskScore: number;
  /** Actions required before proceeding (e.g., "approval_required", "mfa_required") */
  requiredActions?: string[];
  /** Time taken for policy evaluation in milliseconds */
  processingTimeMs: number;
  /** Whether any database was accessed during evaluation */
  databaseAccessed?: boolean;
}

// ============================================================================
// Plan Types
// ============================================================================

export interface PlanStep {
  id: string;
  name: string;
  type: string;
  description: string;
  dependsOn: string[];
  agent: string;
  parameters: Record<string, any>;
}

export interface PlanResponse {
  planId: string;
  steps: PlanStep[];
  domain: string;
  complexity: number;
  parallel: boolean;
  metadata: Record<string, any>;
}

export interface PlanExecutionResponse {
  planId: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  stepResults?: Record<string, any>;
  error?: string;
  duration?: string;
  /** Policy evaluation result for this plan execution (Issue #1020) */
  policyInfo?: PolicyEvaluationResult;
}
