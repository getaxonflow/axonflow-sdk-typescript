/**
 * Execution Replay Types
 *
 * Types for the Execution Replay API which captures step-by-step snapshots
 * of workflow executions for debugging, auditing, and compliance purposes.
 */

/**
 * Execution summary representing a workflow execution
 */
export interface ExecutionSummary {
  /** Unique execution identifier */
  requestId: string;
  /** Name of the workflow */
  workflowName: string;
  /** Status: "running", "completed", "failed" */
  status: string;
  /** Total number of steps */
  totalSteps: number;
  /** Completed steps */
  completedSteps: number;
  /** When execution started (ISO string) */
  startedAt: string;
  /** When execution completed (ISO string) */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Total tokens used */
  totalTokens: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Organization ID */
  orgId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** User ID */
  userId?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Input summary */
  inputSummary?: unknown;
  /** Output summary */
  outputSummary?: unknown;
}

/**
 * Execution snapshot representing a step in a workflow execution
 */
export interface ExecutionSnapshot {
  /** Execution identifier */
  requestId: string;
  /** Step position (0-indexed) */
  stepIndex: number;
  /** Step name */
  stepName: string;
  /** Step status: "pending", "running", "completed", "failed", "paused", "skipped" */
  status: string;
  /** Step start time (ISO string) */
  startedAt: string;
  /** Step completion time (ISO string) */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** LLM provider name */
  provider?: string;
  /** Model used */
  model?: string;
  /** Input tokens */
  tokensIn: number;
  /** Output tokens */
  tokensOut: number;
  /** Step cost in USD */
  costUsd: number;
  /** Step input */
  input?: unknown;
  /** Step output */
  output?: unknown;
  /** Error message if failed */
  errorMessage?: string;
  /** Policies evaluated */
  policiesChecked?: string[];
  /** Policies triggered */
  policiesTriggered?: string[];
  /** Whether approval was required */
  approvalRequired?: boolean;
  /** Approver ID */
  approvedBy?: string;
  /** Approval timestamp */
  approvedAt?: string;
}

/**
 * Timeline entry for execution visualization
 */
export interface TimelineEntry {
  /** Step position */
  stepIndex: number;
  /** Step name */
  stepName: string;
  /** Step status */
  status: string;
  /** Step start time (ISO string) */
  startedAt: string;
  /** Step completion time (ISO string) */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Whether step has error */
  hasError: boolean;
  /** Whether step required approval */
  hasApproval: boolean;
}

/**
 * Response from list executions API
 */
export interface ListExecutionsResponse {
  /** Array of execution summaries */
  executions: ExecutionSummary[];
  /** Total count */
  total: number;
  /** Page size */
  limit: number;
  /** Offset */
  offset: number;
}

/**
 * Full execution with summary and steps
 */
export interface ExecutionDetail {
  /** Execution summary */
  summary: ExecutionSummary;
  /** Step snapshots */
  steps: ExecutionSnapshot[];
}

/**
 * Options for listing executions
 */
export interface ListExecutionsOptions {
  /** Number of results (default: 50, max: 100) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
  /** Filter by status: "running", "completed", "failed" */
  status?: string;
  /** Filter by workflow name */
  workflowId?: string;
  /** Filter from timestamp (RFC3339) */
  startTime?: string;
  /** Filter to timestamp (RFC3339) */
  endTime?: string;
}

/**
 * Options for exporting an execution
 */
export interface ExecutionExportOptions {
  /** Export format: "json" (default) */
  format?: string;
  /** Include step inputs (default: true) */
  includeInput?: boolean;
  /** Include step outputs (default: true) */
  includeOutput?: boolean;
  /** Include policy details (default: true) */
  includePolicies?: boolean;
}
