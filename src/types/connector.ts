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
