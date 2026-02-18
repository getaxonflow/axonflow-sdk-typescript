/**
 * Proxy Mode Types
 *
 * Proxy Mode routes requests through AxonFlow's /api/request endpoint,
 * allowing AxonFlow to handle policy enforcement and optional LLM routing.
 */

import type { MediaContent, MediaAnalysisResponse } from './media';

/**
 * Request type for proxyLLMCall
 */
export type RequestType = 'chat' | 'sql' | 'mcp-query' | 'multi-agent-plan' | 'execute-plan';

/**
 * Options for executing a query through AxonFlow proxy.
 * @internal Kept for backward compatibility with proxyLLMCall() signature. Not exported from the public API.
 */
export interface ExecuteQueryOptions {
  /** User authentication token (JWT or session token). If empty/undefined, defaults to "anonymous" for audit purposes. */
  userToken?: string;
  /** The query or prompt to process */
  query: string;
  /** Type of request */
  requestType: RequestType;
  /** Additional context for policy evaluation and processing */
  context?: Record<string, unknown>;
  /** Optional media content (images) for multimodal governance */
  media?: MediaContent[];
}

/**
 * Code artifact metadata detected in LLM responses.
 *
 * When an LLM generates code, AxonFlow automatically detects and analyzes it.
 * This metadata is included in policyInfo for audit and compliance.
 */
export interface CodeArtifact {
  /** Whether the response contains code */
  is_code_output: boolean;
  /** Detected programming language */
  language: string;
  /** Code category (function, class, script, config, snippet, module) */
  code_type: string;
  /** Size of detected code in bytes */
  size_bytes: number;
  /** Number of lines of code */
  line_count: number;
  /** Count of potential secrets found */
  secrets_detected: number;
  /** Count of unsafe code patterns */
  unsafe_patterns: number;
  /** Code governance policies evaluated */
  policies_checked?: string[];
}

/**
 * Policy evaluation information from the agent
 */
export interface PolicyInfo {
  /** List of policies that were evaluated */
  policiesEvaluated: string[];
  /** Static checks that were applied */
  staticChecks: string[];
  /** Processing time for policy evaluation */
  processingTime: string;
  /** Tenant ID associated with the request */
  tenantId: string;
  /** Code artifact metadata if code was detected in the response */
  codeArtifact?: CodeArtifact;
}

/**
 * Budget enforcement status information (Issue #1082).
 *
 * Returned when a budget check is performed, showing current usage
 * relative to budget limits.
 */
export interface BudgetInfo {
  /** Budget ID */
  budgetId?: string;
  /** Budget name */
  budgetName?: string;
  /** Current usage in USD */
  usedUsd: number;
  /** Budget limit in USD */
  limitUsd: number;
  /** Usage percentage (0-100+) */
  percentage: number;
  /** Whether budget is exceeded */
  exceeded: boolean;
  /** Action on exceed: warn, block, downgrade */
  action?: string;
}

/**
 * Response from proxyLLMCall in Proxy Mode.
 * @internal Kept for backward compatibility with proxyLLMCall() signature. Not exported from the public API.
 */
export interface ExecuteQueryResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Response data from the operation */
  data?: unknown;
  /** Result string (for planning operations) */
  result?: string;
  /** Plan ID (for multi-agent planning) */
  planId?: string;
  /** Request ID for tracking */
  requestId?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Error message if request failed */
  error?: string;
  /** Whether the request was blocked by policy */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  blockReason?: string;
  /** Policy evaluation info */
  policyInfo?: PolicyInfo;
  /** Budget status (Issue #1082) */
  budgetInfo?: BudgetInfo;
  /** Media analysis results (present when media was submitted) */
  mediaAnalysis?: MediaAnalysisResponse;
}

/**
 * Health check response
 */
export interface HealthStatus {
  /** Health status: healthy, degraded, or unhealthy */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Agent version */
  version?: string;
  /** Uptime duration */
  uptime?: string;
  /** Component health statuses */
  components?: Record<string, { status: string; message?: string }>;
}
