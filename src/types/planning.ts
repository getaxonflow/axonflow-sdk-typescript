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
  status: string;
  steps: PlanStep[];
  domain: string;
  complexity: number;
  parallel: boolean;
  metadata: Record<string, any>;
}

/**
 * Known status values for plan execution.
 * Uses a union type for compile-time safety while allowing extension.
 */
export type PlanExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting_approval';

export interface PlanExecutionResponse {
  planId: string;
  status: PlanExecutionStatus;
  workflowId?: string;
  result?: string;
  stepResults?: Record<string, any>;
  error?: string;
  duration?: string;
  /** Policy evaluation result for this plan execution (Issue #1020) */
  policyInfo?: PolicyEvaluationResult;
}

// ============================================================================
// MAP v1.0 Types (Issue #1072)
// ============================================================================

/**
 * Execution mode for plan generation and updates.
 * Controls how steps are scheduled during execution.
 */
export type ExecutionMode = 'auto' | 'sequential' | 'parallel' | 'balanced' | 'confirm' | 'step';

/**
 * Options for generating a plan with additional configuration.
 */
export interface GeneratePlanOptions {
  /** Execution mode hint for the planner */
  executionMode?: ExecutionMode;
}

/**
 * Response from cancelling a plan.
 */
export interface CancelPlanResponse {
  planId: string;
  status: string;
  message: string;
}

/**
 * Request to update a plan with optimistic concurrency control.
 */
export interface UpdatePlanRequest {
  /** Expected version number for optimistic concurrency (required) */
  version: number;
  /** New execution mode for the plan */
  executionMode?: ExecutionMode;
  /** New domain hint for the plan */
  domain?: string;
}

/**
 * Response from updating a plan.
 */
export interface UpdatePlanResponse {
  planId: string;
  version: number;
  status: string;
  success: boolean;
}

/**
 * A single entry in the plan version history.
 */
export interface PlanVersionEntry {
  version: number;
  changedAt: string;
  changedBy?: string;
  changeType: string;
  changeSummary?: string;
}

/**
 * Response containing the version history for a plan.
 */
export interface PlanVersionsResponse {
  planId: string;
  versions: PlanVersionEntry[];
}

/**
 * Response from resuming a paused plan.
 */
export interface ResumePlanResponse {
  planId: string;
  workflowId?: string;
  status: string;
  approved?: boolean;
  message?: string;
  stepResult?: Record<string, any>;
  nextStep?: number;
  nextStepName?: string;
  totalSteps?: number;
}

/**
 * Response from rolling back a plan to a previous version.
 */
export interface RollbackPlanResponse {
  /** Plan ID */
  planId: string;
  /** The version rolled back to */
  version: number;
  /** The version that was replaced */
  previousVersion: number;
  /** Status of the rollback */
  status: string;
}
