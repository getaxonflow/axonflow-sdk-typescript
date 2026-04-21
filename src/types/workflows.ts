/**
 * Workflow Control Plane Types for AxonFlow SDK.
 *
 * The Workflow Control Plane provides governance gates for external orchestrators
 * like LangChain, LangGraph, and CrewAI. These types define the request/response
 * structures for registering workflows, checking step gates, and managing workflow
 * lifecycle.
 *
 * "LangChain runs the workflow. AxonFlow decides when it's allowed to move forward."
 */

import { PolicyMatch } from './planning';

/**
 * Workflow status values.
 */
export type WorkflowStatus = 'in_progress' | 'completed' | 'aborted' | 'failed';

/**
 * Source orchestrator running the workflow.
 */
export type WorkflowSource = 'langgraph' | 'langchain' | 'crewai' | 'external';

/**
 * Gate decision values returned by step gate checks.
 */
export type GateDecision = 'allow' | 'block' | 'require_approval';

/**
 * Approval status for steps requiring human approval.
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Step type indicating what kind of operation the step performs.
 */
export type StepType = 'llm_call' | 'tool_call' | 'connector_call' | 'human_task';

/**
 * Request to create a new workflow.
 */
export interface CreateWorkflowRequest {
  /** Human-readable name for the workflow */
  workflow_name: string;
  /** Source orchestrator running the workflow */
  source?: WorkflowSource;
  /** Additional metadata for the workflow */
  metadata?: Record<string, unknown>;
  /** Optional trace ID for correlating workflows with external tracing systems */
  trace_id?: string;
}

/**
 * Response from creating a workflow.
 */
export interface CreateWorkflowResponse {
  /** Unique identifier for the workflow */
  workflow_id: string;
  /** Name of the workflow */
  workflow_name: string;
  /** Source orchestrator */
  source: WorkflowSource;
  /** Current status (always 'in_progress' for new workflows) */
  status: WorkflowStatus;
  /** When the workflow was created */
  created_at: string;
  /** Trace ID for correlating with external tracing systems */
  trace_id?: string;
}

/** Tool-level context for per-tool governance within tool_call steps. */
export interface ToolContext {
  /** Name of the tool being invoked. */
  tool_name: string;
  /** Tool type: "function", "mcp", or "api". */
  tool_type?: string;
  /** Tool input parameters. */
  tool_input?: Record<string, unknown>;
}

/**
 * Controls how step gate decisions behave on repeated calls for the same (workflow_id, step_id).
 * - "idempotent": return cached decision if the step was already evaluated (default)
 * - "reevaluate": force fresh policy evaluation regardless of prior decision
 */
export type RetryPolicy = 'idempotent' | 'reevaluate';

/**
 * Request to check if a step is allowed to proceed.
 */
export interface StepGateRequest {
  /** Human-readable name for the step */
  step_name?: string;
  /** Type of step being executed */
  step_type: StepType;
  /** Input data for the step (for policy evaluation) */
  step_input?: Record<string, unknown>;
  /** LLM model being used (if applicable) */
  model?: string;
  /** LLM provider (if applicable) */
  provider?: string;
  /** Tool context for per-tool governance within tool_call steps */
  tool_context?: ToolContext;
  /** Retry behavior: "idempotent" (default) returns cached decision, "reevaluate" forces fresh evaluation */
  retry_policy?: RetryPolicy;
  /**
   * Caller-supplied opaque business-level key (max 255 chars). Once set on the first
   * gate call for a (workflow_id, step_id), it is immutable — subsequent gate/complete
   * calls must pass the same key or receive IdempotencyKeyMismatchError. The key is
   * echoed on retry_context.idempotency_key in every subsequent gate response.
   */
  idempotency_key?: string;
}

/**
 * Prior completion status for a step: "none" on first gate call, "completed" after
 * a prior gate + prior /complete both landed, "gated_not_completed" when a prior gate
 * landed but no /complete has followed.
 */
export type PriorCompletionStatus = 'none' | 'completed' | 'gated_not_completed';

/**
 * Retry context for a step gate — the first-class state signal for (workflow_id, step_id).
 * Returned on every StepGateResponse, including the first call. Prefer these fields to the
 * legacy `cached` and `decision_source` fields on StepGateResponse.
 */
export interface RetryContext {
  /** Number of /gate calls for this (workflow_id, step_id), including the current call. Always >= 1. */
  gate_count: number;
  /** Number of successful /complete calls for this (workflow_id, step_id). */
  completion_count: number;
  /** Whether a prior gate+complete cycle has landed. */
  prior_completion_status: PriorCompletionStatus;
  /** True iff `prior_completion_status === "completed"`. */
  prior_output_available: boolean;
  /**
   * Output from the prior /complete call, or null. Non-null only when this gate call set
   * `include_prior_output=true` AND `prior_completion_status === "completed"`.
   */
  prior_output: Record<string, unknown> | null;
  /** ISO 8601 timestamp of the prior /complete, or null. */
  prior_completion_at: string | null;
  /** ISO 8601 timestamp of the first gate call for this (workflow_id, step_id). */
  first_attempt_at: string;
  /** ISO 8601 timestamp of the current gate call. */
  last_attempt_at: string;
  /** Decision of the immediately prior gate call. On first call, equals the current call's decision. */
  last_decision: GateDecision;
  /**
   * Key the caller set on this step (from the first gate call that supplied one),
   * or empty string `""` if the caller never supplied one. Always present in the
   * response — never null, never omitted — per the wire contract. Once set on a
   * step, the key is immutable for the step's lifetime.
   */
  idempotency_key: string;
}

