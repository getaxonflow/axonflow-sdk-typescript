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
 * Proxy-mode policy evaluation summary returned by `/api/request`.
 *
 * Renamed from `PolicyInfo` in v6.0.0 — the original name collided
 * with the OpenAPI `PolicyInfo` schema served by the MCP path
 * (`/api/v1/mcp/check-input` etc.), which the SDK exposes as
 * `MCPPolicyInfo`. This type is the proxy-mode shape; the v6
 * top-level `PolicyInfo` export now refers to the MCP shape (matching
 * the OpenAPI spec).
 */
export interface ProxyPolicyInfo {
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
 * @deprecated Renamed to `ProxyPolicyInfo` in v6.0.0 to resolve a
 * name collision with the OpenAPI `PolicyInfo` schema (the MCP
 * shape). For new code, use `ProxyPolicyInfo` from `@axonflow/sdk`
 * for the proxy-mode shape, or `PolicyInfo` for the MCP shape (the
 * latter is what was previously exported as `MCPPolicyInfo`).
 *
 * This alias keeps existing code compiling for one major version.
 * Removed in v7.0.0.
 */
export type PolicyInfoLegacyProxyShape = ProxyPolicyInfo;

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
  /** Policy evaluation info (proxy-mode shape) */
  policyInfo?: ProxyPolicyInfo;
  /** Budget status (Issue #1082) */
  budgetInfo?: BudgetInfo;
  /** Media analysis results (present when media was submitted) */
  mediaAnalysis?: MediaAnalysisResponse;
}

/**
 * Platform capability description
 */
export interface PlatformCapability {
  /** Capability name */
  name: string;
  /** Platform version that introduced this capability */
  since: string;
  /** Human-readable description */
  description: string;
}

/**
 * SDK compatibility information
 */
export interface SDKCompatibility {
  /** Minimum supported SDK version per language (e.g. {"typescript":"5.0.0","python":"6.0.0"}) */
  minSdkVersion: Record<string, string>;
  /** Recommended SDK version per language */
  recommendedSdkVersion: Record<string, string>;
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
  /** Platform capabilities */
  capabilities?: PlatformCapability[];
  /** SDK compatibility information */
  sdkCompatibility?: SDKCompatibility;
}
