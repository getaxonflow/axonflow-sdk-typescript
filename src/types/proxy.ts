/**
 * Proxy Mode Types
 *
 * Proxy Mode routes requests through AxonFlow's /api/request endpoint,
 * allowing AxonFlow to handle policy enforcement and optional LLM routing.
 */

/**
 * Request type for executeQuery
 */
export type RequestType = 'chat' | 'sql' | 'mcp-query' | 'multi-agent-plan' | 'execute-plan';

/**
 * Options for executing a query through AxonFlow proxy
 */
export interface ExecuteQueryOptions {
  /** User authentication token (JWT or session token) */
  userToken: string;
  /** The query or prompt to process */
  query: string;
  /** Type of request */
  requestType: RequestType;
  /** Additional context for policy evaluation and processing */
  context?: Record<string, unknown>;
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
}

/**
 * Response from executeQuery in Proxy Mode
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
