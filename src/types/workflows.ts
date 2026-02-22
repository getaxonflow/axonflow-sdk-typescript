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
  /** Total number of steps in the workflow (if known) */
  total_steps?: number;
  /** Additional metadata for the workflow */
  metadata?: Record<string, unknown>;
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
}

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
