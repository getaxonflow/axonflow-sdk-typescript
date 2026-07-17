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
  /** Whether response requires redaction (PII detected with redact action) */
  requiresRedaction?: boolean;
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
// Audit Tool Call Types
// ============================================================================

/**
 * Request to audit a non-LLM tool call.
 * Records function calls, MCP tool invocations, and API calls
 * for compliance and observability.
 */
export interface AuditToolCallRequest {
  /** Name of the tool that was called */
  toolName: string;
  /**
   * Type of tool: "function", "mcp", or "api"
   *
   * @deprecated Use `callerName` instead. `toolType` was misleadingly named —
   * every real caller (claude_code/codex/cursor/openclaw) used it to identify
   * WHICH CLIENT made the call, not any property of the tool itself. Kept as
   * a deprecated input fallback for backward compatibility; the server
   * resolves `callerName` if supplied, else falls back to this field.
   */
  toolType?: string;
  /**
   * Name of the client/caller that made the tool call (e.g. "claude_code",
   * "codex", "cursor", "openclaw"). Replaces the misleadingly-named
   * `toolType` field (getaxonflow/axonflow-enterprise#2912).
   *
   * Requires a platform with caller_name support (v9.11.0+); older platforms
   * silently drop this field, so also set `toolType` if you need attribution
   * there.
   */
  callerName?: string;
  /** Input parameters passed to the tool */
  input?: Record<string, unknown>;
  /** Output returned by the tool */
  output?: Record<string, unknown>;
  /** Associated workflow ID */
  workflowId?: string;
  /** Associated step ID */
  stepId?: string;
  /** User who triggered the tool call */
  userId?: string;
  /** Duration of the tool call in milliseconds */
  durationMs?: number;
  /** Policies that were applied during the call */
  policiesApplied?: string[];
  /** Whether the tool call succeeded */
  success?: boolean;
  /** Error message if the call failed */
  errorMessage?: string;
}

/**
 * Response from auditing a tool call.
 */
export interface AuditToolCallResponse {
  /** Unique audit ID for the recorded tool call */
  auditId: string;
  /** Status of the audit record */
  status: string;
  /** When the audit was recorded */
  timestamp: string;
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/** Active circuit info from circuit breaker status */
export interface CircuitBreakerCircuit {
  id: string;
  scope: string;
  scopeId: string;
  orgId: string;
  state: string;
  tripReason?: string;
  trippedBy?: string;
  trippedAt?: string;
  expiresAt?: string;
  errorCount: number;
  violationCount: number;
}

/** Response from GET /api/v1/circuit-breaker/status */
export interface CircuitBreakerStatusResponse {
  activeCircuits: CircuitBreakerCircuit[];
  count: number;
  emergencyStopActive: boolean;
}

/** A single entry in circuit breaker history */
export interface CircuitBreakerHistoryEntry {
  id: string;
  orgId: string;
  scope: string;
  scopeId: string;
  state: string;
  tripReason?: string;
  trippedBy?: string;
  trippedByEmail?: string;
  tripComment?: string;
  trippedAt?: string;
  expiresAt?: string;
  resetBy?: string;
  resetAt?: string;
  errorCount: number;
  violationCount: number;
}

/** Response from GET /api/v1/circuit-breaker/history */
export interface CircuitBreakerHistoryResponse {
  history: CircuitBreakerHistoryEntry[];
  count: number;
}

/** Effective circuit breaker config */
export interface CircuitBreakerConfig {
  source: string;
  errorThreshold: number;
  violationThreshold: number;
  windowSeconds: number;
  defaultTimeoutSeconds: number;
  maxTimeoutSeconds: number;
  enableAutoRecovery: boolean;
  tenantId?: string;
  overrides?: Record<string, unknown>;
}

/** Request to update per-tenant circuit breaker config */
export interface CircuitBreakerConfigUpdate {
  tenantId: string;
  errorThreshold?: number;
  violationThreshold?: number;
  windowSeconds?: number;
  defaultTimeoutSeconds?: number;
  maxTimeoutSeconds?: number;
  enableAutoRecovery?: boolean;
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
  /**
   * Filter by decision ID (ADR-043). Gathers every audit record tied to
   * a single decision — the explain flow's cross-reference pivot.
   */
  decisionId?: string;
  /** Filter by matched policy name (ADR-043). */
  policyName?: string;
  /**
   * Filter by session override ID (ADR-042). Use this to reconstruct the
   * full lifecycle of one override: override_created → override_used →
   * override_expired | override_revoked.
   */
  overrideId?: string;
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
 * Cross-border transfer-basis values recognized under Indonesia UU PDP Pasal 56:
 *
 *   - `adequacy`      — Pasal 56(a): destination with adequate protection
 *   - `safeguards`    — Pasal 56(b): binding legal instrument (generic label)
 *   - `pasal_56b_dpa` — Pasal 56(b): binding legal instrument, explicit DPA tag
 *   - `consent`       — Pasal 56(c): explicit data-subject consent
 *
 * `safeguards` and `pasal_56b_dpa` are semantic equivalents; the platform
 * surfaces whichever was recorded at decision time, verbatim. (platform #2513)
 */
export type TransferBasis = 'adequacy' | 'safeguards' | 'pasal_56b_dpa' | 'consent';

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
  /** ISO 3166-1 alpha-2 country code for data residency (cross-border transfer logging). */
  dataResidency?: string;
  /**
   * Legal basis for cross-border data transfer under Indonesia UU PDP Pasal 56.
   * See {@link TransferBasis}. Surfaced verbatim — never auto-translated.
   */
  transferBasis?: TransferBasis;
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
