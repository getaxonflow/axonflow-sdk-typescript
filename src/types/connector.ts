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
 * (canonical OpenAPI `PolicyInfo` schema). Provides transparency
 * into policy enforcement decisions returned by `/api/v1/mcp/*`
 * endpoints.
 *
 * Renamed from `MCPPolicyInfo` in v6.0.0 to match the OpenAPI
 * spec name. The previous proxy-mode `PolicyInfo` (in `proxy.ts`)
 * is now `ProxyPolicyInfo` so the names align with the spec.
 */
export interface PolicyInfo {
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
 * @deprecated Renamed to `PolicyInfo` in v6.0.0 to match the OpenAPI
 * spec. The previous SDK `PolicyInfo` (proxy-mode shape) is now
 * `ProxyPolicyInfo`. This alias keeps existing code compiling for
 * one major version. Removed in v7.0.0.
 */
export type MCPPolicyInfo = PolicyInfo;

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
  /**
   * Optional tool identity, distinct from `connectorType`. Maps to the
   * `tool` field on the wire (epic #2905 / #2904 two-field identity
   * contract). Use this to carry the specific tool/operation name (e.g.
   * an MCP tool name) while `connectorType` identifies the server or
   * connector it belongs to — do not concatenate the two into a single
   * string. Omitted from the request body when empty/undefined.
   * Source of truth: platform/agent MCPCheckInputRequest.
   */
  tool?: string;
  statement: string;
  parameters?: Record<string, any>;
  operation?: string;
  /**
   * Selects the request-redaction detector (ADR-056 / #2563 addendum).
   * Maps to the snake_case `content_type` field on the wire. `undefined`
   * defaults to "text/plain" server-side. A content_type with no registered
   * detector is rejected (415) so a PEP fulfilling a `redact_pii` obligation
   * fails closed rather than forwarding content the engine cannot govern.
   * Source of truth: platform/agent MCPCheckInputRequest.
   */
  contentType?: string;
}

/**
 * Per-policy explainability record on MCP responses (snake_case wire shape).
 *
 * Surfaced in `MCPCheckInputResponse.policy_matches` and
 * `MCPCheckOutputResponse.policy_matches` when dynamic policy evaluation
 * produces non-empty matches. The MCP response decoder is JSON.parse
 * passthrough, so fields land on the wire shape directly — snake_case
 * here matches what the agent emits per the OpenAPI `ExplainPolicy`
 * schema (frozen shape per ADR-043).
 *
 * Distinct from {@link ExplainPolicy} in `src/types/decisions.ts`,
 * which carries the same logical record but in camelCase form because
 * `client.explainDecision()` hand-decodes its response. Both types
 * describe the same wire payload; the snake_case one is the
 * passthrough view, the camelCase one is the decoded view. A future
 * release may consolidate; for now the dual-name distinction matches
 * the SDK's existing wire-vs-decoded convention (e.g. `PolicyInfo`
 * vs `ProxyPolicyInfo`).
 *
 * Available when the AxonFlow platform is v7.1.0+. Older platforms
 * return `undefined` for `policy_matches`; callers should treat absence
 * as "context not available" rather than an error.
 */
export interface MCPExplainPolicy {
  /** Unique policy identifier. */
  policy_id: string;
  /** Human-readable policy name. */
  policy_name?: string;
  /** Action taken for this policy match (e.g. "block", "redact", "warn"). */
  action?: string;
  /** Risk level configured on this policy. */
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  /** Whether this policy permits a session override. */
  allow_override?: boolean;
  /** Optional description text shown to operators. */
  policy_description?: string;
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
  /**
   * Plugin Batch 1 / ADR-042 / ADR-043 — richer governance context surfaced
   * when the platform is v7.1.0+. All fields are optional; older platforms
   * return `undefined`. Source of truth:
   * `platform/agent/mcp_server_handler.go:880-940`.
   */
  decision_id?: string;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  policy_matches?: MCPExplainPolicy[];
  override_available?: boolean;
  override_existing_id?: string;
  /**
   * Request-phase redaction (ADR-056 / #2563). When an allowed statement
   * carries PII under a redact (not block) policy, the engine returns the
   * masked statement here so a PEP can forward redacted content WITHOUT
   * hand-rolling its own patterns — this is what makes a /decide `redact_pii`
   * obligation engine-fulfillable. Source of truth: platform/agent
   * MCPCheckInputResponse.
   */
  redacted?: boolean;
  redacted_statement?: string;
  /**
   * Reports whether the redaction detector actually RAN (regardless of whether
   * it masked anything). A PEP fulfilling a `redact_pii` obligation MUST fail
   * closed when this is `false`/absent — it means the redactor did not run
   * (detection disabled), so `redacted:false` would otherwise be
   * indistinguishable from "looked, found nothing" (#2563 B1).
   */
  redaction_evaluated?: boolean;
}

/**
 * Options for validating MCP response data against policies.
 * Used when an external orchestrator manages MCP execution but needs AxonFlow
 * policy enforcement as a post-execution gate (PII redaction, exfiltration limits).
 */
export interface MCPCheckOutputOptions {
  connectorType: string;
  /**
   * Optional tool identity, distinct from `connectorType`. Mirrors
   * {@link MCPCheckInputOptions.tool} for the response-phase check.
   * Omitted from the request body when empty/undefined. **Note:** unlike
   * `MCPCheckInputRequest`, the platform's `MCPCheckOutputRequest`
   * (`platform/agent/mcp_handler.go`) does not yet have a matching `tool`
   * field (epic #2905 / #2904 only added the input-phase field) — sending
   * this is forward-compatible and harmless (the platform's JSON decoder
   * silently ignores unrecognized keys), but it is not yet consumed
   * server-side. Wire it up for real once/if a future sub-issue adds
   * response-phase tool identity.
   */
  tool?: string;
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
  /**
   * Tabular response data with PII fields masked (used when the connector
   * returned rows; e.g. SQL/CSV results). Omitted if no redaction needed
   * or if the response was a text message.
   */
  redacted_data?: any;
  /**
   * Text message with PII fields masked (used when the connector returned
   * a string message rather than tabular rows; e.g. execute-style
   * responses). Omitted if no redaction needed or if the response was
   * tabular. Source of truth: `platform/agent/mcp_server_handler.go:988`.
   */
  redacted_message?: string;
  policies_evaluated: number;
  exfiltration_info?: ExfiltrationCheckInfo;
  policy_info?: MCPPolicyInfo;
  /**
   * Plugin Batch 1 / ADR-043 — explainability context (matches the
   * MCPCheckInputResponse fields on the same call site).
   */
  decision_id?: string;
  policy_matches?: MCPExplainPolicy[];
  /**
   * Mirrors the check-input field for the response phase (ADR-056 / #2563).
   * A PEP fulfilling a response-phase `redact_pii` obligation MUST fail closed
   * when this is `false`/absent — the redactor did not run, so absence of
   * redacted output cannot be trusted as "nothing to mask". The agent does not
   * populate this on every path today; default-absent keeps a PEP fail-closed
   * when the platform predates the field. Source of truth: platform/agent
   * MCPCheckOutputResponse.
   */
  redaction_evaluated?: boolean;
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
