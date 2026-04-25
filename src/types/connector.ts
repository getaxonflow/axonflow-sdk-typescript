/**
 * MCP Connector types for AxonFlow SDK
 */

export interface ConnectorMetadata {
  id: string;
  name: string;
  type: string;
  version: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  capabilities: string[];
  configSchema: Record<string, any>;
  installed: boolean;
  healthy?: boolean;
}

export interface ConnectorInstallRequest {
  connector_id: string;
  name: string;
  tenant_id: string;
  options: Record<string, any>;
  credentials: Record<string, string>;
}

/**
 * Information about a policy match during evaluation
 */
export interface PolicyMatchInfo {
  policy_id: string;
  policy_name: string;
  category: string;
  severity: string;
  action: string;
}

/**
 * Policy evaluation information included in MCP responses
 * Provides transparency into policy enforcement decisions
 */
export interface MCPPolicyInfo {
  policies_evaluated: number;
  blocked: boolean;
  block_reason?: string;
  redactions_applied: number;
  processing_time_ms: number;
  matched_policies?: PolicyMatchInfo[];
  /** Exfiltration check information (Issue #966) */
  exfiltration_check?: ExfiltrationCheckInfo;
  /** Dynamic policy evaluation results (Issue #968) */
  dynamic_policy_info?: DynamicPolicyInfo;
}

/**
 * Information about exfiltration limit checks (Issue #966)
 * Helps prevent large-scale data extraction via MCP queries
 */
export interface ExfiltrationCheckInfo {
  /** Number of rows in the response */
  rows_returned: number;
  /** Configured maximum rows per query */
  row_limit: number;
  /** Size of the response data in bytes */
  bytes_returned: number;
  /** Configured maximum bytes per response */
  byte_limit: number;
  /** Whether any exfiltration limit was exceeded. */
  exceeded?: boolean;
  /** Type of limit that was exceeded (rows / bytes / none). */
  limit_type?: 'rows' | 'bytes' | 'none';
  /**
   * @deprecated The `agent`'s response is JSON.parse passthrough — the
   * wire emits `exceeded` and `limit_type`, not `within_limits`. So
   * this field has always read `undefined`. Use `exceeded` (logical
   * negation) and `limit_type` instead. Removed in v7.
   */
  within_limits?: boolean;
}

/**
 * Information about dynamic policy evaluation (Issue #968)
 * Dynamic policies are evaluated by the Orchestrator and can include
 * rate limiting, budget controls, time-based access, and role-based access
 */
export interface DynamicPolicyInfo {
  /** Number of dynamic policies checked */
  policies_evaluated: number;
  /** Details about policies that matched */
  matched_policies?: DynamicPolicyMatch[];
  /** Whether the Orchestrator was reachable */
  orchestrator_reachable: boolean;
  /** Time taken for dynamic policy evaluation */
  processing_time_ms: number;
}

/**
 * Details about a matched dynamic policy
 */
export interface DynamicPolicyMatch {
  /** Unique identifier of the policy */
  policy_id: string;
  /** Human-readable name of the policy */
  policy_name: string;
  /** Type of policy (rate-limit, budget, time-access, role-access, mcp, connector) */
  policy_type: string;
  /** Action taken (allow, block, log, etc.) */
  action: string;
  /** Optional message from the policy evaluation. */
  message?: string;
  /**
   * @deprecated The wire field is `message`. JSON.parse passthrough
   * never populated `reason`; it has always read `undefined`.
   * Use `message`. Removed in v7.
   */
  reason?: string;
}

export interface ConnectorResponse {
  success: boolean;
  data: any;
  error?: string;
  meta?: Record<string, any>;
  /** Whether any fields in the response were redacted by policy enforcement */
  redacted?: boolean;
  /** JSON paths of fields that were redacted (e.g., "data.rows[0].ssn") */
  redacted_fields?: string[];
  /** Policy evaluation details for this request/response cycle */
  policy_info?: MCPPolicyInfo;
}

/**
 * Options for validating an MCP request against policies without executing it.
 * Used when an external orchestrator manages MCP execution but needs AxonFlow
 * policy enforcement as a pre-execution gate.
 */
export interface MCPCheckInputOptions {
  connectorType: string;
  statement: string;
  parameters?: Record<string, any>;
  operation?: string;
}

/**
 * Response from the MCP check-input endpoint.
 * Indicates whether the request would be allowed by configured policies.
 */
export interface MCPCheckInputResponse {
  allowed: boolean;
  block_reason?: string;
  policies_evaluated: number;
  policy_info?: MCPPolicyInfo;
}

/**
 * Options for validating MCP response data against policies.
 * Used when an external orchestrator manages MCP execution but needs AxonFlow
 * policy enforcement as a post-execution gate (PII redaction, exfiltration limits).
 */
export interface MCPCheckOutputOptions {
  connectorType: string;
  responseData?: Record<string, any>[];
  message?: string;
  metadata?: Record<string, any>;
  rowCount?: number;
}

/**
 * Response from the MCP check-output endpoint.
 * Indicates whether the response data passes policy checks, with optional redaction.
 */
export interface MCPCheckOutputResponse {
  allowed: boolean;
  block_reason?: string;
  redacted_data?: any;
  policies_evaluated: number;
  exfiltration_info?: ExfiltrationCheckInfo;
  policy_info?: MCPPolicyInfo;
}

/**
 * Returns true if the connector response had any fields redacted by policy evaluation.
 */
export function wasRedacted(response: ConnectorResponse): boolean {
  return response.redacted === true;
}

/**
 * Health status of an installed connector
 */
export interface ConnectorHealthStatus {
  healthy: boolean;
  latency: number;
  details: Record<string, string>;
  timestamp: string;
  error?: string;
}