/**
 * Options for calling `stepGate` that live outside the request body. Currently carries
 * `includePriorOutput`, which is sent as the `?include_prior_output=true` query param
 * and controls whether `retry_context.prior_output` is populated on the response.
 */
export interface StepGateOptions {
  /**
   * When true, sends `?include_prior_output=true` on the gate call. The response's
   * `retry_context.prior_output` is populated when a prior /complete exists. Default false
   * because prior output may be large and/or contain sensitive data.
   */
  includePriorOutput?: boolean;
}

/**
 * Response from a step gate check.
 */
export interface StepGateResponse {
  /** The gate decision: allow, block, or require_approval */
  decision: GateDecision;
  /** Unique step ID assigned by the system */
  step_id: string;
  /** Reason for the decision (especially for block/require_approval) */
  reason?: string;
  /** IDs of policies that matched and influenced the decision */
  policy_ids?: string[];
  /** URL to the approval portal (if decision is require_approval) */
  approval_url?: string;
  /** All policies that were evaluated during the gate check (Issue #1021) */
  policiesEvaluated?: PolicyMatch[];
  /** Policies that matched and influenced the decision (Issue #1021) */
  policiesMatched?: PolicyMatch[];
  /**
   * Whether this response was served from a prior decision rather than a fresh policy evaluation.
   * @deprecated Use `retry_context.gate_count > 1` instead. Will be removed in a future major version.
   */
  cached: boolean;
  /**
   * How the decision was produced: "fresh" or "cached".
   * @deprecated Use `retry_context.prior_completion_status` instead. Will be removed in a future major version.
   */
  decision_source: string;
  /**
   * First-class state signal for (workflow_id, step_id). Always present on every gate response.
   * See `RetryContext` for field semantics.
   */
  retry_context: RetryContext;
}

/**
 * A governance-aware resume boundary at a step-gate evaluation.
 */
export interface Checkpoint {
  /** Database identifier */
  id: number;
  /** Workflow this checkpoint belongs to */
  workflow_id: string;
  /** Step this checkpoint was created at */
  step_id: string;
  /** Position of the step in the workflow */
  step_index: number;
  /** Type of step */
  step_type?: string;
  /** Classification: "step_gate" or "approval_boundary" */
  checkpoint_type: string;
  /** Decision at this checkpoint */
  gate_decision: string;
  /** Reason for the decision */
  gate_reason?: string;
  /** Whether the workflow can resume from here */
  is_resumable: boolean;
  /** How many times resumed from this checkpoint */
  resume_count: number;
  /** When the checkpoint was created */
  created_at: string;
}

/** Response from listing checkpoints */
export interface CheckpointListResponse {
  checkpoints: Checkpoint[];
  workflow_id: string;
}

/** Response after resuming from a checkpoint */
export interface ResumeFromCheckpointResponse {
  workflow_id: string;
  resumed_from_checkpoint: string;
  resumed_from_index: number;
  new_decision: string;
  decision_source: string;
  resume_count: number;
  message: string;
}

/**
 * Information about a workflow step.
 */
export interface WorkflowStepInfo {
  /** Unique step identifier */
  step_id: string;
  /** Step index in the workflow (0-based) */
  step_index: number;
  /** Step name */
  step_name?: string;
  /** Step type */
  step_type: StepType;
  /** Gate decision for this step */
  decision: GateDecision;
  /** Reason for the decision */
  decision_reason?: string;
  /** Approval status (if require_approval decision) */
  approval_status?: ApprovalStatus;
  /** Who approved the step (if approved) */
  approved_by?: string;
  /** When the gate was checked */
  gate_checked_at: string;
  /** When the step was completed */
  completed_at?: string;
}

/**
 * Response containing workflow status.
 */
export interface WorkflowStatusResponse {
  /** Workflow ID */
  workflow_id: string;
  /** Workflow name */
  workflow_name: string;
  /** Source orchestrator */
  source: WorkflowSource;
  /** Current status */
  status: WorkflowStatus;
  /** Current step index (0-based) */
  current_step_index: number;
  /** Total steps in the workflow */
  total_steps?: number;
  /** When the workflow started */
  started_at: string;
  /** When the workflow completed (if completed) */
  completed_at?: string;
  /** Trace ID for correlating with external tracing systems */
  trace_id?: string;
  /** List of steps in the workflow */
  steps?: WorkflowStepInfo[];
}

/**
 * Options for listing workflows.
 */
