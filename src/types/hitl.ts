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
  /**
   * Optional outbound webhook URL associated with the request.
   *
   * Mirrors the value supplied on creation. Platforms that implement the
   * outbound-webhook dispatcher (introduced in
   * getaxonflow/axonflow-enterprise#2419) fire a signed POST to this URL
   * after the request reaches a terminal state
   * (approved/rejected/expired/overridden). Platforms that don't, simply
   * round-trip the field. Enables webhook-driven resume (n8n Wait-node,
   * ADK plugin polling-free mode).
   */
  notify_url?: string;
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
 * Input for creating an HITL approval request.
 *
 * Mirrors `platform/agent/hitl/handler.go:86 CreateRequestInput`. The
 * platform's `POST /api/v1/hitl/queue` handler reads `X-Org-ID` and
 * `X-Tenant-ID` from request headers (set by the auth middleware from
 * the SDK client's credentials), and the JSON body must carry the
 * fields below.
 *
 * Used by agent-framework plugins (ADK, n8n, OpenAI Agents SDK) that
 * detect `require_approval` from `pre_check` / `check_tool_input` and
 * want to enqueue the corresponding HITL row before polling the
 * reviewer's decision (or before pivoting to webhook-driven resume via
 * `notify_url`).
 */
export interface HITLCreateInput {
  /** Client identifier that triggered the request. Required. */
  client_id: string;
  /** End-user identifier. Optional. */
  user_id?: string;
  /** Original query that triggered the gate. Required. */
  original_query: string;
  /** Request type (e.g. 'chat', 'tool', 'mcp'). Required. */
  request_type: string;
  /** Additional context propagated from the gated call. */
  request_context?: Record<string, unknown>;
  /** ID of the policy that fired require_approval. */
  triggered_policy_id?: string;
  /** Display name of the policy that fired require_approval. */
  triggered_policy_name?: string;
  /** Human-readable explanation of why approval is needed. */
  trigger_reason?: string;
  /** Severity level: 'critical' | 'high' | 'medium' | 'low'. Default 'high'. */
  severity?: string;
  /**
   * Optional outbound webhook URL fired async after terminal state
   * transition (approved/rejected/expired/overridden). Must be
   * `https://` (or `http://` for self-hosted local-dev). Server-side
   * validation rejects bad schemes with HTTP 400. Pair with the
   * HMAC-SHA256 `X-AxonFlow-Signature` header on the receiver side;
   * signing key is the deployment-configured
   * `AXONFLOW_HITL_WEBHOOK_SIGNING_KEY`. Introduced in
   * getaxonflow/axonflow-enterprise#2419.
   */
  notify_url?: string;
  /** EU AI Act article reference (e.g. 'Article 14'). */
  eu_ai_act_article?: string;
  /** Compliance framework label (GDPR / HIPAA / RBI / ...). */
  compliance_framework?: string;
  /** Risk classification level. */
  risk_classification?: string;
  /** Optional override for the approval expiry window. */
  expires_in_seconds?: number;
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
