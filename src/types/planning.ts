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
  /** Actions required before proceeding (canonical wire field). */
  required_actions?: string[];
  /** Time taken for policy evaluation in milliseconds (canonical wire field). */
  processing_time_ms?: number;
  /** Whether any database was accessed during evaluation (canonical wire field). */
  database_accessed?: boolean;
  /**
   * @deprecated Use `required_actions` (matches the wire). The decoder
   * is JSON.parse passthrough, so `requiredActions` has always read
   * `undefined`. Removed in v7.
   */
  requiredActions?: string[];
  /**
   * @deprecated Use `processing_time_ms`. Same orphan-read situation.
   * Removed in v7.
   */
  processingTimeMs?: number;
  /**
   * @deprecated Use `database_accessed`. Same orphan-read situation.
   * Removed in v7.
   */
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
  /** Whether the plan was created successfully (wire top-level field). */
  success?: boolean;
  /** Plan version number for optimistic locking. */
  version?: number;
  /** Final aggregated result if the plan executed inline. */
  result?: unknown;
  /** Error message if creation failed. */
  error?: string;
  /** Workflow execution ID if the plan was auto-executed. */
  workflow_execution_id?: string;
  /** Policy evaluation summary for this plan creation. */
  policy_info?: PolicyEvaluationResult;
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
 *
 * Wire shape: `{ success, plan_id, status }`. The transformer in
 * `cancelPlan` reads `data.plan_id` (correct) and `data.message`
 * (which the server doesn't emit — broken). Use `success` and the
 * `status` enum to detect outcome; `message` has always read
 * `undefined`.
 */
export interface CancelPlanResponse {
  planId: string;
  status: 'cancelled' | string;
  /** Whether the cancel succeeded (canonical wire field). */
  success?: boolean;
  /**
   * @deprecated The wire emits `success` (boolean) + `status` enum,
   * not `message`. This field has always read `undefined`. Removed
   * in v7.
   */
  message?: string;
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
  /** Arbitrary metadata to set on the plan, opaque to the platform. */
  metadata?: Record<string, unknown>;
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
 *
 * Wire shape: `{ plan_id, status, result }`. The 5 fields below marked
 * @deprecated were declared but never populated by the `resumePlan`
 * transformer — they have always read `undefined`. Use `result` and
 * `status` for resume outcomes.
 */
export interface ResumePlanResponse {
  planId: string;
  status: 'awaiting_approval' | 'completed' | 'failed' | string;
  /** Final aggregated result if the resume completed (canonical wire field). */
  result?: unknown;
  approved?: boolean;
  /**
   * @deprecated Declared on the interface but never populated by the
   * `resumePlan` transformer. Always read `undefined`. Removed in v7.
   */
  workflowId?: string;
  /**
   * @deprecated Same as `workflowId` — never populated. Removed in v7.
   */
  message?: string;
  /**
   * @deprecated Never populated; the wire emits `result`. Use `result`.
   * Removed in v7.
   */
  stepResult?: Record<string, any>;
  /**
   * @deprecated Never populated; not on the wire. Removed in v7.
   */
  nextStep?: number;
  /**
   * @deprecated Never populated; not on the wire. Removed in v7.
   */
  nextStepName?: string;
  /**
   * @deprecated Never populated; not on the wire. Removed in v7.
   */
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
