/**
 * Gateway Mode Types
 *
 * Gateway Mode enables direct LLM calls with AxonFlow governance.
 * Pre-check policies before calling your LLM, then audit the call afterward.
 */

/**
 * Token usage information for audit logging
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Rate limit information returned from pre-check
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Result from policy pre-check in Gateway Mode
 */
export interface PolicyApprovalResult {
  /** Unique context ID for correlating pre-check with audit */
  contextId: string;
  /** Whether the request was approved */
  approved: boolean;
  /** Filtered/approved data to send to LLM */
  approvedData: Record<string, unknown>;
  /** List of policies that were evaluated */
  policies: string[];
  /** Rate limit information (if applicable) */
  rateLimitInfo?: RateLimitInfo;
  /** When this approval expires */
  expiresAt: Date;
  /** Reason for blocking (if not approved) */
  blockReason?: string;
}

/**
 * Options for getting policy approval context
 */
export interface PolicyApprovalOptions {
  /** User authentication token */
  userToken: string;
  /** The query/prompt to be sent to LLM */
  query: string;
  /** Data sources being accessed (for connector-based queries) */
  dataSources?: string[];
  /** Additional context for policy evaluation */
  context?: Record<string, unknown>;
}

/**
 * Result from audit logging in Gateway Mode
 */
export interface AuditResult {
  /** Whether the audit was logged successfully */
  success: boolean;
  /** Unique audit ID for reference */
  auditId: string;
}

/**
 * Options for auditing an LLM call
 */
export interface AuditOptions {
  /** Context ID from pre-check */
  contextId: string;
  /** Summary of LLM response (for compliance logging) */
  responseSummary: string;
  /** LLM provider (e.g., "openai", "anthropic", "bedrock") */
  provider: string;
  /** Model used (e.g., "gpt-4", "claude-3-opus") */
  model: string;
  /** Token usage from the LLM call */
  tokenUsage: TokenUsage;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Audit Log Read Types
// ============================================================================

/**
 * Request parameters for searching audit logs.
 * All fields are optional - omit to search all logs.
 */
export interface AuditSearchRequest {
  /** Filter by user email */
  userEmail?: string;
  /** Filter by client/application ID */
  clientId?: string;
  /** Start of time range to search */
  startTime?: Date;
  /** End of time range to search */
  endTime?: Date;
  /** Filter by request type (e.g., "llm_chat", "policy_check") */
  requestType?: string;
  /** Maximum results to return (default: 100, max: 1000) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
}

/**
 * Options for GetAuditLogsByTenant
 */
export interface AuditQueryOptions {
  /** Maximum results to return (default: 50) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
}

/**
 * A single audit log entry representing an audited request or event.
 */
export interface AuditLogEntry {
  /** Unique audit log ID */
  id: string;
  /** Correlation ID for the original request */
  requestId: string;
  /** When the event occurred */
  timestamp: Date;
  /** Email of the user who made the request */
  userEmail: string;
  /** Client/application that made the request */
  clientId: string;
  /** Tenant identifier */
  tenantId: string;
  /** Type of request (e.g., "llm_chat", "sql", "mcp-query") */
  requestType: string;
  /** Summary of the query/request */
  querySummary: string;
  /** Whether the request succeeded */
  success: boolean;
  /** Whether the request was blocked by policy */
  blocked: boolean;
  /** Calculated risk score (0.0-1.0) */
  riskScore: number;
  /** LLM provider used (if applicable) */
  provider: string;
  /** Model used (if applicable) */
  model: string;
  /** Total tokens consumed */
  tokensUsed: number;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** List of violated policy IDs (if any) */
  policyViolations: string[];
  /** Additional context */
  metadata: Record<string, unknown>;
}

/**
 * Response from an audit search
 */
export interface AuditSearchResponse {
  /** Audit log entries matching the search */
  entries: AuditLogEntry[];
  /** Total number of matching entries (for pagination) */
  total: number;
  /** Limit that was applied */
  limit: number;
  /** Offset that was applied */
  offset: number;
}
