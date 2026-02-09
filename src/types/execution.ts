/**
 * Unified Execution Tracking Types for AxonFlow SDK.
 *
 * These types provide a consistent interface for tracking both Multi-Agent Planning (MAP)
 * and Workflow Control Plane (WCP) executions. The unified schema enables consistent
 * status tracking, progress reporting, and cost tracking across execution types.
 *
 * Issue #1075 - EPIC #1074: Unified Workflow Infrastructure
 */

/**
 * Execution type distinguishing between MAP plans and WCP workflows.
 */
export type ExecutionType = 'map_plan' | 'wcp_workflow';

/**
 * Unified execution status values.
 */
export type ExecutionStatusValue =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'aborted' // WCP-specific: workflow aborted
  | 'expired'; // MAP-specific: plan expired before execution

/**
 * Step status values.
 */
export type StepStatusValue =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked' // WCP: blocked by policy
  | 'approval'; // WCP: waiting for approval

/**
 * Step type indicating what kind of operation the step performs.
 */
export type UnifiedStepType =
  | 'llm_call'
  | 'tool_call'
  | 'connector_call'
  | 'human_task'
  | 'synthesis' // MAP: result synthesis step
  | 'action' // Generic action step
  | 'gate'; // WCP: policy gate evaluation

/**
 * Gate decision values (applicable to both MAP and WCP).
 */
export type UnifiedGateDecision = 'allow' | 'block' | 'require_approval';

/**
 * Approval status for require_approval decisions.
 */
export type UnifiedApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Detailed information about an individual execution step.
 */
export interface UnifiedStepStatus {
  /** Unique step identifier */
  step_id: string;

  /** Step index in the execution (0-based) */
  step_index: number;

  /** Human-readable step name */
  step_name: string;

  /** Type of operation the step performs */
  step_type: UnifiedStepType;

  /** Current status of the step */
  status: StepStatusValue;

  /** When the step started executing */
  started_at?: string;

  /** When the step finished */
  ended_at?: string;

  /** Duration of step execution (human-readable, e.g., "2.5s") */
  duration?: string;

  /** Policy decision for this step (if applicable) */
  decision?: UnifiedGateDecision;

  /** Reason for the policy decision */
  decision_reason?: string;

  /** IDs of policies that matched during evaluation */
  policies_matched?: string[];

  /** Approval status (for require_approval decisions) */
  approval_status?: UnifiedApprovalStatus;

  /** Who approved the step (if approved) */
  approved_by?: string;

  /** When the step was approved */
  approved_at?: string;

  /** LLM model used (if applicable) */
  model?: string;

  /** LLM provider (if applicable) */
  provider?: string;

  /** Cost in USD for this step */
  cost_usd?: number;

  /** Step input data (may be large) */
  input?: unknown;

  /** Step output data (may be large) */
  output?: unknown;

  /** Human-readable result summary */
  result_summary?: string;

  /** Error message if step failed */
  error?: string;
}

/**
 * Unified execution status for both MAP plans and WCP workflows.
 *
 * This type provides a consistent interface for tracking execution progress,
 * steps, costs, and metadata regardless of the underlying execution type.
 *
 * @example
 * ```typescript
 * // Get execution status
 * const status = await client.getExecutionStatus('exec_123');
 * console.log(`${status.execution_type}: ${status.name}`);
 * console.log(`Progress: ${status.progress_percent}%`);
 *
 * // Check if complete
 * if (status.status === 'completed') {
 *   console.log(`Completed in ${status.duration}`);
 * }
 *
 * // Access steps
 * for (const step of status.steps) {
 *   console.log(`Step ${step.step_index}: ${step.step_name} - ${step.status}`);
 * }
 * ```
 */
export interface ExecutionStatus {
  /** Unique execution identifier */
  execution_id: string;

  /** Type of execution (MAP plan or WCP workflow) */
  execution_type: ExecutionType;

  /** Human-readable name of the execution */
  name: string;

