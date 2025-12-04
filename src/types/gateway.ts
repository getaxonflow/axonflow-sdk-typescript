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