export interface ListWorkflowsOptions {
  /** Filter by workflow status */
  status?: WorkflowStatus;
  /** Filter by source */
  source?: WorkflowSource;
  /** Maximum number of results to return (default 50, max 100) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by trace ID */
  trace_id?: string;
}

/**
 * Response from listing workflows.
 */
export interface ListWorkflowsResponse {
  /** List of workflows */
  workflows: WorkflowStatusResponse[];
  /** Total count (for pagination) */
  total: number;
}

/**
 * Request to abort a workflow.
 */
export interface AbortWorkflowRequest {
  /** Reason for aborting the workflow */
  reason?: string;
}

/**
 * Request to fail a workflow.
 */
export interface FailWorkflowRequest {
  /** Reason for failing the workflow */
  reason?: string;
}

/**
 * Request to mark a step as completed.
 */
export interface MarkStepCompletedRequest {
  /** Output data from the step */
  output?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Number of input tokens consumed by this step */
  tokens_in?: number;
  /** Number of output tokens produced by this step */
  tokens_out?: number;
  /** Estimated cost in USD for this step */
  cost_usd?: number;
  /**
   * Must match the key passed on the corresponding gate call, if any. Mismatch
   * (including missing-vs-set on either side) yields IdempotencyKeyMismatchError.
   */
  idempotency_key?: string;
}

// =============================================================================
// WCP Approval Types (Feature 5)
// =============================================================================

/**
 * Response from approving a workflow step.
 */
export interface ApproveStepResponse {
  /** Workflow ID */
  workflow_id: string;
  /** Step ID that was approved */
  step_id: string;
  /** Status after approval */
  status: string;
}

/**
 * Response from rejecting a workflow step.
 */
export interface RejectStepResponse {
  /** Workflow ID */
  workflow_id: string;
  /** Step ID that was rejected */
  step_id: string;
  /** Status after rejection */
  status: string;
}

/**
 * A pending approval for a workflow step.
 */
export interface PendingApproval {
  /** Workflow ID */
  workflow_id: string;
  /** Workflow name */
  workflow_name: string;
  /** Step ID awaiting approval */
  step_id: string;
  /** Step name */
  step_name: string;
  /** Step type */
  step_type: string;
  /** When the approval was created */
  created_at: string;
}

/**
 * Response from listing pending approvals.
 */
export interface PendingApprovalsResponse {
  /** List of pending approvals */
  approvals: PendingApproval[];
  /** Total count */
  total: number;
}

/**
 * Options for listing pending approvals.
 */
export interface PendingApprovalsOptions {
  /** Maximum number of results to return */
  limit?: number;
}

// =============================================================================
// Webhook CRUD Types (Feature 7)
// =============================================================================

/**
 * Request to create a webhook subscription.
 */
export interface CreateWebhookRequest {
  /** URL to receive webhook events */
  url: string;
  /** Event types to subscribe to */
  events: string[];
  /** Optional secret for HMAC signature verification */
  secret?: string;
  /** Whether the webhook is active */
  active: boolean;
}

/**
 * A webhook subscription.
 */
export interface WebhookSubscription {
  /** Unique webhook ID */
  id: string;
  /** URL receiving webhook events */
  url: string;
  /** Event types subscribed to */
  events: string[];
  /** Whether the webhook is active */
  active: boolean;
  /** When the webhook was created */
  created_at: string;
  /** When the webhook was last updated */
  updated_at: string;
}

/**
 * Request to update a webhook subscription.
 */
export interface UpdateWebhookRequest {
  /** New URL (optional) */
  url?: string;
  /** New event types (optional) */
  events?: string[];
  /** Whether the webhook is active (optional) */
  active?: boolean;
}

/**
 * Response from listing webhooks.
 */
export interface ListWebhooksResponse {
  /** List of webhook subscriptions */
  webhooks: WebhookSubscription[];
  /** Total count */
  total: number;
}

/**
 * Helper functions for working with workflow types.
 */
export const WorkflowHelpers = {
  /**
   * Check if a gate decision allows the step to proceed.
   */
  isAllowed(decision: GateDecision): boolean {
    return decision === 'allow';
  },

  /**
   * Check if a gate decision blocks the step.
   */
  isBlocked(decision: GateDecision): boolean {
    return decision === 'block';
  },

  /**
   * Check if a gate decision requires human approval.
   */
  requiresApproval(decision: GateDecision): boolean {
    return decision === 'require_approval';
  },

  /**
   * Check if a workflow status is terminal (completed, aborted, or failed).
   */
  isTerminal(status: WorkflowStatus): boolean {
    return status === 'completed' || status === 'aborted' || status === 'failed';
  },

  /**
   * Check if a step gate response allows the step to proceed.
   */
  gateIsAllowed(response: StepGateResponse): boolean {
    return response.decision === 'allow';
  },

  /**
   * Check if a step gate response blocks the step.
   */
  gateIsBlocked(response: StepGateResponse): boolean {
    return response.decision === 'block';
  },

  /**
   * Check if a step gate response requires approval.
   */
  gateRequiresApproval(response: StepGateResponse): boolean {
    return response.decision === 'require_approval';
  },
};
