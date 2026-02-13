// Copyright 2026 AxonFlow
// SPDX-License-Identifier: Apache-2.0

/**
 * HITL (Human-in-the-Loop) Queue Types for AxonFlow SDK.
 *
 * The HITL Queue API provides endpoints for managing approval requests
 * that require human review before proceeding. This is used when policies
 * trigger a require_approval action and the request is queued for review.
 */

/**
 * A pending approval request in the HITL queue.
 */
export interface HITLApprovalRequest {
  /** Unique identifier for the approval request */
  request_id: string;
  /** Organization ID */
  org_id: string;
  /** Tenant ID */
  tenant_id: string;
  /** Client ID */
  client_id: string;
  /** User ID (if available) */
  user_id?: string;
  /** The original query that triggered the approval */
  original_query: string;
  /** Type of request (e.g., 'llm_call', 'tool_call') */
  request_type: string;
  /** Additional context about the request */
  request_context?: Record<string, unknown>;
  /** ID of the policy that triggered the approval */
  triggered_policy_id: string;
  /** Name of the policy that triggered the approval */
  triggered_policy_name: string;
  /** Reason the policy was triggered */
  trigger_reason: string;
  /** Severity level of the triggered policy */
  severity: string;
  /** EU AI Act article reference (if applicable) */
  eu_ai_act_article?: string;
  /** Compliance framework (if applicable) */
  compliance_framework?: string;
  /** Risk classification (if applicable) */
  risk_classification?: string;
  /** Current status of the approval request */
  status: string;
  /** ID of the reviewer (if reviewed) */
  reviewer_id?: string;
  /** Email of the reviewer (if reviewed) */
  reviewer_email?: string;
  /** Review comment (if reviewed) */
  review_comment?: string;
  /** When the request was reviewed */
  reviewed_at?: string;
  /** When the request expires */
  expires_at: string;
  /** When the request was created */
  created_at: string;
  /** When the request was last updated */
  updated_at: string;
}

/**
 * Options for listing HITL queue items.
 */
export interface HITLQueueListOptions {
  /** Filter by status (e.g., 'pending', 'approved', 'rejected') */
  status?: string;
  /** Filter by severity (e.g., 'critical', 'high', 'medium', 'low') */
  severity?: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Response from listing HITL queue items.
 */
export interface HITLQueueListResponse {
  /** List of approval requests */
  items: HITLApprovalRequest[];
  /** Total number of matching items */
  total: number;
  /** Whether there are more items beyond the current page */
  has_more: boolean;
}

/**
 * Input for reviewing (approving or rejecting) an HITL request.
 */
export interface HITLReviewInput {
  /** ID of the reviewer */
  reviewer_id: string;
  /** Email of the reviewer */
  reviewer_email: string;
  /** Role of the reviewer (optional) */
  reviewer_role?: string;
  /** Review comment (optional) */
  comment?: string;
}

/**
 * HITL queue dashboard statistics.
 */
export interface HITLStats {
  /** Total number of pending approval requests */
  total_pending: number;
  /** Number of high-priority pending requests */
  high_priority: number;
  /** Number of critical-priority pending requests */
  critical_priority: number;
  /** Age (in hours) of the oldest pending request */
  oldest_pending_hours?: number;
}
