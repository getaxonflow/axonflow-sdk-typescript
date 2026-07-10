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
 * Wire shape (see `ResumePlanResponse` in the community OpenAPI spec and
 * the orchestrator's resume handler): `plan_id`, `workflow_id` and
 * `status` are always present. On the step/confirm-mode HITL path —
 * where the platform executes the approved step and gates the next one
 * for approval — the response additionally carries `step_result`,
 * `next_step`, `next_step_name` and `total_steps`. On terminal resumes
 * (plan completed or rejected) those step-mode fields are absent and
 * `message` summarizes the outcome instead.
 */
export interface ResumePlanResponse {
  planId: string;
  status: 'awaiting_approval' | 'completed' | 'failed' | string;
  /** Final aggregated result if the resume completed (canonical wire field). */
  result?: unknown;
  approved?: boolean;
  /**
   * WCP workflow id the plan is bound to. Surfaced on every resume
   * response so callers don't need a separate plan-status round-trip.
   */
  workflowId?: string;
  /**
   * Human-readable summary of the resume outcome (e.g. "All steps
   * completed", "Step rejected, plan aborted"). Populated on terminal
   * resume paths; absent when the platform gates the next step.
   */
  message?: string;
  /**
   * Result of the step that was waiting on this approval. Populated on
   * the step/confirm-mode HITL resume path; shape depends on the step
   * type, so treat it as opaque unless the step type is known. Absent
   * on terminal resumes that executed no step.
   */
  stepResult?: Record<string, any>;
  /**
   * Index of the next step the orchestrator gated for approval.
   * Populated on the step/confirm-mode HITL resume path when the
   * platform pauses before the next step (`status: 'awaiting_approval'`);
   * absent on terminal resumes.
   */
  nextStep?: number;
  /**
   * Name of the step at `nextStep` (mirrors PlanStep.name). Populated
   * alongside `nextStep` on the step/confirm-mode HITL resume path;
   * absent on terminal resumes.
   */
  nextStepName?: string;
  /**
   * Total number of steps in the plan, so callers can render
   * "Step N of M" without a separate plan-status lookup. Populated on
   * the step/confirm-mode HITL resume path; absent on terminal resumes.
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