  /** Source orchestrator (WCP-specific: langchain, crewai, etc.) */
  source?: string;

  /** Current execution status */
  status: ExecutionStatusValue;

  /** Current step being executed (0-based index) */
  current_step_index: number;

  /** Total number of steps in the execution */
  total_steps: number;

  /** Progress as a percentage (0-100) */
  progress_percent: number;

  /** When execution started (ISO 8601 timestamp) */
  started_at: string;

  /** When execution completed (ISO 8601 timestamp) */
  completed_at?: string;

  /** Duration of execution (human-readable, e.g., "1m 30s") */
  duration?: string;

  /** Estimated cost in USD (pre-execution) */
  estimated_cost_usd?: number;

  /** Actual cost in USD (post-execution) */
  actual_cost_usd?: number;

  /** Detailed step information */
  steps: UnifiedStepStatus[];

  /** Error message if execution failed */
  error?: string;

  /** Tenant ID for multi-tenancy */
  tenant_id?: string;

  /** Organization ID */
  org_id?: string;

  /** User ID who initiated the execution */
  user_id?: string;

  /** Client/application ID */
  client_id?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** When the execution record was created */
  created_at: string;

  /** When the execution record was last updated */
  updated_at: string;
}

/**
 * Request to list executions with optional filters.
 */
export interface UnifiedListExecutionsRequest {
  /** Filter by execution type */
  execution_type?: ExecutionType;

  /** Filter by status */
  status?: ExecutionStatusValue;

  /** Filter by tenant ID */
  tenant_id?: string;

  /** Filter by organization ID */
  org_id?: string;

  /** Maximum number of results (default 50, max 100) */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Paginated response for listing executions.
 */
export interface UnifiedListExecutionsResponse {
  /** List of executions */
  executions: ExecutionStatus[];

  /** Total count of matching executions */
  total: number;

  /** Limit used in the request */
  limit: number;

  /** Offset used in the request */
  offset: number;

  /** Whether more results are available */
  has_more: boolean;
}

/**
 * Options for the streamExecutionStatus method.
 */
export interface StreamExecutionStatusOptions {
  /** AbortSignal to cancel the SSE stream */
  signal?: AbortSignal;
}

/**
 * Helper functions for working with execution types.
 */
export const ExecutionHelpers = {
  /**
   * Check if an execution status is terminal (no more updates expected).
   */
  isTerminal(status: ExecutionStatusValue): boolean {
    return (
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled' ||
      status === 'aborted' ||
      status === 'expired'
    );
  },

  /**
   * Check if a step status is terminal.
   */
  isStepTerminal(status: StepStatusValue): boolean {
    return status === 'completed' || status === 'failed' || status === 'skipped';
  },

  /**
   * Check if a step is in a blocking state (blocked by policy or awaiting approval).
   */
  isStepBlocking(status: StepStatusValue): boolean {
    return status === 'blocked' || status === 'approval';
  },

  /**
   * Calculate progress percentage from steps.
   */
  calculateProgress(steps: UnifiedStepStatus[], totalSteps: number): number {
    if (totalSteps === 0) return 0;
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    return (completedSteps / totalSteps) * 100;
  },

  /**
   * Get the currently running step, if any.
   */
  getCurrentStep(execution: ExecutionStatus): UnifiedStepStatus | undefined {
    return execution.steps.find(s => s.status === 'running');
  },

  /**
   * Calculate total cost from all steps.
   */
  calculateTotalCost(steps: UnifiedStepStatus[]): number {
    return steps.reduce((total, step) => total + (step.cost_usd ?? 0), 0);
  },

  /**
   * Check if an execution is a MAP plan.
   */
  isMapPlan(execution: ExecutionStatus): boolean {
    return execution.execution_type === 'map_plan';
  },

  /**
   * Check if an execution is a WCP workflow.
   */
  isWcpWorkflow(execution: ExecutionStatus): boolean {
    return execution.execution_type === 'wcp_workflow';
  },
};
