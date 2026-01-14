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
  /** Whether the response is within configured limits */
  within_limits: boolean;
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
  /** Context for the policy match */
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
 * Health status of an installed connector
 */
export interface ConnectorHealthStatus {
  healthy: boolean;
  latency: number;
  details: Record<string, string>;
  timestamp: string;
  error?: string;
}
