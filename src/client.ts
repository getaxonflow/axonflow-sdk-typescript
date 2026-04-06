import { VERSION } from './version';
import { sendTelemetryPing } from './telemetry';
import {
  AxonFlowConfig,
  AIRequest,
  GovernanceRequest,
  GovernanceResponse,
  ConnectorMetadata,
  ConnectorInstallRequest,
  ConnectorResponse,
  ConnectorHealthStatus,
  MCPCheckInputOptions,
  MCPCheckInputResponse,
  MCPCheckOutputOptions,
  MCPCheckOutputResponse,
  PlanResponse,
  PlanExecutionResponse,
  PlanExecutionStatus,
  GeneratePlanOptions,
  CancelPlanResponse,
  UpdatePlanRequest,
  UpdatePlanResponse,
  PlanVersionEntry,
  PlanVersionsResponse,
  ResumePlanResponse,
  RollbackPlanResponse,
  PolicyApprovalResult,
  PolicyApprovalOptions,
  AuditResult,
  AuditOptions,
  AuditSearchRequest,
  AuditQueryOptions,
  AuditLogEntry,
  AuditSearchResponse,
  ExecuteQueryOptions,
  ExecuteQueryResponse,
  HealthStatus,
  // Policy CRUD types
  StaticPolicy,
  DynamicPolicy,
  PolicyOverride,
  ListStaticPoliciesOptions,
  ListDynamicPoliciesOptions,
  CreateStaticPolicyRequest,
  UpdateStaticPolicyRequest,
  CreateDynamicPolicyRequest,
  UpdateDynamicPolicyRequest,
  CreatePolicyOverrideRequest,
  TestPatternResult,
  PolicyVersion,
  EffectivePoliciesOptions,
  // Code Governance types (Enterprise)
  GitProviderType,
  ConfigureGitProviderRequest,
  ConfigureGitProviderResponse,
  ValidateGitProviderRequest,
  ValidateGitProviderResponse,
  ListGitProvidersResponse,
  CreatePRRequest,
  CreatePRResponse,
  PRRecord,
  ListPRsOptions,
  ListPRsResponse,
  CodeGovernanceMetrics,
  ExportOptions,
  ExportResponse,
  // Execution Replay types
  ExecutionSnapshot,
  TimelineEntry,
  ExecutionDetail,
  ListExecutionsResponse,
  ListExecutionsOptions,
  ExecutionExportOptions,
  // Cost Controls types
  Budget,
  BudgetsResponse,
  BudgetStatus,
  BudgetAlert,
  BudgetAlertsResponse,
  BudgetDecision,
  UsageSummary,
  UsageBreakdown,
  UsageBreakdownItem,
  UsageRecord,
  UsageRecordsResponse,
  PricingInfo,
  PricingListResponse,
  CreateBudgetRequest,
  UpdateBudgetRequest,
  ListBudgetsOptions,
  BudgetCheckRequest,
  ListUsageRecordsOptions,
  // Workflow Control Plane types
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  StepGateRequest,
  StepGateResponse,
  WorkflowStatusResponse,
  ListWorkflowsOptions,
  ListWorkflowsResponse,
  AbortWorkflowRequest,
  FailWorkflowRequest,
  MarkStepCompletedRequest,
  // WCP Approval types
  ApproveStepResponse,
  RejectStepResponse,
  PendingApprovalsResponse,
  PendingApprovalsOptions,
  // Webhook CRUD types
  CreateWebhookRequest,
  WebhookSubscription,
  UpdateWebhookRequest,
  ListWebhooksResponse,
  // MAS FEAT types (Enterprise)
  RegisterSystemRequest,
  UpdateSystemRequest,
  AISystemRegistry,
  RegistrySummary,
  ListSystemsOptions,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
  FEATAssessment,
  Finding,
  ApproveAssessmentRequest,
  RejectAssessmentRequest,
  ListAssessmentsOptions,
  KillSwitch,
  ConfigureKillSwitchRequest,
  CheckKillSwitchRequest,
  TriggerKillSwitchRequest,
  RestoreKillSwitchRequest,
  DisableKillSwitchRequest,
  KillSwitchEvent,
  // Unified Execution types
  ExecutionStatus,
  UnifiedListExecutionsRequest,
  UnifiedListExecutionsResponse,
  // HITL Queue types
  HITLApprovalRequest,
  HITLQueueListOptions,
  HITLQueueListResponse,
  HITLReviewInput,
  HITLStats,
  // Media Governance Config types
  MediaGovernanceConfig,
  MediaGovernanceStatus,
  UpdateMediaGovernanceConfigRequest,
  // Audit Tool Call types
  AuditToolCallRequest,
  AuditToolCallResponse,
  // Circuit Breaker types
  CircuitBreakerStatusResponse,
  CircuitBreakerHistoryResponse,
  CircuitBreakerConfig,
  CircuitBreakerConfigUpdate,
  // Policy Simulation types
  SimulatePoliciesRequest,
  SimulatePoliciesResponse,
  ImpactReportInput,
  ImpactReportResponse,
  PolicyConflictResponse,
} from './types';
import {
  AuthenticationError,
  APIError,
  PolicyViolationError,
  ConfigurationError,
  ConnectorError,
  PlanExecutionError,
  VersionConflictError,
} from './errors';
import { generateRequestId, debugLog } from './utils/helpers';

/**
 * Compare two semver version strings numerically.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareSemver(a: string, b: string): number {
  const parseVersion = (v: string) => v.split('.').map(p => parseInt(p.split('-')[0], 10) || 0);
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Main AxonFlow client for invisible AI governance
 */
export class AxonFlow {
  private config: {
    clientId?: string;
    clientSecret?: string;
    endpoint: string;
    mode: 'sandbox' | 'production';
    tenant: string;
    debug: boolean;
    timeout: number;
    mapTimeout: number;
    retry: { enabled: boolean; maxAttempts: number; delay: number };
    cache: { enabled: boolean; ttl: number };
  };
  private interceptors: {
    canHandle(aiCall: any): boolean;
    extractRequest(aiCall: any): AIRequest;
  }[] = [];
  private sessionCookie: string | null = null;

  constructor(config: AxonFlowConfig) {
    // Configuration validation
    if (config.clientSecret && !config.clientId) {
      throw new ConfigurationError(
        'clientSecret requires clientId to be set. ' +
          'Provide both clientId and clientSecret for OAuth2-style authentication.'
      );
    }

    // Set defaults first to determine endpoint
    const endpoint = config.endpoint || 'https://staging-eu.getaxonflow.com';

    // Credentials check: OAuth2-style (clientId/clientSecret)
    const hasCredentials = !!(config.clientId && config.clientSecret);

    // Set configuration
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      endpoint,
      mode: config.mode || 'production',
      tenant: config.tenant || '',
      debug: config.debug || false,
      timeout: config.timeout || 30000,
      mapTimeout: config.mapTimeout || 120000, // 2 minutes for MAP operations
      retry: {
        enabled: config.retry?.enabled !== false,
        maxAttempts: config.retry?.maxAttempts || 3,
        delay: config.retry?.delay || 1000,
      },
      cache: {
        enabled: config.cache?.enabled !== false,
        ttl: config.cache?.ttl || 60000,
      },
    };

    // Interceptors removed in v3.0.0 (deprecated wrapOpenAIClient/wrapAnthropicClient)
    this.interceptors = [];

    if (this.config.debug) {
      // Determine auth method for logging
      const authMethod = hasCredentials ? 'client-credentials' : 'community (no auth)';

      debugLog('AxonFlow initialized', {
        mode: this.config.mode,
        endpoint: this.config.endpoint,
        authMethod,
      });
    }

    // Send telemetry ping (fire-and-forget).
    sendTelemetryPing({
      mode: this.config.mode,
      explicitMode: config.mode,
      endpoint: this.config.endpoint,
      telemetryEnabled: config.telemetry,
      debug: this.config.debug,
    });
  }

  /**
   * Get authentication headers based on configured credentials.
   *
   * Uses OAuth2-style Basic auth: Authorization: Basic base64(clientId:clientSecret)
   * Tenant identity is derived server-side from the client credentials.
   *
   * @returns Headers object with authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Always send Basic auth when clientId is set — server derives tenant from it.
    // clientSecret defaults to empty string for community/no-secret mode.
    const effectiveClientId = this.getEffectiveClientId();
    if (effectiveClientId) {
      const credentials = Buffer.from(
        `${effectiveClientId}:${this.config.clientSecret || ''}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    // Include SDK version for version discovery and compatibility checks
    headers['User-Agent'] = `axonflow-sdk-typescript/${VERSION}`;

    return headers;
  }

  /**
   * Get the effective clientId, using smart default for community mode.
   *
   * Returns the configured clientId if set, otherwise returns "community"
   * as a smart default. This enables zero-config usage for community/self-hosted
   * deployments while still supporting enterprise deployments with explicit credentials.
   *
   * @returns The clientId to use in requests
   */
  private getEffectiveClientId(): string {
    return this.config.clientId || this.config.tenant || 'community';
  }

  /**
   * Main method to protect AI calls with governance
   * @param aiCall The AI call to protect
   * @returns The AI response after governance
   *
   * @deprecated This method is deprecated and will be removed in v2.0.0.
   * It cannot correctly extract request details from callback functions.
   *
   * Use Gateway Mode or Proxy Mode instead:
   *
   * **Gateway Mode (recommended):**
   * ```typescript
   * // 1. Pre-check policies
   * const ctx = await axonflow.getPolicyApprovedContext({
   *   userToken: 'user-123',
   *   query: 'Your prompt here'
   * });
   *
   * // 2. Make your own LLM call
   * const response = await openai.chat.completions.create({
   *   model: 'gpt-4',
   *   messages: [{ role: 'user', content: 'Your prompt here' }]
   * });
   *
   * // 3. Audit the call
   * await axonflow.auditLLMCall({
   *   contextId: ctx.contextId,
   *   responseSummary: response.choices[0].message.content,
   *   provider: 'openai',
   *   model: 'gpt-4',
   *   tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
   *   latencyMs: 250
   * });
   * ```
   *
   * **Proxy Mode:**
   * ```typescript
   * const response = await axonflow.proxyLLMCall({
   *   userToken: 'user-123',
   *   query: 'Your prompt here',
   *   requestType: 'chat'
   * });
   * ```
   *
   * See: https://docs.getaxonflow.com/docs/sdk/gateway-mode
   */
  async protect<T = any>(aiCall: () => Promise<T>): Promise<T> {
    console.warn(
      '[AxonFlow] protect() is deprecated and will be removed in a future version. ' +
        'Use Gateway Mode (getPolicyApprovedContext + auditLLMCall) or Proxy Mode (proxyLLMCall) instead. ' +
        'See: https://docs.getaxonflow.com/docs/sdk/gateway-mode'
    );
    try {
      // Extract request details from the AI call
      const aiRequest = await this.extractRequest(aiCall);

      if (this.config.debug) {
        debugLog('Protecting AI call', { provider: aiRequest.provider, model: aiRequest.model });
      }

      // Create governance request
      const governanceRequest: GovernanceRequest = {
        requestId: generateRequestId(),
        timestamp: Date.now(),
        aiRequest,
        mode: this.config.mode,
        tenant: this.config.tenant,
      };

      // Check policies with AxonFlow Agent
      const governanceResponse = await this.checkPolicies(governanceRequest);

      // If denied, throw error
      if (!governanceResponse.allowed) {
        const violation = governanceResponse.violations?.[0];
        throw new Error(
          `Request blocked by AxonFlow: ${violation?.description || 'Policy violation'}`
        );
      }

      // Execute the AI call (possibly with modifications)
      const modifiedCall = governanceResponse.modifiedRequest
        ? () => Promise.resolve(governanceResponse.modifiedRequest)
        : aiCall;

      const result = await modifiedCall();

      // Log audit trail
      await this.logAudit(governanceResponse);

      return result;
    } catch (error) {
      if (this.config.debug) {
        debugLog('Error in protect()', error);
      }

      // In production, fail open (allow the call) if AxonFlow is unavailable
      if (this.config.mode === 'production' && this.isAxonFlowError(error)) {
        console.warn('AxonFlow unavailable, failing open');
        return aiCall();
      }

      throw error;
    }
  }

  /**
   * Extract request details from an AI call
   */
  private async extractRequest(aiCall: Function): Promise<AIRequest> {
    // Try each interceptor to see if it can handle this call
    for (const interceptor of this.interceptors) {
      if (interceptor.canHandle(aiCall)) {
        return interceptor.extractRequest(aiCall);
      }
    }

    // Generic extraction if no specific interceptor matches
    return {
      provider: 'unknown',
      model: 'unknown',
      prompt: aiCall.toString(),
      parameters: {},
    };
  }

  /**
   * Check policies with AxonFlow Agent
   */
  private async checkPolicies(request: GovernanceRequest): Promise<GovernanceResponse> {
    const url = `${this.config.endpoint}/api/request`;

    // Transform SDK request to Agent API format
    const agentRequest = {
      query: request.aiRequest.prompt,
      user_token: '',
      client_id: this.config.clientId || this.config.tenant,
      request_type: 'llm_chat',
      context: {
        provider: request.aiRequest.provider,
        model: request.aiRequest.model,
        parameters: request.aiRequest.parameters,
        requestId: request.requestId,
        mode: this.config.mode,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AxonFlow API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const agentResponse = await response.json();

    // Transform Agent API response to SDK format
    // Extract policy name from policy_info if available
    const policyName = agentResponse.policy_info?.policies_evaluated?.[0] || 'agent-policy';
    return {
      requestId: request.requestId,
      allowed: !agentResponse.blocked,
      violations: agentResponse.blocked
        ? [
            {
              type: 'security',
              severity: 'high',
              description: agentResponse.block_reason || 'Request blocked by policy',
              policy: policyName,
              action: 'blocked',
            },
          ]
        : [],
      modifiedRequest: agentResponse.data,
      policies: agentResponse.policy_info?.policies_evaluated || [],
      audit: {
        timestamp: Date.now(),
        duration: parseInt(agentResponse.policy_info?.processing_time?.replace('ms', '') || '0'),
        tenant: this.config.tenant,
      },
    };
  }

  /**
   * Log audit trail
   */
  private async logAudit(response: GovernanceResponse): Promise<void> {
    // Audit logging is handled server-side by the Agent
    // Just log locally if debug mode is enabled
    if (this.config.debug) {
      debugLog('Request processed', {
        allowed: response.allowed,
        violations: response.violations?.length || 0,
        duration: response.audit.duration,
      });
    }
  }

  /**
   * Check if an error is from AxonFlow (vs the AI provider)
   */
  private isAxonFlowError(error: any): boolean {
    return (
      error?.message?.includes('AxonFlow') ||
      error?.message?.includes('governance') ||
      error?.message?.includes('fetch')
    );
  }

  /**
   * Create a sandbox client for testing
   */
  static sandbox(clientId: string = 'demo-client', clientSecret: string = 'demo-secret'): AxonFlow {
    return new AxonFlow({
      clientId,
      clientSecret,
      mode: 'sandbox',
      endpoint: 'https://staging-eu.getaxonflow.com',
      debug: true,
    });
  }

  /**
   * Check if a health response indicates support for a named capability.
   *
   * @param health - HealthStatus returned from healthCheck()
   * @param name - Capability name to check (e.g. "mcp-policy-check", "circuit-breaker")
   * @returns true if the capability is present in the health response
   *
   * @example
   * ```typescript
   * const health = await axonflow.healthCheck();
   * if (AxonFlow.hasCapability(health, 'mcp-policy-check')) {
   *   // Platform supports MCP policy check endpoints
   * }
   * ```
   */
  static hasCapability(health: HealthStatus, name: string): boolean {
    return health.capabilities?.some(c => c.name === name) ?? false;
  }

  // ============================================================================
  // Proxy Mode Methods
  // ============================================================================

  /**
   * Check if AxonFlow Agent is healthy and available.
   *
   * @returns HealthStatus object with agent health information
   *
   * @example
   * ```typescript
   * const health = await axonflow.healthCheck();
   * if (health.status === 'healthy') {
   *   console.log('Agent is healthy');
   * }
   * ```
   */
  async healthCheck(): Promise<HealthStatus> {
    const url = `${this.config.endpoint}/health`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        return {
          status: 'unhealthy',
          components: {
            agent: { status: 'error', message: `HTTP ${response.status}` },
          },
        };
      }

      const data = await response.json();

      // Warn if SDK version is below platform minimum for TypeScript
      const minVersion =
        typeof data.sdk_compatibility?.min_sdk_version === 'string'
          ? data.sdk_compatibility.min_sdk_version
          : data.sdk_compatibility?.min_sdk_version?.typescript;
      if (minVersion && compareSemver(VERSION, minVersion) < 0) {
        console.warn(
          `[AxonFlow SDK] WARNING: SDK version ${VERSION} is below minimum supported version ${minVersion}. Please upgrade.`
        );
      }

      return {
        status: data.status === 'healthy' ? 'healthy' : 'degraded',
        version: data.version,
        uptime: data.uptime,
        components: data.components,
        capabilities: data.capabilities,
        sdkCompatibility: data.sdk_compatibility
          ? {
              minSdkVersion: data.sdk_compatibility.min_sdk_version,
              recommendedSdkVersion: data.sdk_compatibility.recommended_sdk_version,
            }
          : undefined,
      };
    } catch (error) {
      if (this.config.debug) {
        debugLog('Health check failed', error);
      }
      return {
        status: 'unhealthy',
        components: {
          agent: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      };
    }
  }

  /**
   * Check the health of the AxonFlow Orchestrator service.
   *
   * @returns Promise resolving to health status
   * @example
   * ```typescript
   * const health = await axonflow.orchestratorHealthCheck();
   * if (health.status === 'healthy') {
   *   console.log('Orchestrator is healthy');
   * }
   * ```
   */
  async orchestratorHealthCheck(): Promise<HealthStatus> {
    const url = `${this.config.endpoint}/health`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        return {
          status: 'unhealthy',
          components: {
            orchestrator: { status: 'error', message: `HTTP ${response.status}` },
          },
        };
      }

      const data = await response.json();

      return {
        status: data.status === 'healthy' ? 'healthy' : 'degraded',
        version: data.version,
        uptime: data.uptime,
        components: data.components,
        capabilities: data.capabilities,
        sdkCompatibility: data.sdk_compatibility
          ? {
              minSdkVersion: data.sdk_compatibility.min_sdk_version,
              recommendedSdkVersion: data.sdk_compatibility.recommended_sdk_version,
            }
          : undefined,
      };
    } catch (error) {
      if (this.config.debug) {
        debugLog('Orchestrator health check failed', error);
      }
      return {
        status: 'unhealthy',
        components: {
          orchestrator: {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      };
    }
  }

  /**
   * Send a query through AxonFlow with full policy enforcement (Proxy Mode).
   *
   * This is Proxy Mode - AxonFlow acts as an intermediary, making the LLM call on your behalf.
   *
   * Use this when you want AxonFlow to:
   *   - Evaluate policies before the LLM call
   *   - Make the LLM call to the configured provider
   *   - Filter/redact sensitive data from responses
   *   - Automatically track costs and audit the interaction
   *
   * For Gateway Mode (lower latency, you make the LLM call), use:
   *   - getPolicyApprovedContext() before your LLM call
   *   - auditLLMCall() after your LLM call
   *
   * @param options - Query execution options
   * @returns ExecuteQueryResponse with results or error information
   * @throws PolicyViolationError if request is blocked by policy
   * @throws AuthenticationError if credentials are invalid
   * @throws APIError for other API errors
   *
   * @example
   * ```typescript
   * const response = await axonflow.proxyLLMCall({
   *   userToken: 'user-123',
   *   query: 'Explain quantum computing',
   *   requestType: 'chat',
   *   context: { provider: 'openai', model: 'gpt-4' }
   * });
   *
   * if (response.success) {
   *   console.log('Response:', response.data);
   * }
   * ```
   */
  async proxyLLMCall(options: ExecuteQueryOptions): Promise<ExecuteQueryResponse> {
    // Default to "anonymous" if userToken is empty/undefined (community mode)
    const effectiveUserToken = options.userToken || 'anonymous';

    const agentRequest: Record<string, unknown> = {
      query: options.query,
      user_token: effectiveUserToken,
      client_id: this.config.clientId || this.config.tenant,
      request_type: options.requestType,
      context: options.context || {},
    };

    if (options.media && options.media.length > 0) {
      agentRequest.media = options.media.map(m => ({
        source: m.source,
        base64_data: m.base64Data,
        url: m.url,
        mime_type: m.mimeType,
      }));
    }

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    if (this.config.debug) {
      debugLog('Proxy Mode: proxyLLMCall', {
        requestType: options.requestType,
        query: options.query.substring(0, 50),
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    let data: any;

    if (!response.ok) {
      const errorText = await response.text();
      // Handle HTTP 402 (Payment Required) for budget exceeded - parse as blocked response with budgetInfo
      if (response.status === 402) {
        try {
          data = JSON.parse(errorText);
          // If it has budget_info, treat as valid blocked response (fall through to normal processing)
          if (data.budget_info) {
            // Fall through to normal response processing below
          } else {
            throw new APIError(response.status, 'Payment Required', errorText);
          }
        } catch (e) {
          if (e instanceof APIError) throw e;
          throw new APIError(response.status, 'Payment Required', errorText);
        }
      } else if (response.status === 401 || response.status === 403) {
        // Try to parse as JSON for policy violation info
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.blocked || errorJson.block_reason) {
            throw new PolicyViolationError(
              errorJson.block_reason || 'Request blocked by policy',
              errorJson.policy_info?.policies_evaluated
            );
          }
        } catch (e) {
          if (e instanceof PolicyViolationError) throw e;
        }
        throw new AuthenticationError(`Request failed: ${errorText}`);
      } else {
        throw new APIError(response.status, response.statusText, errorText);
      }
    }

    // Parse response if not already parsed (from 402 handling)
    if (!data) {
      data = await response.json();
    }

    // Check for policy violation in successful response (some blocked responses return 200)
    // Note: Don't throw for budget blocks (402 responses) - return with budgetInfo instead
    if (data.blocked && !data.budget_info) {
      throw new PolicyViolationError(
        data.block_reason || 'Request blocked by policy',
        data.policy_info?.policies_evaluated
      );
    }

    // Transform snake_case response to camelCase
    const result: ExecuteQueryResponse = {
      success: data.success,
      data: data.data,
      result: data.result,
      planId: data.plan_id,
      requestId: data.request_id,
      metadata: data.metadata || {},
      error: data.error,
      blocked: data.blocked || false,
      blockReason: data.block_reason,
    };

    // Parse policy info if present
    if (data.policy_info) {
      result.policyInfo = {
        policiesEvaluated: data.policy_info.policies_evaluated || [],
        staticChecks: data.policy_info.static_checks || [],
        processingTime: data.policy_info.processing_time || '',
        tenantId: data.policy_info.tenant_id || '',
        codeArtifact: data.policy_info.code_artifact,
      };
    }

    // Parse budget info if present (Issue #1082)
    if (data.budget_info) {
      result.budgetInfo = {
        budgetId: data.budget_info.budget_id,
        budgetName: data.budget_info.budget_name,
        usedUsd: data.budget_info.used_usd || 0,
        limitUsd: data.budget_info.limit_usd || 0,
        percentage: data.budget_info.percentage || 0,
        exceeded: data.budget_info.exceeded || false,
        action: data.budget_info.action,
      };
    }

    // Parse media analysis if present
    if (data.media_analysis) {
      result.mediaAnalysis = {
        results: (data.media_analysis.results ?? []).map((r: any) => ({
          mediaIndex: r.media_index ?? 0,
          sha256Hash: r.sha256_hash ?? '',
          hasFaces: r.has_faces ?? false,
          faceCount: r.face_count ?? 0,
          hasBiometricData: r.has_biometric_data ?? false,
          nsfwScore: r.nsfw_score ?? 0,
          violenceScore: r.violence_score ?? 0,
          contentSafe: r.content_safe !== undefined ? r.content_safe : true,
          documentType: r.document_type,
          isSensitiveDocument: r.is_sensitive_document ?? false,
          hasPII: r.has_pii ?? false,
          piiTypes: r.pii_types,
          hasExtractedText: r.has_extracted_text ?? false,
          extractedTextLength: r.extracted_text_length ?? 0,
          estimatedCostUsd: r.estimated_cost_usd ?? 0,
          warnings: r.warnings,
        })),
        totalCostUsd: data.media_analysis.total_cost_usd ?? 0,
        analysisTimeMs: data.media_analysis.analysis_time_ms ?? 0,
      };
    }

    if (this.config.debug) {
      debugLog('Proxy Mode: proxyLLMCall result', {
        success: result.success,
        blocked: result.blocked,
        hasData: !!result.data,
      });
    }

    return result;
  }

  /**
   * List all available MCP connectors from the marketplace
   */
  async listConnectors(): Promise<ConnectorMetadata[]> {
    const response = await this.orchestratorRequest<{
      connectors: ConnectorMetadata[];
      total: number;
    }>('GET', '/api/v1/connectors');

    // Handle wrapped response
    const connectors = Array.isArray(response) ? response : response.connectors || [];

    if (this.config.debug) {
      debugLog('Listed connectors', { count: connectors.length });
    }

    return connectors;
  }

  /**
   * Install an MCP connector from the marketplace
   */
  async installConnector(request: ConnectorInstallRequest): Promise<void> {
    // Extract connector_id from request for URL path
    const { connector_id, ...body } = request;

    await this.orchestratorRequest<void>(
      'POST',
      `/api/v1/connectors/${connector_id}/install`,
      body
    );

    if (this.config.debug) {
      debugLog('Connector installed', { name: request.name });
    }
  }

  /**
   * Uninstall an MCP connector
   */
  async uninstallConnector(connectorName: string): Promise<void> {
    await this.orchestratorRequest<void>('DELETE', `/api/v1/connectors/${connectorName}`);

    if (this.config.debug) {
      debugLog('Connector uninstalled', { name: connectorName });
    }
  }

  /**
   * Get details for a specific connector by ID
   */
  async getConnector(connectorId: string): Promise<ConnectorMetadata> {
    const connector = await this.orchestratorRequest<ConnectorMetadata>(
      'GET',
      `/api/v1/connectors/${connectorId}`
    );

    if (this.config.debug) {
      debugLog('Got connector', { id: connectorId });
    }

    return connector;
  }

  /**
   * Get health status of an installed connector
   */
  async getConnectorHealth(connectorId: string): Promise<ConnectorHealthStatus> {
    const health = await this.orchestratorRequest<ConnectorHealthStatus>(
      'GET',
      `/api/v1/connectors/${connectorId}/health`
    );

    if (this.config.debug) {
      debugLog('Got connector health', { id: connectorId, healthy: health.healthy });
    }

    return health;
  }

  /**
   * Execute a query against an installed MCP connector
   */
  async queryConnector(
    connectorName: string,
    query: string,
    params?: any
  ): Promise<ConnectorResponse> {
    const agentRequest = {
      query,
      user_token: '',
      client_id: this.config.clientId || this.config.tenant,
      request_type: 'mcp-query',
      context: {
        connector: connectorName,
        params: params || {},
      },
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ConnectorError(
        `Connector query failed: ${response.status} ${response.statusText} - ${errorText}`,
        connectorName,
        'query'
      );
    }

    const agentResponse = await response.json();

    if (this.config.debug) {
      debugLog('Connector query executed', { connector: connectorName });
    }

    return {
      success: agentResponse.success,
      data: agentResponse.data,
      error: agentResponse.error,
      meta: agentResponse.metadata,
    };
  }

  /**
   * Execute a query directly against the MCP connector endpoint.
   *
   * This method calls the agent's /mcp/resources/query endpoint which provides:
   * - Request-phase policy evaluation (SQLi blocking, PII blocking)
   * - Response-phase policy evaluation (PII redaction)
   * - PolicyInfo metadata in responses
   *
   * @example
   * ```typescript
   * const response = await axonflow.mcpQuery({
   *   connector: 'postgres',
   *   statement: 'SELECT * FROM customers LIMIT 10',
   * });
   *
   * if (response.redacted) {
   *   console.log('Fields redacted:', response.redacted_fields);
   * }
   * console.log('Policies evaluated:', response.policy_info?.policies_evaluated);
   * ```
   *
   * @param options - Query options including connector name and SQL statement
   * @returns ConnectorResponse with data, redaction info, and policy_info
   * @throws ConnectorError if the request is blocked by policy or fails
   */
  async mcpQuery(options: {
    connector: string;
    statement: string;
    options?: Record<string, any>;
  }): Promise<ConnectorResponse> {
    if (!options.connector) {
      throw new ConnectorError('connector name is required', undefined, 'mcpQuery');
    }
    if (!options.statement) {
      throw new ConnectorError('statement is required', undefined, 'mcpQuery');
    }

    const url = `${this.config.endpoint}/mcp/resources/query`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const body = {
      connector: options.connector,
      statement: options.statement,
      options: options.options || {},
    };

    if (this.config.debug) {
      debugLog('MCP Query', {
        connector: options.connector,
        statement: options.statement.substring(0, 50),
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    const responseData = await response.json();

    // Handle policy blocks (403 responses)
    if (!response.ok) {
      throw new ConnectorError(
        responseData.error || `MCP query failed: ${response.status} ${response.statusText}`,
        options.connector,
        'mcpQuery'
      );
    }

    if (this.config.debug) {
      debugLog('MCP Query result', {
        connector: options.connector,
        success: responseData.success,
        redacted: responseData.redacted,
        policiesEvaluated: responseData.policy_info?.policies_evaluated,
      });
    }

    return {
      success: responseData.success,
      data: responseData.data,
      error: responseData.error,
      meta: responseData.meta,
      redacted: responseData.redacted,
      redacted_fields: responseData.redacted_fields,
      policy_info: responseData.policy_info,
    };
  }

  /**
   * Execute a statement against an MCP connector (alias for mcpQuery).
   *
   * Same as mcpQuery but follows the naming convention of other execute* methods.
   *
   * @param options - Query options including connector name and SQL statement
   * @returns ConnectorResponse with data, redaction info, and policy_info
   */
  async mcpExecute(options: {
    connector: string;
    statement: string;
    options?: Record<string, any>;
  }): Promise<ConnectorResponse> {
    return this.mcpQuery(options);
  }

  /**
   * Validate an MCP request against configured policies without executing it.
   * Use this when an external orchestrator (e.g., LangGraph, CrewAI) manages MCP execution
   * but needs AxonFlow policy enforcement as a pre-execution gate.
   *
   * @example
   * ```typescript
   * const result = await axonflow.mcpCheckInput({
   *   connectorType: 'postgres',
   *   statement: 'SELECT * FROM users WHERE id = $1',
   *   parameters: { '$1': '123' },
   * });
   *
   * if (!result.allowed) {
   *   console.log('Blocked:', result.block_reason);
   * }
   * ```
   *
   * @param options - Input check options including connector type and statement
   * @returns MCPCheckInputResponse with allowed status and policy evaluation details
   * @throws ConnectorError if the request fails (non-403 errors)
   */
  async mcpCheckInput(options: MCPCheckInputOptions): Promise<MCPCheckInputResponse> {
    const url = `${this.config.endpoint}/api/v1/mcp/check-input`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const body: Record<string, any> = {
      connector_type: options.connectorType,
      statement: options.statement,
    };
    if (options.parameters) {
      body.parameters = options.parameters;
    }
    body.operation = options.operation || 'execute';

    if (this.config.debug) {
      debugLog('MCP Check Input', {
        connectorType: options.connectorType,
        statement: options.statement.substring(0, 50),
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    const responseData = await response.json();

    // 403 means policy blocked — this is a valid check response, not an error
    if (!response.ok && response.status !== 403) {
      throw new ConnectorError(
        responseData.error || 'MCP check-input failed',
        options.connectorType,
        'check-input'
      );
    }

    if (this.config.debug) {
      debugLog('MCP Check Input result', {
        connectorType: options.connectorType,
        allowed: responseData.allowed,
        policiesEvaluated: responseData.policies_evaluated,
      });
    }

    return responseData as MCPCheckInputResponse;
  }

  /**
   * Validate MCP response data against configured policies.
   * Use this when an external orchestrator manages MCP execution but needs AxonFlow
   * policy enforcement as a post-execution gate (PII redaction, exfiltration limits).
   *
   * @example
   * ```typescript
   * const result = await axonflow.mcpCheckOutput({
   *   connectorType: 'postgres',
   *   responseData: [{ id: 1, name: 'Alice', ssn: '123-45-6789' }],
   *   rowCount: 1,
   * });
   *
   * if (result.redacted_data) {
   *   console.log('Data was redacted:', result.redacted_data);
   * }
   * if (result.exfiltration_info && !result.exfiltration_info.within_limits) {
   *   console.log('Exfiltration limit exceeded');
   * }
   * ```
   *
   * @param options - Output check options including connector type and response data
   * @returns MCPCheckOutputResponse with allowed status, redacted data, and policy details
   * @throws ConnectorError if the request fails (non-403 errors)
   */
  async mcpCheckOutput(options: MCPCheckOutputOptions): Promise<MCPCheckOutputResponse> {
    const url = `${this.config.endpoint}/api/v1/mcp/check-output`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const body: Record<string, any> = {
      connector_type: options.connectorType,
    };
    if (options.responseData !== undefined) {
      body.response_data = options.responseData;
    }
    if (options.message !== undefined) {
      body.message = options.message;
    }
    if (options.metadata) {
      body.metadata = options.metadata;
    }
    if (options.rowCount !== undefined && options.rowCount > 0) {
      body.row_count = options.rowCount;
    }

    if (this.config.debug) {
      debugLog('MCP Check Output', {
        connectorType: options.connectorType,
        rowCount: options.rowCount,
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    const responseData = await response.json();

    // 403 means policy blocked — this is a valid check response, not an error
    if (!response.ok && response.status !== 403) {
      throw new ConnectorError(
        responseData.error || 'MCP check-output failed',
        options.connectorType,
        'check-output'
      );
    }

    if (this.config.debug) {
      debugLog('MCP Check Output result', {
        connectorType: options.connectorType,
        allowed: responseData.allowed,
        policiesEvaluated: responseData.policies_evaluated,
      });
    }

    return responseData as MCPCheckOutputResponse;
  }

  /**
   * Alias for {@link mcpCheckInput}. Validates tool input against configured policies.
   *
   * @param options - Input check options including connector type and statement
   * @returns MCPCheckInputResponse with allowed status and policy evaluation details
   */
  async checkToolInput(options: MCPCheckInputOptions): Promise<MCPCheckInputResponse> {
    return this.mcpCheckInput(options);
  }

  /**
   * Alias for {@link mcpCheckOutput}. Validates tool output against configured policies.
   *
   * @param options - Output check options including connector type and response data
   * @returns MCPCheckOutputResponse with allowed status, redacted data, and policy details
   */
  async checkToolOutput(options: MCPCheckOutputOptions): Promise<MCPCheckOutputResponse> {
    return this.mcpCheckOutput(options);
  }

  /**
   * Generate a multi-agent execution plan from a natural language query
   * @param query - Natural language query describing the task
   * @param domain - Optional domain hint (travel, healthcare, etc.)
   * @param userToken - Optional user token for authentication (defaults to tenant/client_id)
   * @param options - Optional plan generation options (execution mode, etc.)
   */
  async generatePlan(
    query: string,
    domain?: string,
    userToken?: string,
    options?: GeneratePlanOptions
  ): Promise<PlanResponse> {
    const context: Record<string, any> = {};
    if (domain) {
      context.domain = domain;
    }
    if (options?.executionMode) {
      context.execution_mode = options.executionMode;
    }

    const agentRequest = {
      query,
      user_token: userToken || this.config.clientId || this.config.tenant,
      client_id: this.config.clientId || this.config.tenant,
      request_type: 'multi-agent-plan',
      context,
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    // Use mapTimeout for MAP operations (default 2 minutes)
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Plan generation failed: ${response.status} ${response.statusText} - ${errorText}`,
        undefined,
        'generation'
      );
    }

    const agentResponse = await response.json();

    if (!agentResponse.success) {
      throw new PlanExecutionError(
        `Plan generation failed: ${agentResponse.error}`,
        undefined,
        'generation'
      );
    }

    // plan_id can be at top level or inside data
    const planId = agentResponse.plan_id || agentResponse.data?.plan_id;

    if (this.config.debug) {
      debugLog('Plan generated', { planId });
    }

    return {
      planId,
      status: agentResponse.data?.status || 'pending',
      steps: agentResponse.data?.steps || [],
      domain: agentResponse.data?.domain || domain || 'generic',
      complexity: agentResponse.data?.complexity || 0,
      parallel: agentResponse.data?.parallel || false,
      metadata: agentResponse.metadata || {},
    };
  }

  /**
   * Execute a previously generated multi-agent plan
   * @param planId - ID of the plan to execute
   * @param userToken - Optional user token for authentication (defaults to tenant/client_id)
   */
  async executePlan(planId: string, userToken?: string): Promise<PlanExecutionResponse> {
    const agentRequest = {
      query: '',
      user_token: userToken || this.config.clientId || this.config.tenant,
      client_id: this.config.clientId || this.config.tenant,
      request_type: 'execute-plan',
      context: { plan_id: planId },
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    // Use mapTimeout for MAP operations (default 2 minutes)
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Plan execution failed: ${response.status} ${response.statusText} - ${errorText}`,
        planId,
        'execution'
      );
    }

    const agentResponse = await response.json();

    // Detect nested data.success=false (agent wraps orchestrator errors)
    let success = agentResponse.success;
    let error = agentResponse.error;
    let result = agentResponse.result;
    const data = agentResponse.data;
    if (data && typeof data === 'object' && data.success === false) {
      success = false;
      if (data.error && !error) error = data.error;
      // Throw on nested failure (e.g., cancelled plan execution)
      throw new PlanExecutionError(error || 'Plan execution failed', planId, 'execution');
    }
    if (!result && data?.result) result = data.result;

    if (this.config.debug) {
      debugLog('Plan executed', { planId, success });
    }

    // Read status from response data if available (e.g., "awaiting_approval" for confirm mode)
    let status: PlanExecutionStatus = success ? 'completed' : 'failed';
    if (
      data &&
      typeof data === 'object' &&
      'status' in data &&
      typeof data.status === 'string' &&
      data.status
    ) {
      status = data.status as PlanExecutionStatus;
    } else if (agentResponse.metadata?.status) {
      status = agentResponse.metadata.status as PlanExecutionStatus;
    }

    return {
      planId,
      status,
      result,
      workflowId: data?.workflow_id,
      stepResults: agentResponse.metadata?.step_results ?? data?.metadata?.step_results,
      error,
      duration: agentResponse.metadata?.duration ?? data?.metadata?.duration,
    };
  }

  /**
   * Get the status of a running or completed plan
   */
  async getPlanStatus(planId: string): Promise<PlanExecutionResponse> {
    const url = `${this.config.endpoint}/api/v1/plan/${planId}`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Get plan status failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const status = await response.json();

    return {
      planId,
      status: status.status,
      result: status.result,
      stepResults: status.step_results,
      error: status.error,
      duration: status.duration,
    };
  }

  /**
   * Cancel a running or pending plan
   * @param planId - ID of the plan to cancel
   * @param reason - Optional reason for cancellation
   */
  async cancelPlan(planId: string, reason?: string): Promise<CancelPlanResponse> {
    const url = `${this.config.endpoint}/api/v1/plan/${planId}/cancel`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const body: Record<string, any> = {};
    if (reason) {
      body.reason = reason;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Plan cancellation failed: ${response.status} ${response.statusText} - ${errorText}`,
        planId,
        'cancel'
      );
    }

    const data = await response.json();

    if (this.config.debug) {
      debugLog('Plan cancelled', { planId, status: data.status });
    }

    return {
      planId: data.plan_id || planId,
      status: data.status,
      message: data.message,
    };
  }

  /**
   * Update a plan with optimistic concurrency control.
   * Throws VersionConflictError on 409 (version mismatch).
   * @param planId - ID of the plan to update
   * @param request - Update request with version and fields to change
   */
  async updatePlan(planId: string, request: UpdatePlanRequest): Promise<UpdatePlanResponse> {
    const url = `${this.config.endpoint}/api/v1/plan/${planId}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const body: Record<string, any> = {
      version: request.version,
    };
    if (request.executionMode) {
      body.execution_mode = request.executionMode;
    }
    if (request.domain) {
      body.domain = request.domain;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (response.status === 409) {
      const errorData = await response.json().catch(() => ({}));
      throw new VersionConflictError(planId, request.version, errorData.current_version);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Plan update failed: ${response.status} ${response.statusText} - ${errorText}`,
        planId,
        'update'
      );
    }

    const data = await response.json();

    if (this.config.debug) {
      debugLog('Plan updated', { planId, version: data.version });
    }

    return {
      planId: data.plan_id || planId,
      version: data.version,
      status: data.status,
      success: data.success ?? true,
    };
  }

  /**
   * Get version history for a plan
   * @param planId - ID of the plan
   */
  async getPlanVersions(planId: string): Promise<PlanVersionsResponse> {
    const url = `${this.config.endpoint}/api/v1/plan/${planId}/versions`;

    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Get plan versions failed: ${response.status} ${response.statusText} - ${errorText}`,
        planId,
        'versions'
      );
    }

    const data = await response.json();

    const versions: PlanVersionEntry[] = (data.versions || []).map((v: any) => ({
      version: v.version,
      changedAt: v.changed_at,
      changedBy: v.changed_by,
      changeType: v.change_type,
      changeSummary: v.change_summary,
    }));

    return {
      planId: data.plan_id || planId,
      versions,
    };
  }

  /**
   * Resume a paused plan (e.g., after approval gate or confirm mode)
   * @param planId - ID of the plan to resume
   * @param approved - Whether the plan is approved to proceed (defaults to true)
   */
  async resumePlan(planId: string, approved?: boolean): Promise<ResumePlanResponse> {
    const url = `${this.config.endpoint}/api/v1/plan/${planId}/resume`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ approved: approved ?? true }),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Plan resume failed: ${response.status} ${response.statusText} - ${errorText}`,
        planId,
        'resume'
      );
    }

    const data = await response.json();

    if (this.config.debug) {
      debugLog('Plan resumed', { planId, approved: data.approved });
    }

    return {
      planId: data.plan_id || planId,
      status: data.status,
      approved: data.approved,
      message: data.message,
    };
  }

  // ============================================================================
  // Gateway Mode Methods
  // ============================================================================

  /**
   * Gateway Mode: Pre-check policy approval before making a direct LLM call.
   * Alias for getPolicyApprovedContext() for simpler API.
   */
  async preCheck(options: PolicyApprovalOptions): Promise<PolicyApprovalResult> {
    return this.getPolicyApprovedContext(options);
  }

  /**
   * Gateway Mode: Get policy-approved context before making a direct LLM call.
   *
   * Use this when you want to:
   * - Make direct LLM calls (not through AxonFlow proxy)
   * - Have full control over your LLM provider/model selection
   * - Minimize latency by calling LLM directly
   *
   * @example
   * ```typescript
   * const ctx = await axonflow.getPolicyApprovedContext({
   *   userToken: 'user-jwt',
   *   query: 'Analyze this customer data',
   *   dataSources: ['postgres']
   * });
   *
   * if (!ctx.approved) {
   *   throw new Error(`Blocked: ${ctx.blockReason}`);
   * }
   *
   * // Make direct LLM call with approved data
   * const response = await openai.chat.completions.create({
   *   model: 'gpt-4',
   *   messages: [{ role: 'user', content: JSON.stringify(ctx.approvedData) }]
   * });
   *
   * // Audit the call
   * await axonflow.auditLLMCall({
   *   contextId: ctx.contextId,
   *   responseSummary: response.choices[0].message.content.substring(0, 100),
   *   provider: 'openai',
   *   model: 'gpt-4',
   *   tokenUsage: {
   *     promptTokens: response.usage.prompt_tokens,
   *     completionTokens: response.usage.completion_tokens,
   *     totalTokens: response.usage.total_tokens
   *   },
   *   latencyMs: 250
   * });
   * ```
   */
  async getPolicyApprovedContext(options: PolicyApprovalOptions): Promise<PolicyApprovalResult> {
    // Use smart default for clientId - enables zero-config community mode
    const clientId = this.getEffectiveClientId();

    const url = `${this.config.endpoint}/api/policy/pre-check`;

    const requestBody = {
      user_token: options.userToken,
      client_id: clientId,
      query: options.query,
      data_sources: options.dataSources || [],
      context: options.context || {},
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    if (this.config.debug) {
      debugLog('Gateway Mode: Pre-check', { query: options.query.substring(0, 50) });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Policy pre-check authentication failed: ${errorText}`);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    const data = await response.json();

    // Transform snake_case response to camelCase
    // Default expiration to 5 minutes from now if not provided
    const expiresAt = data.expires_at
      ? new Date(data.expires_at)
      : new Date(Date.now() + 5 * 60 * 1000);

    const result: PolicyApprovalResult = {
      contextId: data.context_id,
      approved: data.approved,
      requiresRedaction: data.requires_redaction || false,
      approvedData: data.approved_data || {},
      policies: data.policies || [],
      expiresAt,
      blockReason: data.block_reason,
    };

    // Parse rate limit info if present
    if (data.rate_limit) {
      result.rateLimitInfo = {
        limit: data.rate_limit.limit,
        remaining: data.rate_limit.remaining,
        resetAt: new Date(data.rate_limit.reset_at),
      };
    }

    if (this.config.debug) {
      debugLog('Gateway Mode: Pre-check result', {
        approved: result.approved,
        contextId: result.contextId,
        policies: result.policies.length,
      });
    }

    return result;
  }

  /**
   * Gateway Mode: Audit an LLM call after completion.
   *
   * Call this after making a direct LLM call to log the audit trail.
   * This is required for compliance and monitoring.
   *
   * @example
   * ```typescript
   * await axonflow.auditLLMCall({
   *   contextId: ctx.contextId,
   *   responseSummary: 'Generated report with 5 items',
   *   provider: 'openai',
   *   model: 'gpt-4',
   *   tokenUsage: {
   *     promptTokens: 100,
   *     completionTokens: 50,
   *     totalTokens: 150
   *   },
   *   latencyMs: 250
   * });
   * ```
   */
  async auditLLMCall(options: AuditOptions): Promise<AuditResult> {
    // Use smart default for clientId - enables zero-config community mode
    const clientId = this.getEffectiveClientId();

    const url = `${this.config.endpoint}/api/audit/llm-call`;

    const requestBody = {
      context_id: options.contextId,
      client_id: clientId,
      response_summary: options.responseSummary,
      provider: options.provider,
      model: options.model,
      token_usage: {
        prompt_tokens: options.tokenUsage.promptTokens,
        completion_tokens: options.tokenUsage.completionTokens,
        total_tokens: options.tokenUsage.totalTokens,
      },
      latency_ms: options.latencyMs,
      metadata: options.metadata || {},
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    if (this.config.debug) {
      debugLog('Gateway Mode: Audit', {
        contextId: options.contextId,
        provider: options.provider,
        model: options.model,
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Audit logging authentication failed: ${errorText}`);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    const data = await response.json();

    const result: AuditResult = {
      success: data.success,
      auditId: data.audit_id,
    };

    if (this.config.debug) {
      debugLog('Gateway Mode: Audit logged', { auditId: result.auditId });
    }

    return result;
  }

  /**
   * Audit a non-LLM tool call for compliance and observability.
   *
   * Records function calls, MCP tool invocations, and API calls in the
   * AxonFlow audit trail. Use this alongside auditLLMCall() to get complete
   * visibility into all tool usage within your AI workflows.
   *
   * @param request - Tool call details to audit
   * @returns Promise resolving to the audit record
   *
   * @example
   * ```typescript
   * const result = await axonflow.auditToolCall({
   *   toolName: 'search_database',
   *   toolType: 'function',
   *   input: { query: 'SELECT * FROM users' },
   *   output: { rows: 42 },
   *   workflowId: 'wf-123',
   *   durationMs: 150,
   *   success: true
   * });
   * console.log(result.auditId); // "audit-abc-123"
   * ```
   */
  async auditToolCall(request: AuditToolCallRequest): Promise<AuditToolCallResponse> {
    if (!request.toolName) {
      throw new ConfigurationError('tool_name is required');
    }

    const body: Record<string, unknown> = {
      tool_name: request.toolName,
    };
    if (request.toolType !== undefined) body.tool_type = request.toolType;
    if (request.input !== undefined) body.input = request.input;
    if (request.output !== undefined) body.output = request.output;
    if (request.workflowId !== undefined) body.workflow_id = request.workflowId;
    if (request.stepId !== undefined) body.step_id = request.stepId;
    if (request.userId !== undefined) body.user_id = request.userId;
    if (request.durationMs !== undefined) body.duration_ms = request.durationMs;
    if (request.policiesApplied !== undefined) body.policies_applied = request.policiesApplied;
    if (request.success !== undefined) body.success = request.success;
    if (request.errorMessage !== undefined) body.error_message = request.errorMessage;

    const data = await this.orchestratorRequest<{
      audit_id: string;
      status: string;
      timestamp: string;
    }>('POST', '/api/v1/audit/tool-call', body);

    return {
      auditId: data.audit_id,
      status: data.status,
      timestamp: data.timestamp,
    };
  }

  // ============================================================================
  // Circuit Breaker Observability Methods
  // ============================================================================

  /**
   * Get all active circuit breaker circuits.
   *
   * Returns the current state of all open/half-open circuits across
   * the platform, including emergency stop status.
   *
   * @returns Promise resolving to circuit breaker status
   *
   * @example
   * ```typescript
   * const status = await axonflow.getCircuitBreakerStatus();
   * console.log(`Active circuits: ${status.count}`);
   * console.log(`Emergency stop: ${status.emergencyStopActive}`);
   * for (const circuit of status.activeCircuits) {
   *   console.log(`${circuit.scope}/${circuit.scopeId}: ${circuit.state}`);
   * }
   * ```
   */
  async getCircuitBreakerStatus(): Promise<CircuitBreakerStatusResponse> {
    const response = await this.orchestratorRequest<{
      data: {
        active_circuits: Array<{
          id: string;
          scope: string;
          scope_id: string;
          org_id: string;
          state: string;
          trip_reason?: string;
          tripped_by?: string;
          tripped_at?: string;
          expires_at?: string;
          error_count: number;
          violation_count: number;
        }>;
        count: number;
        emergency_stop_active: boolean;
      };
    }>('GET', '/api/v1/circuit-breaker/status');

    const data = response.data;
    return {
      activeCircuits: (data.active_circuits || []).map(c => ({
        id: c.id,
        scope: c.scope,
        scopeId: c.scope_id,
        orgId: c.org_id,
        state: c.state,
        tripReason: c.trip_reason,
        trippedBy: c.tripped_by,
        trippedAt: c.tripped_at,
        expiresAt: c.expires_at,
        errorCount: c.error_count,
        violationCount: c.violation_count,
      })),
      count: data.count,
      emergencyStopActive: data.emergency_stop_active,
    };
  }

  /**
   * Get circuit breaker history for audit trail.
   *
   * Returns historical circuit breaker events including trips, resets,
   * and manual interventions. Useful for compliance reporting.
   *
   * @param limit - Maximum number of history entries to return
   * @returns Promise resolving to circuit breaker history
   *
   * @example
   * ```typescript
   * const history = await axonflow.getCircuitBreakerHistory(50);
   * for (const entry of history.history) {
   *   console.log(`${entry.trippedAt}: ${entry.scope}/${entry.scopeId} - ${entry.state}`);
   * }
   * ```
   */
  async getCircuitBreakerHistory(limit?: number): Promise<CircuitBreakerHistoryResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    const queryString = params.toString();
    const path = `/api/v1/circuit-breaker/history${queryString ? `?${queryString}` : ''}`;

    const response = await this.orchestratorRequest<{
      data: {
        history: Array<{
          id: string;
          org_id: string;
          scope: string;
          scope_id: string;
          state: string;
          trip_reason?: string;
          tripped_by?: string;
          tripped_by_email?: string;
          trip_comment?: string;
          tripped_at?: string;
          expires_at?: string;
          reset_by?: string;
          reset_at?: string;
          error_count: number;
          violation_count: number;
        }>;
        count: number;
      };
    }>('GET', path);

    const data = response.data;
    return {
      history: (data.history || []).map(h => ({
        id: h.id,
        orgId: h.org_id,
        scope: h.scope,
        scopeId: h.scope_id,
        state: h.state,
        tripReason: h.trip_reason,
        trippedBy: h.tripped_by,
        trippedByEmail: h.tripped_by_email,
        tripComment: h.trip_comment,
        trippedAt: h.tripped_at,
        expiresAt: h.expires_at,
        resetBy: h.reset_by,
        resetAt: h.reset_at,
        errorCount: h.error_count,
        violationCount: h.violation_count,
      })),
      count: data.count,
    };
  }

  /**
   * Get circuit breaker config (global or tenant-specific).
   *
   * Returns the effective circuit breaker configuration, including
   * any tenant-specific overrides.
   *
   * @param tenantId - Optional tenant ID to get tenant-specific config
   * @returns Promise resolving to circuit breaker config
   *
   * @example
   * ```typescript
   * // Get global config
   * const globalConfig = await axonflow.getCircuitBreakerConfig();
   * console.log(`Error threshold: ${globalConfig.errorThreshold}`);
   *
   * // Get tenant-specific config
   * const tenantConfig = await axonflow.getCircuitBreakerConfig('tenant-123');
   * ```
   */
  async getCircuitBreakerConfig(tenantId?: string): Promise<CircuitBreakerConfig> {
    const params = new URLSearchParams();
    if (tenantId !== undefined) params.set('tenant_id', tenantId);
    const queryString = params.toString();
    const path = `/api/v1/circuit-breaker/config${queryString ? `?${queryString}` : ''}`;

    const response = await this.orchestratorRequest<{
      data: {
        source: string;
        error_threshold: number;
        violation_threshold: number;
        window_seconds: number;
        default_timeout_seconds: number;
        max_timeout_seconds: number;
        enable_auto_recovery: boolean;
        tenant_id?: string;
        overrides?: Record<string, unknown>;
      };
    }>('GET', path);

    const data = response.data;
    return {
      source: data.source,
      errorThreshold: data.error_threshold,
      violationThreshold: data.violation_threshold,
      windowSeconds: data.window_seconds,
      defaultTimeoutSeconds: data.default_timeout_seconds,
      maxTimeoutSeconds: data.max_timeout_seconds,
      enableAutoRecovery: data.enable_auto_recovery,
      tenantId: data.tenant_id,
      overrides: data.overrides,
    };
  }

  /**
   * Update per-tenant circuit breaker config.
   *
   * Allows customizing circuit breaker thresholds for a specific tenant.
   * Only provided fields will be updated; others retain their current values.
   *
   * @param config - Configuration update with tenant ID and fields to change
   * @returns Promise resolving to confirmation with tenant ID and message
   *
   * @example
   * ```typescript
   * const result = await axonflow.updateCircuitBreakerConfig({
   *   tenantId: 'tenant-123',
   *   errorThreshold: 10,
   *   windowSeconds: 120,
   * });
   * console.log(result.message); // "config updated"
   * ```
   */
  async updateCircuitBreakerConfig(
    config: CircuitBreakerConfigUpdate
  ): Promise<{ tenantId: string; message: string }> {
    if (!config.tenantId) {
      throw new ConfigurationError('tenantId is required');
    }

    const body: Record<string, unknown> = {
      tenant_id: config.tenantId,
    };
    if (config.errorThreshold !== undefined) body.error_threshold = config.errorThreshold;
    if (config.violationThreshold !== undefined)
      body.violation_threshold = config.violationThreshold;
    if (config.windowSeconds !== undefined) body.window_seconds = config.windowSeconds;
    if (config.defaultTimeoutSeconds !== undefined)
      body.default_timeout_seconds = config.defaultTimeoutSeconds;
    if (config.maxTimeoutSeconds !== undefined) body.max_timeout_seconds = config.maxTimeoutSeconds;
    if (config.enableAutoRecovery !== undefined)
      body.enable_auto_recovery = config.enableAutoRecovery;

    const response = await this.orchestratorRequest<{
      data: { tenant_id: string; message: string };
    }>('PUT', '/api/v1/circuit-breaker/config', body);

    return {
      tenantId: response.data.tenant_id,
      message: response.data.message,
    };
  }

  // ============================================================================
  // Policy Simulation Methods (Evaluation Tier+)
  // ============================================================================

  /**
   * Simulate policy evaluation against a hypothetical request.
   *
   * Dry-run policy evaluation that shows which policies would match and what
   * actions would be taken, without affecting live traffic. Available on
   * Evaluation tier and above.
   *
   * @param request - The simulated request to evaluate against policies
   * @returns Promise resolving to simulation results
   *
   * @example
   * ```typescript
   * const result = await axonflow.simulatePolicies({
   *   query: 'Show me all customer SSNs',
   *   request_type: 'chat',
   *   user: { role: 'analyst', department: 'support' },
   * });
   * console.log(`Allowed: ${result.allowed}`);
   * console.log(`Policies matched: ${result.applied_policies.join(', ')}`);
   * console.log(`Risk score: ${result.risk_score}`);
   * ```
   */
  async simulatePolicies(request: SimulatePoliciesRequest): Promise<SimulatePoliciesResponse> {
    const body: Record<string, unknown> = { query: request.query };
    if (request.request_type !== undefined) body.request_type = request.request_type;
    if (request.user !== undefined) body.user = request.user;
    if (request.client !== undefined) body.client = request.client;
    if (request.context !== undefined) body.context = request.context;

    return this.orchestratorRequest<SimulatePoliciesResponse>(
      'POST',
      '/api/v1/policies/simulate',
      body
    );
  }

  /**
   * Generate a policy impact report for a specific policy against sample inputs.
   *
   * Tests a policy against multiple sample inputs to understand its match rate,
   * block rate, and per-input behavior. Useful for tuning policy configurations
   * before deploying to production.
   *
   * @param policyId - The ID of the policy to evaluate
   * @param inputs - Array of sample inputs to test against the policy
   * @returns Promise resolving to the impact report
   *
   * @example
   * ```typescript
   * const report = await axonflow.getPolicyImpactReport('policy-123', [
   *   { query: 'Show me all customer SSNs', request_type: 'chat' },
   *   { query: 'What is the weather today?', request_type: 'chat' },
   *   { query: 'Delete all user records', request_type: 'chat' },
   * ]);
   * console.log(`Match rate: ${report.match_rate}`);
   * console.log(`Block rate: ${report.block_rate}`);
   * ```
   */
  async getPolicyImpactReport(
    policyId: string,
    inputs: ImpactReportInput[]
  ): Promise<ImpactReportResponse> {
    return this.orchestratorRequest<ImpactReportResponse>(
      'POST',
      '/api/v1/policies/impact-report',
      {
        policy_id: policyId,
        inputs,
      }
    );
  }

  /**
   * Detect conflicts between policies.
   *
   * Analyzes policies for overlapping rules, contradictory actions, or
   * other conflict patterns. Optionally scoped to a specific policy.
   *
   * @param policyId - Optional policy ID to check conflicts for a specific policy
   * @returns Promise resolving to detected conflicts
   *
   * @example
   * ```typescript
   * // Check all policies for conflicts
   * const allConflicts = await axonflow.detectPolicyConflicts();
   * console.log(`Found ${allConflicts.conflict_count} conflicts`);
   *
   * // Check conflicts for a specific policy
   * const policyConflicts = await axonflow.detectPolicyConflicts('policy-123');
   * ```
   */
  async detectPolicyConflicts(policyId?: string): Promise<PolicyConflictResponse> {
    const body: Record<string, unknown> = {};
    if (policyId !== undefined) body.policy_id = policyId;

    return this.orchestratorRequest<PolicyConflictResponse>(
      'POST',
      '/api/v1/policies/conflicts',
      body
    );
  }

  // ============================================================================
  // Audit Log Read Methods
  // ============================================================================

  /**
   * Search audit logs with optional filters.
   *
   * Query the AxonFlow orchestrator for audit logs matching the specified
   * criteria. Use this for compliance dashboards, security investigations,
   * and operational monitoring.
   *
   * @param request - Search filters and pagination options
   * @returns Promise resolving to audit search response
   *
   * @example
   * ```typescript
   * // Search for logs from a specific user in the last 24 hours
   * const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
   * const result = await client.searchAuditLogs({
   *   userEmail: 'analyst@company.com',
   *   startTime: yesterday,
   *   limit: 100,
   * });
   *
   * for (const entry of result.entries) {
   *   console.log(`[${entry.timestamp}] ${entry.userEmail}: ${entry.querySummary}`);
   * }
   * ```
   */
  async searchAuditLogs(request?: AuditSearchRequest): Promise<AuditSearchResponse> {
    const limit = Math.min(request?.limit ?? 100, 1000);
    const offset = request?.offset ?? 0;

    // Build request body with only defined values
    const body: Record<string, unknown> = { limit };
    if (request?.userEmail) body.user_email = request.userEmail;
    if (request?.clientId) body.client_id = request.clientId;
    if (request?.startTime) body.start_time = request.startTime.toISOString();
    if (request?.endTime) body.end_time = request.endTime.toISOString();
    if (request?.requestType) body.request_type = request.requestType;
    if (offset > 0) body.offset = offset;

    if (this.config.debug) {
      debugLog('Searching audit logs', { limit, offset });
    }

    const response = await this.orchestratorRequest<unknown>('POST', '/api/v1/audit/search', body);

    // Handle both array and wrapped response formats
    if (Array.isArray(response)) {
      const entries = response.map(e => this.parseAuditLogEntry(e));
      return {
        entries,
        total: entries.length,
        limit,
        offset,
      };
    }

    const data = response as Record<string, unknown>;
    const entries = ((data.entries as unknown[]) || []).map(e => this.parseAuditLogEntry(e));
    return {
      entries,
      total: (data.total as number) ?? entries.length,
      limit: (data.limit as number) ?? limit,
      offset: (data.offset as number) ?? offset,
    };
  }

  /**
   * Get recent audit logs for a specific tenant.
   *
   * Convenience method for tenant-scoped audit queries. Use this when you
   * need to view all recent activity for a specific tenant.
   *
   * @param tenantId - The tenant identifier to query
   * @param options - Pagination options (limit, offset)
   * @returns Promise resolving to audit search response
   * @throws Error if tenantId is empty
   *
   * @example
   * ```typescript
   * // Get the last 50 audit logs for a tenant
   * const result = await client.getAuditLogsByTenant('tenant-abc');
   * console.log(`Found ${result.entries.length} entries`);
   *
   * // With custom options
   * const result2 = await client.getAuditLogsByTenant('tenant-abc', {
   *   limit: 100,
   *   offset: 50,
   * });
   * ```
   */
  async getAuditLogsByTenant(
    tenantId: string,
    options?: AuditQueryOptions
  ): Promise<AuditSearchResponse> {
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const limit = Math.min(options?.limit ?? 50, 1000);
    const offset = options?.offset ?? 0;

    if (this.config.debug) {
      debugLog('Getting audit logs for tenant', { tenantId, limit, offset });
    }

    const path = `/api/v1/audit/tenant/${encodeURIComponent(tenantId)}?limit=${limit}&offset=${offset}`;
    const response = await this.orchestratorRequest<unknown>('GET', path);

    // Handle both array and wrapped response formats
    if (Array.isArray(response)) {
      const entries = response.map(e => this.parseAuditLogEntry(e));
      return {
        entries,
        total: entries.length,
        limit,
        offset,
      };
    }

    const data = response as Record<string, unknown>;
    const entries = ((data.entries as unknown[]) || []).map(e => this.parseAuditLogEntry(e));
    return {
      entries,
      total: (data.total as number) ?? entries.length,
      limit: (data.limit as number) ?? limit,
      offset: (data.offset as number) ?? offset,
    };
  }

  /**
   * Parse a raw audit log entry from the API into the typed interface
   */
  private parseAuditLogEntry(raw: unknown): AuditLogEntry {
    const data = raw as Record<string, unknown>;
    return {
      id: (data.id as string) ?? '',
      requestId: (data.request_id as string) ?? '',
      timestamp: data.timestamp ? new Date(data.timestamp as string) : new Date(),
      userEmail: (data.user_email as string) ?? '',
      clientId: (data.client_id as string) ?? '',
      tenantId: (data.tenant_id as string) ?? '',
      requestType: (data.request_type as string) ?? '',
      querySummary: (data.query_summary as string) ?? '',
      success: (data.success as boolean) ?? true,
      blocked: (data.blocked as boolean) ?? false,
      riskScore: (data.risk_score as number) ?? 0,
      provider: (data.provider as string) ?? '',
      model: (data.model as string) ?? '',
      tokensUsed: (data.tokens_used as number) ?? 0,
      latencyMs: (data.latency_ms as number) ?? 0,
      policyViolations: (data.policy_violations as string[]) ?? [],
      metadata: (data.metadata as Record<string, unknown>) ?? {},
    };
  }

  // ============================================================================
  // Policy CRUD Methods - Static Policies
  // ============================================================================

  /**
   * Build authentication headers for API requests.
   * Includes Content-Type and X-Org-ID for policy APIs.
   * Uses getAuthHeaders() for authentication credentials.
   */
  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    // Do NOT set X-Org-ID here - the server derives org from tenant context
    // Setting X-Org-ID to 'default' breaks budget queries which expect org_id to match client.OrgID

    return headers;
  }

  /**
   * Generic HTTP request helper for policy APIs
   */
  private async policyRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.endpoint}${path}`;
    const headers = this.buildAuthHeaders();

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Request failed: ${errorText}`);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * List all static policies with optional filtering.
   *
   * @param options - Filtering and pagination options
   * @returns Array of static policies
   *
   * @example
   * ```typescript
   * // List all enabled SQL injection policies
   * const policies = await axonflow.listStaticPolicies({
   *   category: 'security-sqli',
   *   enabled: true
   * });
   * ```
   */
  async listStaticPolicies(options?: ListStaticPoliciesOptions): Promise<StaticPolicy[]> {
    const params = new URLSearchParams();

    if (options?.category) params.set('category', options.category);
    if (options?.tier) params.set('tier', options.tier);
    if (options?.organizationId) params.set('organization_id', options.organizationId);
    if (options?.enabled !== undefined) params.set('enabled', String(options.enabled));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.sortBy) params.set('sort_by', options.sortBy);
    if (options?.sortOrder) params.set('sort_order', options.sortOrder);
    if (options?.search) params.set('search', options.search);

    const queryString = params.toString();
    const path = `/api/v1/static-policies${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Listing static policies', { options });
    }

    // Backend returns { policies: [], pagination: {} }, extract the array
    const response = await this.policyRequest<{ policies: StaticPolicy[] }>('GET', path);
    return response.policies || [];
  }

  /**
   * Get a specific static policy by ID.
   *
   * @param id - Policy ID
   * @returns The static policy
   *
   * @example
   * ```typescript
   * const policy = await axonflow.getStaticPolicy('pol_123');
   * console.log(policy.name, policy.pattern);
   * ```
   */
  async getStaticPolicy(id: string): Promise<StaticPolicy> {
    if (this.config.debug) {
      debugLog('Getting static policy', { id });
    }

    return this.policyRequest<StaticPolicy>('GET', `/api/v1/static-policies/${id}`);
  }

  /**
   * Create a new static policy.
   *
   * @param policy - Policy creation request
   * @returns The created policy
   *
   * @example
   * ```typescript
   * const policy = await axonflow.createStaticPolicy({
   *   name: 'Block Credit Card Numbers',
   *   category: 'pii-global',
   *   pattern: '\\b(?:\\d{4}[- ]?){3}\\d{4}\\b',
   *   severity: 8,
   *   action: 'block'
   * });
   * ```
   */
  async createStaticPolicy(policy: CreateStaticPolicyRequest): Promise<StaticPolicy> {
    if (this.config.debug) {
      debugLog('Creating static policy', { name: policy.name });
    }

    // Default to 'tenant' tier for custom policies if not specified
    // Convert camelCase to snake_case for API compatibility
    const requestBody: Record<string, unknown> = {
      name: policy.name,
      description: policy.description,
      category: policy.category,
      pattern: policy.pattern,
      severity: policy.severity,
      enabled: policy.enabled,
      action: policy.action,
      tier: policy.tier || 'tenant',
    };

    // Add organization_id for organization tier policies
    if (policy.organizationId) {
      requestBody.organization_id = policy.organizationId;
    }

    return this.policyRequest<StaticPolicy>('POST', '/api/v1/static-policies', requestBody);
  }

  /**
   * Update an existing static policy.
   *
   * @param id - Policy ID
   * @param policy - Fields to update
   * @returns The updated policy
   *
   * @example
   * ```typescript
   * const updated = await axonflow.updateStaticPolicy('pol_123', {
   *   severity: 10,
   *   description: 'Updated description'
   * });
   * ```
   */
  async updateStaticPolicy(id: string, policy: UpdateStaticPolicyRequest): Promise<StaticPolicy> {
    if (this.config.debug) {
      debugLog('Updating static policy', { id, updates: Object.keys(policy) });
    }

    return this.policyRequest<StaticPolicy>('PUT', `/api/v1/static-policies/${id}`, policy);
  }

  /**
   * Delete a static policy.
   *
   * @param id - Policy ID
   *
   * @example
   * ```typescript
   * await axonflow.deleteStaticPolicy('pol_123');
   * ```
   */
  async deleteStaticPolicy(id: string): Promise<void> {
    if (this.config.debug) {
      debugLog('Deleting static policy', { id });
    }

    await this.policyRequest<void>('DELETE', `/api/v1/static-policies/${id}`);
  }

  /**
   * Toggle a static policy's enabled status.
   *
   * @param id - Policy ID
   * @param enabled - Whether the policy should be enabled
   * @returns The updated policy
   *
   * @example
   * ```typescript
   * // Disable a policy
   * await axonflow.toggleStaticPolicy('pol_123', false);
   * ```
   */
  async toggleStaticPolicy(id: string, enabled: boolean): Promise<StaticPolicy> {
    if (this.config.debug) {
      debugLog('Toggling static policy', { id, enabled });
    }

    return this.policyRequest<StaticPolicy>('PATCH', `/api/v1/static-policies/${id}`, { enabled });
  }

  /**
   * Get effective static policies with tier inheritance applied.
   * This returns the policies that would actually be enforced, taking into
   * account system, organization, and tenant policies with proper inheritance.
   *
   * @param options - Filtering options
   * @returns Array of effective policies
   *
   * @example
   * ```typescript
   * const effective = await axonflow.getEffectiveStaticPolicies({
   *   category: 'security-sqli'
   * });
   * ```
   */
  async getEffectiveStaticPolicies(options?: EffectivePoliciesOptions): Promise<StaticPolicy[]> {
    const params = new URLSearchParams();

    if (options?.category) params.set('category', options.category);
    if (options?.includeDisabled) params.set('include_disabled', 'true');
    if (options?.includeOverridden) params.set('include_overridden', 'true');

    const queryString = params.toString();
    const path = `/api/v1/static-policies/effective${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Getting effective static policies', { options });
    }

    // Backend returns { static: [], dynamic: [], ... }, extract the static array
    const response = await this.policyRequest<{ static: StaticPolicy[] }>('GET', path);
    return response.static || [];
  }

  /**
   * Test a regex pattern against sample inputs.
   * Use this to validate patterns before creating policies.
   *
   * @param pattern - Regex pattern to test
   * @param testInputs - Array of strings to test against
   * @returns Test results showing matches
   *
   * @example
   * ```typescript
   * const result = await axonflow.testPattern(
   *   '\\b\\d{3}-\\d{2}-\\d{4}\\b',
   *   ['My SSN is 123-45-6789', 'No SSN here', 'Another: 987-65-4321']
   * );
   * console.log(result.results); // Shows which inputs matched
   * ```
   */
  async testPattern(pattern: string, testInputs: string[]): Promise<TestPatternResult> {
    if (this.config.debug) {
      debugLog('Testing pattern', { pattern, inputCount: testInputs.length });
    }

    return this.policyRequest<TestPatternResult>('POST', '/api/v1/static-policies/test', {
      pattern,
      inputs: testInputs,
    });
  }

  /**
   * Get version history for a static policy.
   *
   * @param id - Policy ID
   * @returns Array of version history entries
   *
   * @example
   * ```typescript
   * const versions = await axonflow.getStaticPolicyVersions('pol_123');
   * versions.forEach(v => console.log(v.version, v.changeType, v.changedAt));
   * ```
   */
  async getStaticPolicyVersions(id: string): Promise<PolicyVersion[]> {
    if (this.config.debug) {
      debugLog('Getting static policy versions', { id });
    }

    const response = await this.policyRequest<{
      policy_id: string;
      versions: Array<{
        version: number;
        changed_by?: string;
        changed_at: string;
        change_type: string;
        change_description?: string;
        previous_values?: Record<string, unknown>;
        new_values?: Record<string, unknown>;
      }>;
      count: number;
    }>('GET', `/api/v1/static-policies/${id}/versions`);

    // Transform snake_case API response to camelCase
    return response.versions.map(v => ({
      version: v.version,
      changedBy: v.changed_by,
      changedAt: v.changed_at,
      changeType: v.change_type as PolicyVersion['changeType'],
      changeDescription: v.change_description,
      previousValues: v.previous_values,
      newValues: v.new_values,
    }));
  }

  // ============================================================================
  // Policy Override Methods (Enterprise)
  // ============================================================================

  /**
   * Create an override for a static policy.
   * Overrides allow changing how a system policy behaves at the organization level.
   *
   * @param policyId - ID of the policy to override
   * @param override - Override configuration
   * @returns The created override
   *
   * @example
   * ```typescript
   * // Change a blocking policy to warn-only
   * const override = await axonflow.createPolicyOverride('pol_123', {
   *   action_override: 'warn',
   *   override_reason: 'Temporarily reducing strictness for migration',
   *   expires_at: '2025-01-31T23:59:59Z'
   * });
   * ```
   */
  async createPolicyOverride(
    policyId: string,
    override: CreatePolicyOverrideRequest
  ): Promise<PolicyOverride> {
    if (this.config.debug) {
      debugLog('Creating policy override', { policyId, action: override.action_override });
    }

    return this.policyRequest<PolicyOverride>(
      'POST',
      `/api/v1/static-policies/${policyId}/override`,
      override
    );
  }

  /**
   * Delete an override for a static policy.
   * This restores the policy to its default behavior.
   *
   * @param policyId - ID of the policy whose override to delete
   *
   * @example
   * ```typescript
   * await axonflow.deletePolicyOverride('pol_123');
   * ```
   */
  async deletePolicyOverride(policyId: string): Promise<void> {
    if (this.config.debug) {
      debugLog('Deleting policy override', { policyId });
    }

    await this.policyRequest<void>('DELETE', `/api/v1/static-policies/${policyId}/override`);
  }

  /**
   * List all active policy overrides (Enterprise).
   * Returns all overrides that are currently active across all policies.
   *
   * @returns Array of policy overrides
   *
   * @example
   * ```typescript
   * const overrides = await axonflow.listPolicyOverrides();
   * for (const override of overrides) {
   *   console.log(`Policy ${override.policyId}: ${override.action} - ${override.reason}`);
   * }
   * ```
   */
  async listPolicyOverrides(): Promise<PolicyOverride[]> {
    if (this.config.debug) {
      debugLog('Listing policy overrides');
    }

    const response = await this.policyRequest<{ overrides: PolicyOverride[] }>(
      'GET',
      '/api/v1/static-policies/overrides'
    );
    return response.overrides || [];
  }

  // ============================================================================
  // Dynamic Policy Methods
  // ============================================================================

  /**
   * List all dynamic policies with optional filtering.
   *
   * @param options - Filtering and pagination options
   * @returns Array of dynamic policies
   *
   * @example
   * ```typescript
   * const policies = await axonflow.listDynamicPolicies({
   *   type: 'cost',
   *   enabled: true
   * });
   * ```
   */
  async listDynamicPolicies(options?: ListDynamicPoliciesOptions): Promise<DynamicPolicy[]> {
    const params = new URLSearchParams();

    if (options?.type) params.set('type', options.type);
    if (options?.tier) params.set('tier', options.tier);
    if (options?.organizationId) params.set('organization_id', options.organizationId);
    if (options?.enabled !== undefined) params.set('enabled', String(options.enabled));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.sortBy) params.set('sort_by', options.sortBy);
    if (options?.sortOrder) params.set('sort_order', options.sortOrder);
    if (options?.search) params.set('search', options.search);

    const queryString = params.toString();
    const path = `/api/v1/dynamic-policies${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Listing dynamic policies', { options });
    }

    // API returns {"policies": [...]} wrapper via Agent proxy
    const response = await this.orchestratorRequest<
      { policies: DynamicPolicy[] } | DynamicPolicy[]
    >('GET', path);
    // Handle both wrapped and unwrapped responses for compatibility
    return Array.isArray(response) ? response : response.policies || [];
  }

  /**
   * Get a specific dynamic policy by ID.
   *
   * @param id - Policy ID
   * @returns The dynamic policy
   */
  async getDynamicPolicy(id: string): Promise<DynamicPolicy> {
    if (this.config.debug) {
      debugLog('Getting dynamic policy', { id });
    }

    // API returns {"policy": {...}} wrapper via Agent proxy
    const response = await this.orchestratorRequest<{ policy: DynamicPolicy } | DynamicPolicy>(
      'GET',
      `/api/v1/dynamic-policies/${id}`
    );
    // Handle both wrapped and unwrapped responses for compatibility
    return 'policy' in response ? response.policy : response;
  }

  /**
   * Create a new dynamic policy.
   *
   * @param policy - Policy creation request
   * @returns The created policy
   *
   * @example
   * ```typescript
   * const policy = await axonflow.createDynamicPolicy({
   *   name: 'Rate Limit API Calls',
   *   category: 'dynamic-cost',
   *   config: {
   *     type: 'rate-limit',
   *     rules: { maxRequestsPerMinute: 100 },
   *     action: 'block'
   *   }
   * });
   * ```
   */
  async createDynamicPolicy(policy: CreateDynamicPolicyRequest): Promise<DynamicPolicy> {
    if (this.config.debug) {
      debugLog('Creating dynamic policy', { name: policy.name });
    }

    // Convert camelCase to snake_case for API compatibility
    const requestBody: Record<string, unknown> = {
      name: policy.name,
      type: policy.type,
      conditions: policy.conditions,
      actions: policy.actions,
    };
    if (policy.description) requestBody.description = policy.description;
    if (policy.category) requestBody.category = policy.category;
    if (policy.priority !== undefined) requestBody.priority = policy.priority;
    if (policy.enabled !== undefined) requestBody.enabled = policy.enabled;
    requestBody.tier = policy.tier || 'tenant';
    if (policy.organizationId) {
      requestBody.organization_id = policy.organizationId;
    }

    // API returns {"policy": {...}} wrapper via Agent proxy
    const response = await this.orchestratorRequest<{ policy: DynamicPolicy } | DynamicPolicy>(
      'POST',
      '/api/v1/dynamic-policies',
      requestBody
    );
    // Handle both wrapped and unwrapped responses for compatibility
    return 'policy' in response ? response.policy : response;
  }

  /**
   * Update an existing dynamic policy.
   *
   * @param id - Policy ID
   * @param policy - Fields to update
   * @returns The updated policy
   */
  async updateDynamicPolicy(
    id: string,
    policy: UpdateDynamicPolicyRequest
  ): Promise<DynamicPolicy> {
    if (this.config.debug) {
      debugLog('Updating dynamic policy', { id, updates: Object.keys(policy) });
    }

    // Convert camelCase to snake_case for API compatibility
    const requestBody: Record<string, unknown> = {};
    if (policy.name !== undefined) requestBody.name = policy.name;
    if (policy.description !== undefined) requestBody.description = policy.description;
    if (policy.type !== undefined) requestBody.type = policy.type;
    if (policy.category !== undefined) requestBody.category = policy.category;
    if (policy.tier !== undefined) requestBody.tier = policy.tier;
    if (policy.organizationId !== undefined) requestBody.organization_id = policy.organizationId;
    if (policy.conditions !== undefined) requestBody.conditions = policy.conditions;
    if (policy.actions !== undefined) requestBody.actions = policy.actions;
    if (policy.priority !== undefined) requestBody.priority = policy.priority;
    if (policy.enabled !== undefined) requestBody.enabled = policy.enabled;

    // API returns {"policy": {...}} wrapper via Agent proxy
    const response = await this.orchestratorRequest<{ policy: DynamicPolicy } | DynamicPolicy>(
      'PUT',
      `/api/v1/dynamic-policies/${id}`,
      requestBody
    );
    // Handle both wrapped and unwrapped responses for compatibility
    return 'policy' in response ? response.policy : response;
  }

  /**
   * Delete a dynamic policy.
   *
   * @param id - Policy ID
   */
  async deleteDynamicPolicy(id: string): Promise<void> {
    if (this.config.debug) {
      debugLog('Deleting dynamic policy', { id });
    }

    await this.orchestratorRequest<void>('DELETE', `/api/v1/dynamic-policies/${id}`);
  }

  /**
   * Toggle a dynamic policy's enabled status.
   *
   * @param id - Policy ID
   * @param enabled - Whether the policy should be enabled
   * @returns The updated policy
   */
  async toggleDynamicPolicy(id: string, enabled: boolean): Promise<DynamicPolicy> {
    if (this.config.debug) {
      debugLog('Toggling dynamic policy', { id, enabled });
    }

    // API returns {"policy": {...}} wrapper via Agent proxy
    const response = await this.orchestratorRequest<{ policy: DynamicPolicy } | DynamicPolicy>(
      'PUT',
      `/api/v1/dynamic-policies/${id}`,
      { enabled }
    );
    // Handle both wrapped and unwrapped responses for compatibility
    return 'policy' in response ? response.policy : response;
  }

  /**
   * Get effective dynamic policies with tier inheritance applied.
   *
   * @param options - Filtering options
   * @returns Array of effective dynamic policies
   */
  async getEffectiveDynamicPolicies(options?: EffectivePoliciesOptions): Promise<DynamicPolicy[]> {
    const params = new URLSearchParams();

    if (options?.category) params.set('category', options.category);
    if (options?.includeDisabled) params.set('include_disabled', 'true');

    const queryString = params.toString();
    const path = `/api/v1/dynamic-policies/effective${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Getting effective dynamic policies', { options });
    }

    // API returns {"policies": [...]} wrapper via Agent proxy
    const response = await this.orchestratorRequest<
      { policies: DynamicPolicy[] } | DynamicPolicy[]
    >('GET', path);
    // Handle both wrapped and unwrapped responses for compatibility
    return Array.isArray(response) ? response : response.policies || [];
  }

  // ============================================================================
  // Portal Authentication Methods (Enterprise)
  // ============================================================================

  /**
   * Login to Customer Portal and store session cookie.
   * Required before using Code Governance methods.
   *
   * @param orgId - Organization ID
   * @param password - Organization password
   * @returns Login response with session info
   *
   * @example
   * ```typescript
   * const login = await axonflow.loginToPortal('test-org-001', 'test123');
   * console.log(`Logged in as ${login.name}`);
   *
   * // Now you can use Code Governance methods
   * const providers = await axonflow.listGitProviders();
   * ```
   */
  async loginToPortal(
    orgId: string,
    password: string
  ): Promise<{ sessionId: string; orgId: string; email: string; name: string; expiresAt: string }> {
    const url = `${this.config.endpoint}/api/v1/auth/login`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, password }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AuthenticationError(`Login failed: ${errorText}`);
    }

    const result = (await response.json()) as {
      session_id: string;
      org_id: string;
      email: string;
      name: string;
      expires_at: string;
    };

    // Extract session cookie from response
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      const match = cookies.match(/axonflow_session=([^;]+)/);
      if (match) {
        this.sessionCookie = match[1];
      }
    }

    // Fallback to session_id in response body
    if (!this.sessionCookie && result.session_id) {
      this.sessionCookie = result.session_id;
    }

    if (this.config.debug) {
      debugLog('Portal login successful', { orgId });
    }

    return {
      sessionId: result.session_id,
      orgId: result.org_id,
      email: result.email,
      name: result.name,
      expiresAt: result.expires_at,
    };
  }

  /**
   * Logout from Customer Portal and clear session cookie.
   */
  async logoutFromPortal(): Promise<void> {
    if (!this.sessionCookie) {
      return;
    }

    try {
      await fetch(`${this.config.endpoint}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Cookie: `axonflow_session=${this.sessionCookie}` },
        signal: AbortSignal.timeout(this.config.timeout),
      });
    } catch {
      // Ignore logout errors
    }

    this.sessionCookie = null;

    if (this.config.debug) {
      debugLog('Portal logout successful');
    }
  }

  /**
   * Check if logged in to Customer Portal.
   */
  isLoggedIn(): boolean {
    return this.sessionCookie !== null;
  }

  // ============================================================================
  // Code Governance Methods (Enterprise)
  // ============================================================================

  /**
   * Validate Git provider credentials before configuration.
   * Use this to verify tokens and connectivity before saving.
   *
   * @param request - Validation request with provider type and credentials
   * @returns Validation result indicating if credentials are valid
   *
   * @example
   * ```typescript
   * const result = await axonflow.validateGitProvider({
   *   type: 'github',
   *   token: 'ghp_xxxxxxxxxxxx'
   * });
   *
   * if (result.valid) {
   *   console.log('Credentials are valid');
   * } else {
   *   console.log('Invalid:', result.message);
   * }
   * ```
   */
  async validateGitProvider(
    request: ValidateGitProviderRequest
  ): Promise<ValidateGitProviderResponse> {
    if (this.config.debug) {
      debugLog('Validating Git provider', { type: request.type });
    }

    // Transform camelCase to snake_case for API
    const apiRequest: Record<string, unknown> = {
      type: request.type,
    };
    if (request.token) apiRequest.token = request.token;
    if (request.baseUrl) apiRequest.base_url = request.baseUrl;
    if (request.appId) apiRequest.app_id = request.appId;
    if (request.installationId) apiRequest.installation_id = request.installationId;
    if (request.privateKey) apiRequest.private_key = request.privateKey;

    return this.portalRequest<ValidateGitProviderResponse>(
      'POST',
      '/api/v1/code-governance/git-providers/validate',
      apiRequest
    );
  }

  /**
   * Configure a Git provider for code governance.
   * Supports GitHub, GitLab, and Bitbucket (cloud and self-hosted).
   *
   * @param request - Configuration request with provider type and credentials
   * @returns Configuration result
   *
   * @example
   * ```typescript
   * // Configure GitHub with personal access token
   * await axonflow.configureGitProvider({
   *   type: 'github',
   *   token: 'ghp_xxxxxxxxxxxx'
   * });
   *
   * // Configure GitLab self-hosted
   * await axonflow.configureGitProvider({
   *   type: 'gitlab',
   *   token: 'glpat-xxxxxxxxxxxx',
   *   baseUrl: 'https://gitlab.mycompany.com'
   * });
   *
   * // Configure GitHub App
   * await axonflow.configureGitProvider({
   *   type: 'github',
   *   appId: 12345,
   *   installationId: 67890,
   *   privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...'
   * });
   * ```
   */
  async configureGitProvider(
    request: ConfigureGitProviderRequest
  ): Promise<ConfigureGitProviderResponse> {
    if (this.config.debug) {
      debugLog('Configuring Git provider', { type: request.type });
    }

    // Transform camelCase to snake_case for API
    const apiRequest: Record<string, unknown> = {
      type: request.type,
    };
    if (request.token) apiRequest.token = request.token;
    if (request.baseUrl) apiRequest.base_url = request.baseUrl;
    if (request.appId) apiRequest.app_id = request.appId;
    if (request.installationId) apiRequest.installation_id = request.installationId;
    if (request.privateKey) apiRequest.private_key = request.privateKey;

    return this.portalRequest<ConfigureGitProviderResponse>(
      'POST',
      '/api/v1/code-governance/git-providers',
      apiRequest
    );
  }

  /**
   * List all configured Git providers for the tenant.
   *
   * @returns List of configured providers
   *
   * @example
   * ```typescript
   * const { providers, count } = await axonflow.listGitProviders();
   * console.log(`${count} providers configured:`);
   * providers.forEach(p => console.log(`  - ${p.type}`));
   * ```
   */
  async listGitProviders(): Promise<ListGitProvidersResponse> {
    if (this.config.debug) {
      debugLog('Listing Git providers');
    }

    return this.portalRequest<ListGitProvidersResponse>(
      'GET',
      '/api/v1/code-governance/git-providers'
    );
  }

  /**
   * Delete a configured Git provider.
   *
   * @param type - Provider type to delete (github, gitlab, or bitbucket)
   *
   * @example
   * ```typescript
   * await axonflow.deleteGitProvider('github');
   * ```
   */
  async deleteGitProvider(type: GitProviderType): Promise<void> {
    if (this.config.debug) {
      debugLog('Deleting Git provider', { type });
    }

    await this.portalRequest<void>('DELETE', `/api/v1/code-governance/git-providers/${type}`);
  }

  /**
   * Create a Pull Request from LLM-generated code.
   * This creates a PR with full audit trail linking back to the AI request.
   *
   * @param request - PR creation request with repository info and files
   * @returns Created PR details including URL and number
   *
   * @example
   * ```typescript
   * const pr = await axonflow.createPR({
   *   owner: 'myorg',
   *   repo: 'myrepo',
   *   title: 'feat: add user validation utilities',
   *   description: 'LLM-generated validation functions',
   *   files: [
   *     {
   *       path: 'src/utils/validation.ts',
   *       content: generatedCode,
   *       language: 'typescript',
   *       action: 'create'
   *     }
   *   ],
   *   agentRequestId: 'req_123',
   *   model: 'gpt-4',
   *   policiesChecked: ['code-secrets', 'code-unsafe'],
   *   secretsDetected: 0,
   *   unsafePatterns: 0
   * });
   *
   * console.log(`PR created: ${pr.prUrl}`);
   * ```
   */
  async createPR(request: CreatePRRequest): Promise<CreatePRResponse> {
    if (this.config.debug) {
      debugLog('Creating PR', { owner: request.owner, repo: request.repo, title: request.title });
    }

    // Transform camelCase to snake_case for API
    const apiRequest: Record<string, unknown> = {
      owner: request.owner,
      repo: request.repo,
      title: request.title,
      files: request.files.map(f => ({
        path: f.path,
        content: f.content,
        language: f.language,
        action: f.action,
      })),
    };
    if (request.description) apiRequest.description = request.description;
    if (request.baseBranch) apiRequest.base_branch = request.baseBranch;
    if (request.branchName) apiRequest.branch_name = request.branchName;
    if (request.draft !== undefined) apiRequest.draft = request.draft;
    if (request.agentRequestId) apiRequest.agent_request_id = request.agentRequestId;
    if (request.model) apiRequest.model = request.model;
    if (request.policiesChecked) apiRequest.policies_checked = request.policiesChecked;
    if (request.secretsDetected !== undefined)
      apiRequest.secrets_detected = request.secretsDetected;
    if (request.unsafePatterns !== undefined) apiRequest.unsafe_patterns = request.unsafePatterns;

    const response = await this.portalRequest<{
      pr_id: string;
      pr_number: number;
      pr_url: string;
      state: string;
      head_branch: string;
      created_at: string;
    }>('POST', '/api/v1/code-governance/prs', apiRequest);

    // Transform snake_case response to camelCase
    return {
      prId: response.pr_id,
      prNumber: response.pr_number,
      prUrl: response.pr_url,
      state: response.state,
      headBranch: response.head_branch,
      createdAt: response.created_at,
    };
  }

  /**
   * List Pull Requests created through code governance.
   *
   * @param options - Filtering and pagination options
   * @returns List of PR records
   *
   * @example
   * ```typescript
   * const { prs, count } = await axonflow.listPRs({
   *   state: 'open',
   *   limit: 10
   * });
   *
   * prs.forEach(pr => {
   *   console.log(`#${pr.prNumber}: ${pr.title} (${pr.state})`);
   *   if (pr.secretsDetected > 0) {
   *     console.log(`  Warning: ${pr.secretsDetected} secrets detected`);
   *   }
   * });
   * ```
   */
  async listPRs(options?: ListPRsOptions): Promise<ListPRsResponse> {
    const params = new URLSearchParams();

    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.state) params.set('state', options.state);

    const queryString = params.toString();
    const path = `/api/v1/code-governance/prs${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Listing PRs', { options });
    }

    const response = await this.portalRequest<{
      prs: Array<{
        id: string;
        pr_number: number;
        pr_url: string;
        title: string;
        state: string;
        owner: string;
        repo: string;
        head_branch: string;
        base_branch: string;
        files_count: number;
        secrets_detected: number;
        unsafe_patterns: number;
        created_at: string;
        created_by?: string;
        provider_type?: string;
      }>;
      count: number;
    }>('GET', path);

    // Transform snake_case response to camelCase
    return {
      prs: (response.prs || []).map(pr => ({
        id: pr.id,
        prNumber: pr.pr_number,
        prUrl: pr.pr_url,
        title: pr.title,
        state: pr.state,
        owner: pr.owner,
        repo: pr.repo,
        headBranch: pr.head_branch,
        baseBranch: pr.base_branch,
        filesCount: pr.files_count,
        secretsDetected: pr.secrets_detected,
        unsafePatterns: pr.unsafe_patterns,
        createdAt: pr.created_at,
        createdBy: pr.created_by,
        providerType: pr.provider_type,
      })),
      count: response.count,
    };
  }

  /**
   * Get a specific PR record by ID.
   *
   * @param prId - PR record ID (internal ID, not GitHub PR number)
   * @returns PR record details
   *
   * @example
   * ```typescript
   * const pr = await axonflow.getPR('pr_123');
   * console.log(`PR #${pr.prNumber}: ${pr.title}`);
   * ```
   */
  async getPR(prId: string): Promise<PRRecord> {
    if (this.config.debug) {
      debugLog('Getting PR', { prId });
    }

    const response = await this.portalRequest<{
      id: string;
      pr_number: number;
      pr_url: string;
      title: string;
      state: string;
      owner: string;
      repo: string;
      head_branch: string;
      base_branch: string;
      files_count: number;
      secrets_detected: number;
      unsafe_patterns: number;
      created_at: string;
      created_by?: string;
      provider_type?: string;
    }>('GET', `/api/v1/code-governance/prs/${prId}`);

    // Transform snake_case response to camelCase
    return {
      id: response.id,
      prNumber: response.pr_number,
      prUrl: response.pr_url,
      title: response.title,
      state: response.state,
      owner: response.owner,
      repo: response.repo,
      headBranch: response.head_branch,
      baseBranch: response.base_branch,
      filesCount: response.files_count,
      secretsDetected: response.secrets_detected,
      unsafePatterns: response.unsafe_patterns,
      createdAt: response.created_at,
      createdBy: response.created_by,
      providerType: response.provider_type,
    };
  }

  /**
   * Close a PR without merging and optionally delete the branch.
   * Useful for cleaning up test PRs created by examples.
   *
   * @param prId - PR record ID
   * @param deleteBranch - Whether to delete the associated branch (default: true)
   * @returns Closed PR record
   *
   * @example
   * ```typescript
   * // Close PR and delete branch
   * const pr = await axonflow.closePR('pr_123');
   * console.log(`PR #${pr.prNumber} closed`);
   *
   * // Close PR but keep branch
   * const pr = await axonflow.closePR('pr_123', false);
   * ```
   */
  async closePR(prId: string, deleteBranch: boolean = true): Promise<PRRecord> {
    if (this.config.debug) {
      debugLog('Closing PR', { prId, deleteBranch });
    }

    const query = deleteBranch ? '?delete_branch=true' : '';
    const response = await this.portalRequest<{
      id: string;
      pr_number: number;
      pr_url: string;
      title: string;
      state: string;
      owner: string;
      repo: string;
      head_branch: string;
      base_branch: string;
      files_count: number;
      secrets_detected: number;
      unsafe_patterns: number;
      created_at: string;
      closed_at?: string;
      created_by?: string;
      provider_type?: string;
    }>('DELETE', `/api/v1/code-governance/prs/${prId}${query}`);

    return {
      id: response.id,
      prNumber: response.pr_number,
      prUrl: response.pr_url,
      title: response.title,
      state: response.state,
      owner: response.owner,
      repo: response.repo,
      headBranch: response.head_branch,
      baseBranch: response.base_branch,
      filesCount: response.files_count,
      secretsDetected: response.secrets_detected,
      unsafePatterns: response.unsafe_patterns,
      createdAt: response.created_at,
      closedAt: response.closed_at,
      createdBy: response.created_by,
      providerType: response.provider_type,
    };
  }

  /**
   * Sync PR status with the Git provider.
   * This updates the local record with the current state from GitHub/GitLab/Bitbucket.
   *
   * @param prId - PR record ID
   * @returns Updated PR record
   *
   * @example
   * ```typescript
   * const pr = await axonflow.syncPRStatus('pr_123');
   * console.log(`PR is now ${pr.state}`);
   * ```
   */
  async syncPRStatus(prId: string): Promise<PRRecord> {
    if (this.config.debug) {
      debugLog('Syncing PR status', { prId });
    }

    const response = await this.portalRequest<{
      id: string;
      pr_number: number;
      pr_url: string;
      title: string;
      state: string;
      owner: string;
      repo: string;
      head_branch: string;
      base_branch: string;
      files_count: number;
      secrets_detected: number;
      unsafe_patterns: number;
      created_at: string;
      created_by?: string;
      provider_type?: string;
    }>('POST', `/api/v1/code-governance/prs/${prId}/sync`);

    // Transform snake_case response to camelCase
    return {
      id: response.id,
      prNumber: response.pr_number,
      prUrl: response.pr_url,
      title: response.title,
      state: response.state,
      owner: response.owner,
      repo: response.repo,
      headBranch: response.head_branch,
      baseBranch: response.base_branch,
      filesCount: response.files_count,
      secretsDetected: response.secrets_detected,
      unsafePatterns: response.unsafe_patterns,
      createdAt: response.created_at,
      createdBy: response.created_by,
      providerType: response.provider_type,
    };
  }

  // ============================================================================
  // Code Governance Metrics and Export Methods (Enterprise)
  // ============================================================================

  /**
   * Get aggregated code governance metrics for the tenant.
   * Returns PR counts, file totals, and security findings.
   *
   * @returns Code governance metrics
   *
   * @example
   * ```typescript
   * const metrics = await axonflow.getCodeGovernanceMetrics();
   * console.log(`Total PRs: ${metrics.totalPrs}`);
   * console.log(`Secrets Detected: ${metrics.totalSecretsDetected}`);
   * ```
   */
  async getCodeGovernanceMetrics(): Promise<CodeGovernanceMetrics> {
    if (this.config.debug) {
      debugLog('Getting code governance metrics');
    }

    const response = await this.portalRequest<{
      tenant_id: string;
      total_prs: number;
      open_prs: number;
      merged_prs: number;
      closed_prs: number;
      total_files: number;
      total_secrets_detected: number;
      total_unsafe_patterns: number;
      first_pr_at?: string;
      last_pr_at?: string;
    }>('GET', '/api/v1/code-governance/metrics');

    return {
      tenantId: response.tenant_id,
      totalPrs: response.total_prs,
      openPrs: response.open_prs,
      mergedPrs: response.merged_prs,
      closedPrs: response.closed_prs,
      totalFiles: response.total_files,
      totalSecretsDetected: response.total_secrets_detected,
      totalUnsafePatterns: response.total_unsafe_patterns,
      firstPrAt: response.first_pr_at,
      lastPrAt: response.last_pr_at,
    };
  }

  /**
   * Export code governance data for compliance reporting.
   * Supports JSON format with optional date filtering.
   *
   * @param options - Export options
   * @returns Export response with PR records
   *
   * @example
   * ```typescript
   * // Export all data
   * const { records, count } = await axonflow.exportCodeGovernanceData();
   *
   * // Export with date filter
   * const { records } = await axonflow.exportCodeGovernanceData({
   *   startDate: '2024-01-01T00:00:00Z',
   *   endDate: '2024-12-31T23:59:59Z',
   *   state: 'merged'
   * });
   * ```
   */
  async exportCodeGovernanceData(options?: ExportOptions): Promise<ExportResponse> {
    const params = new URLSearchParams();
    params.set('format', 'json');

    if (options?.startDate) params.set('start_date', options.startDate);
    if (options?.endDate) params.set('end_date', options.endDate);
    if (options?.state) params.set('state', options.state);

    const query = params.toString();
    const path = `/api/v1/code-governance/export${query ? '?' + query : ''}`;

    if (this.config.debug) {
      debugLog('Exporting code governance data', { path });
    }

    const response = await this.portalRequest<{
      records: Array<{
        id: string;
        pr_number: number;
        pr_url: string;
        title: string;
        state: string;
        owner: string;
        repo: string;
        head_branch: string;
        base_branch: string;
        files_count: number;
        secrets_detected: number;
        unsafe_patterns: number;
        created_at: string;
        created_by?: string;
        provider_type?: string;
      }>;
      count: number;
      exported_at: string;
    }>('GET', path);

    return {
      records: (response.records || []).map(r => ({
        id: r.id,
        prNumber: r.pr_number,
        prUrl: r.pr_url,
        title: r.title,
        state: r.state,
        owner: r.owner,
        repo: r.repo,
        headBranch: r.head_branch,
        baseBranch: r.base_branch,
        filesCount: r.files_count,
        secretsDetected: r.secrets_detected,
        unsafePatterns: r.unsafe_patterns,
        createdAt: r.created_at,
        createdBy: r.created_by,
        providerType: r.provider_type,
      })),
      count: response.count,
      exportedAt: response.exported_at,
    };
  }

  /**
   * Export code governance data as CSV.
   *
   * Returns raw CSV data suitable for saving to file or streaming.
   *
   * @param options - Export options (date filters, state filter)
   * @returns Raw CSV data
   *
   * @example
   * ```typescript
   * const csvData = await axonflow.exportCodeGovernanceDataCSV();
   * fs.writeFileSync('pr-audit.csv', csvData);
   * ```
   */
  async exportCodeGovernanceDataCSV(options?: ExportOptions): Promise<string> {
    const params = new URLSearchParams();
    params.set('format', 'csv');

    if (options?.startDate) params.set('start_date', options.startDate);
    if (options?.endDate) params.set('end_date', options.endDate);
    if (options?.state) params.set('state', options.state);

    const query = params.toString();
    const path = `/api/v1/code-governance/export${query ? '?' + query : ''}`;

    if (this.config.debug) {
      debugLog('Exporting code governance data as CSV', { path });
    }

    return this.portalRequestText('GET', path);
  }

  // ============================================================================
  // Execution Replay Methods
  // ============================================================================

  /**
   * Get the endpoint URL for API requests.
   * All routes now go through the single Agent endpoint (ADR-026).
   */
  private getEndpointUrl(): string {
    return this.config.endpoint;
  }

  /**
   * Generic HTTP request helper for APIs (routes through single endpoint per ADR-026)
   */
  private async orchestratorRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.endpoint}${path}`;
    const headers = this.buildAuthHeaders();

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Request failed: ${errorText}`);
      }
      if (response.status === 404) {
        throw new APIError(404, 'Not Found', errorText);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Note: getPortalUrl() was removed in v2.0.0 (ADR-026 Single Entry Point).
  // All routes now go through the single Agent endpoint (this.config.endpoint).

  /**
   * Generic HTTP request helper for Customer Portal APIs (enterprise features).
   * Routes through single endpoint per ADR-026.
   * Requires prior authentication via loginToPortal().
   */
  private async portalRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.sessionCookie) {
      throw new AuthenticationError(
        'Not logged in to Customer Portal. Call loginToPortal() first.'
      );
    }

    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Cookie: `axonflow_session=${this.sessionCookie}`,
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    if (this.config.debug) {
      debugLog('Portal request', { method, path });
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Request failed: ${errorText}`);
      }
      if (response.status === 404) {
        throw new APIError(404, 'Not Found', errorText);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    // Handle 204 No Content responses
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * List workflow executions with optional filtering and pagination.
   *
   * @param options - Filtering and pagination options
   * @returns Paginated list of execution summaries
   *
   * @example
   * ```typescript
   * // List completed executions
   * const { executions, total } = await axonflow.listExecutions({
   *   status: 'completed',
   *   limit: 10
   * });
   *
   * for (const exec of executions) {
   *   console.log(`${exec.requestId}: ${exec.status} (${exec.totalSteps} steps)`);
   * }
   * ```
   */
  async listExecutions(options?: ListExecutionsOptions): Promise<ListExecutionsResponse> {
    const params = new URLSearchParams();

    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.status) params.set('status', options.status);
    if (options?.workflowId) params.set('workflow_id', options.workflowId);
    if (options?.startTime) params.set('start_time', options.startTime);
    if (options?.endTime) params.set('end_time', options.endTime);

    const queryString = params.toString();
    const path = `/api/v1/executions${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Listing executions', { options });
    }

    const response = await this.orchestratorRequest<{
      executions: Array<{
        request_id: string;
        workflow_name: string;
        status: string;
        total_steps: number;
        completed_steps: number;
        started_at: string;
        completed_at?: string;
        duration_ms?: number;
        total_tokens: number;
        total_cost_usd: number;
        org_id?: string;
        tenant_id?: string;
        user_id?: string;
        error_message?: string;
        input_summary?: unknown;
        output_summary?: unknown;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>('GET', path);

    return {
      executions: (response.executions || []).map(e => ({
        requestId: e.request_id,
        workflowName: e.workflow_name,
        status: e.status,
        totalSteps: e.total_steps,
        completedSteps: e.completed_steps,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        durationMs: e.duration_ms,
        totalTokens: e.total_tokens,
        totalCostUsd: e.total_cost_usd,
        orgId: e.org_id,
        tenantId: e.tenant_id,
        userId: e.user_id,
        errorMessage: e.error_message,
        inputSummary: e.input_summary,
        outputSummary: e.output_summary,
      })),
      total: response.total,
      limit: response.limit,
      offset: response.offset,
    };
  }

  /**
   * Get a complete execution record including summary and all steps.
   *
   * @param executionId - Execution ID (request_id)
   * @returns Full execution details with all step snapshots
   *
   * @example
   * ```typescript
   * const execution = await axonflow.getExecution('exec-abc123');
   * console.log(`Execution: ${execution.summary.requestId} - ${execution.summary.status}`);
   *
   * for (const step of execution.steps) {
   *   console.log(`  Step ${step.stepIndex}: ${step.stepName} (${step.durationMs}ms)`);
   * }
   * ```
   */
  async getExecution(executionId: string): Promise<ExecutionDetail> {
    if (this.config.debug) {
      debugLog('Getting execution', { executionId });
    }

    const response = await this.orchestratorRequest<{
      summary: {
        request_id: string;
        workflow_name: string;
        status: string;
        total_steps: number;
        completed_steps: number;
        started_at: string;
        completed_at?: string;
        duration_ms?: number;
        total_tokens: number;
        total_cost_usd: number;
        org_id?: string;
        tenant_id?: string;
        user_id?: string;
        error_message?: string;
        input_summary?: unknown;
        output_summary?: unknown;
      };
      steps: Array<{
        request_id: string;
        step_index: number;
        step_name: string;
        status: string;
        started_at: string;
        completed_at?: string;
        duration_ms?: number;
        provider?: string;
        model?: string;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
        input?: unknown;
        output?: unknown;
        error_message?: string;
        policies_checked?: string[];
        policies_triggered?: string[];
        approval_required?: boolean;
        approved_by?: string;
        approved_at?: string;
      }>;
    }>('GET', `/api/v1/executions/${executionId}`);

    return {
      summary: {
        requestId: response.summary.request_id,
        workflowName: response.summary.workflow_name,
        status: response.summary.status,
        totalSteps: response.summary.total_steps,
        completedSteps: response.summary.completed_steps,
        startedAt: response.summary.started_at,
        completedAt: response.summary.completed_at,
        durationMs: response.summary.duration_ms,
        totalTokens: response.summary.total_tokens,
        totalCostUsd: response.summary.total_cost_usd,
        orgId: response.summary.org_id,
        tenantId: response.summary.tenant_id,
        userId: response.summary.user_id,
        errorMessage: response.summary.error_message,
        inputSummary: response.summary.input_summary,
        outputSummary: response.summary.output_summary,
      },
      steps: response.steps.map(s => ({
        requestId: s.request_id,
        stepIndex: s.step_index,
        stepName: s.step_name,
        status: s.status,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        durationMs: s.duration_ms,
        provider: s.provider,
        model: s.model,
        tokensIn: s.tokens_in,
        tokensOut: s.tokens_out,
        costUsd: s.cost_usd,
        input: s.input,
        output: s.output,
        errorMessage: s.error_message,
        policiesChecked: s.policies_checked,
        policiesTriggered: s.policies_triggered,
        approvalRequired: s.approval_required,
        approvedBy: s.approved_by,
        approvedAt: s.approved_at,
      })),
    };
  }

  /**
   * Get all step snapshots for an execution.
   *
   * @param executionId - Execution ID (request_id)
   * @returns Array of step snapshots
   *
   * @example
   * ```typescript
   * const steps = await axonflow.getExecutionSteps('exec-abc123');
   * for (const step of steps) {
   *   console.log(`Step ${step.stepIndex}: ${step.stepName} - ${step.status}`);
   * }
   * ```
   */
  async getExecutionSteps(executionId: string): Promise<ExecutionSnapshot[]> {
    if (this.config.debug) {
      debugLog('Getting execution steps', { executionId });
    }

    const response = await this.orchestratorRequest<
      Array<{
        request_id: string;
        step_index: number;
        step_name: string;
        status: string;
        started_at: string;
        completed_at?: string;
        duration_ms?: number;
        provider?: string;
        model?: string;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
        input?: unknown;
        output?: unknown;
        error_message?: string;
        policies_checked?: string[];
        policies_triggered?: string[];
        approval_required?: boolean;
        approved_by?: string;
        approved_at?: string;
      }>
    >('GET', `/api/v1/executions/${executionId}/steps`);

    return response.map(s => ({
      requestId: s.request_id,
      stepIndex: s.step_index,
      stepName: s.step_name,
      status: s.status,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      durationMs: s.duration_ms,
      provider: s.provider,
      model: s.model,
      tokensIn: s.tokens_in,
      tokensOut: s.tokens_out,
      costUsd: s.cost_usd,
      input: s.input,
      output: s.output,
      errorMessage: s.error_message,
      policiesChecked: s.policies_checked,
      policiesTriggered: s.policies_triggered,
      approvalRequired: s.approval_required,
      approvedBy: s.approved_by,
      approvedAt: s.approved_at,
    }));
  }

  /**
   * Get a timeline view of execution events for visualization.
   *
   * @param executionId - Execution ID (request_id)
   * @returns Array of timeline entries
   *
   * @example
   * ```typescript
   * const timeline = await axonflow.getExecutionTimeline('exec-abc123');
   * for (const entry of timeline) {
   *   let info = `[${entry.stepIndex}] ${entry.stepName}: ${entry.status}`;
   *   if (entry.hasError) info += ' [ERROR]';
   *   if (entry.hasApproval) info += ' [APPROVED]';
   *   console.log(info);
   * }
   * ```
   */
  async getExecutionTimeline(executionId: string): Promise<TimelineEntry[]> {
    if (this.config.debug) {
      debugLog('Getting execution timeline', { executionId });
    }

    const response = await this.orchestratorRequest<
      Array<{
        step_index: number;
        step_name: string;
        status: string;
        started_at: string;
        completed_at?: string;
        duration_ms?: number;
        has_error: boolean;
        has_approval: boolean;
      }>
    >('GET', `/api/v1/executions/${executionId}/timeline`);

    return response.map(t => ({
      stepIndex: t.step_index,
      stepName: t.step_name,
      status: t.status,
      startedAt: t.started_at,
      completedAt: t.completed_at,
      durationMs: t.duration_ms,
      hasError: t.has_error,
      hasApproval: t.has_approval,
    }));
  }

  /**
   * Export a complete execution record for compliance or archival.
   *
   * @param executionId - Execution ID (request_id)
   * @param options - Export options
   * @returns Execution data in requested format
   *
   * @example
   * ```typescript
   * const exportData = await axonflow.exportExecution('exec-abc123', {
   *   includeInput: true,
   *   includeOutput: true
   * });
   *
   * // Save to file for audit
   * fs.writeFileSync('audit-export.json', JSON.stringify(exportData, null, 2));
   * ```
   */
  async exportExecution(
    executionId: string,
    options?: ExecutionExportOptions
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();

    if (options?.format) params.set('format', options.format);
    if (options?.includeInput) params.set('include_input', 'true');
    if (options?.includeOutput) params.set('include_output', 'true');
    if (options?.includePolicies) params.set('include_policies', 'true');

    const queryString = params.toString();
    const path = `/api/v1/executions/${executionId}/export${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Exporting execution', { executionId, options });
    }

    return this.orchestratorRequest<Record<string, unknown>>('GET', path);
  }

  /**
   * Delete an execution and all associated step snapshots.
   *
   * @param executionId - Execution ID (request_id)
   *
   * @example
   * ```typescript
   * await axonflow.deleteExecution('exec-abc123');
   * console.log('Execution deleted');
   * ```
   */
  async deleteExecution(executionId: string): Promise<void> {
    if (this.config.debug) {
      debugLog('Deleting execution', { executionId });
    }

    await this.orchestratorRequest<void>('DELETE', `/api/v1/executions/${executionId}`);
  }

  // ========================================
  // COST CONTROLS - BUDGETS
  // ========================================

  /**
   * Create a new budget.
   *
   * @param request - Budget creation request
   * @returns Created budget
   */
  async createBudget(request: CreateBudgetRequest): Promise<Budget> {
    const body = {
      id: request.id,
      name: request.name,
      scope: request.scope,
      limit_usd: request.limitUsd,
      period: request.period,
      on_exceed: request.onExceed,
      alert_thresholds: request.alertThresholds,
      scope_id: request.scopeId,
    };

    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'POST',
      '/api/v1/budgets',
      body
    );
    return this.mapBudgetResponse(response);
  }

  /**
   * Get a budget by ID.
   *
   * @param budgetId - Budget ID
   * @returns Budget
   */
  async getBudget(budgetId: string): Promise<Budget> {
    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'GET',
      `/api/v1/budgets/${budgetId}`
    );
    return this.mapBudgetResponse(response);
  }

  /**
   * List all budgets.
   *
   * @param options - Filtering and pagination options
   * @returns List of budgets
   */
  async listBudgets(options?: ListBudgetsOptions): Promise<BudgetsResponse> {
    const params = new URLSearchParams();

    if (options?.scope) params.set('scope', options.scope);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const queryString = params.toString();
    const path = `/api/v1/budgets${queryString ? `?${queryString}` : ''}`;

    const response = await this.orchestratorRequest<Record<string, unknown>>('GET', path);
    return {
      budgets: ((response.budgets as Record<string, unknown>[]) || []).map(b =>
        this.mapBudgetResponse(b)
      ),
      total: (response.total as number) || 0,
    };
  }

  /**
   * Update an existing budget.
   *
   * @param budgetId - Budget ID
   * @param request - Update request
   * @returns Updated budget
   */
  async updateBudget(budgetId: string, request: UpdateBudgetRequest): Promise<Budget> {
    const body: Record<string, unknown> = {};
    if (request.name !== undefined) body.name = request.name;
    if (request.limitUsd !== undefined) body.limit_usd = request.limitUsd;
    if (request.onExceed !== undefined) body.on_exceed = request.onExceed;
    if (request.alertThresholds !== undefined) body.alert_thresholds = request.alertThresholds;

    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'PUT',
      `/api/v1/budgets/${budgetId}`,
      body
    );
    return this.mapBudgetResponse(response);
  }

  /**
   * Delete a budget.
   *
   * @param budgetId - Budget ID
   */
  async deleteBudget(budgetId: string): Promise<void> {
    await this.orchestratorRequest<void>('DELETE', `/api/v1/budgets/${budgetId}`);
  }

  // ========================================
  // COST CONTROLS - BUDGET STATUS & ALERTS
  // ========================================

  /**
   * Get the current status of a budget.
   *
   * @param budgetId - Budget ID
   * @returns Budget status
   */
  async getBudgetStatus(budgetId: string): Promise<BudgetStatus> {
    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'GET',
      `/api/v1/budgets/${budgetId}/status`
    );
    return {
      budget: this.mapBudgetResponse(response.budget as Record<string, unknown>),
      usedUsd: (response.used_usd as number) || 0,
      remainingUsd: (response.remaining_usd as number) || 0,
      percentage: (response.percentage as number) || 0,
      isExceeded: (response.is_exceeded as boolean) || false,
      isBlocked: (response.is_blocked as boolean) || false,
      periodStart: (response.period_start as string) || '',
      periodEnd: (response.period_end as string) || '',
    };
  }

  /**
   * Get alerts for a budget.
   *
   * @param budgetId - Budget ID
   * @returns Budget alerts
   */
  async getBudgetAlerts(budgetId: string): Promise<BudgetAlertsResponse> {
    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'GET',
      `/api/v1/budgets/${budgetId}/alerts`
    );
    const alerts = ((response.alerts as Record<string, unknown>[]) || []).map(
      (a): BudgetAlert => ({
        id: (a.id as string) || '',
        budgetId: (a.budget_id as string) || '',
        alertType: (a.alert_type as string) || '',
        threshold: (a.threshold as number) || 0,
        percentageReached: (a.percentage_reached as number) || 0,
        amountUsd: (a.amount_usd as number) || 0,
        message: (a.message as string) || '',
        createdAt: (a.created_at as string) || '',
      })
    );
    return {
      alerts,
      count: (response.count as number) || 0,
    };
  }

  /**
   * Perform a pre-flight budget check.
   *
   * @param request - Check request
   * @returns Budget decision
   */
  async checkBudget(request: BudgetCheckRequest): Promise<BudgetDecision> {
    const body: Record<string, unknown> = {};
    if (request.orgId) body.org_id = request.orgId;
    if (request.teamId) body.team_id = request.teamId;
    if (request.agentId) body.agent_id = request.agentId;
    if (request.workflowId) body.workflow_id = request.workflowId;
    if (request.userId) body.user_id = request.userId;

    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'POST',
      '/api/v1/budgets/check',
      body
    );
    return {
      allowed: (response.allowed as boolean) || false,
      action: response.action as string | undefined,
      message: response.message as string | undefined,
      budgets: response.budgets
        ? ((response.budgets as Record<string, unknown>[]) || []).map(b =>
            this.mapBudgetResponse(b)
          )
        : undefined,
    };
  }

  // ========================================
  // COST CONTROLS - USAGE
  // ========================================

  /**
   * Get usage summary for a period.
   *
   * @param period - Period (daily, weekly, monthly, quarterly, yearly)
   * @returns Usage summary
   */
  async getUsageSummary(period?: string): Promise<UsageSummary> {
    const path = period ? `/api/v1/usage?period=${period}` : '/api/v1/usage';
    const response = await this.orchestratorRequest<Record<string, unknown>>('GET', path);
    return {
      totalCostUsd: (response.total_cost_usd as number) || 0,
      totalRequests: (response.total_requests as number) || 0,
      totalTokensIn: (response.total_tokens_in as number) || 0,
      totalTokensOut: (response.total_tokens_out as number) || 0,
      averageCostPerRequest: (response.average_cost_per_request as number) || 0,
      period: (response.period as string) || '',
      periodStart: (response.period_start as string) || '',
      periodEnd: (response.period_end as string) || '',
    };
  }

  /**
   * Get usage breakdown by a grouping dimension.
   *
   * @param groupBy - Dimension to group by (provider, model, agent, team, workflow)
   * @param period - Period (daily, weekly, monthly, quarterly, yearly)
   * @returns Usage breakdown
   */
  async getUsageBreakdown(groupBy: string, period?: string): Promise<UsageBreakdown> {
    const params = new URLSearchParams();
    params.set('group_by', groupBy);
    if (period) params.set('period', period);

    const response = await this.orchestratorRequest<Record<string, unknown>>(
      'GET',
      `/api/v1/usage/breakdown?${params.toString()}`
    );
    const items = ((response.items as Record<string, unknown>[]) || []).map(
      (i): UsageBreakdownItem => ({
        groupValue: (i.group_value as string) || '',
        costUsd: (i.cost_usd as number) || 0,
        percentage: (i.percentage as number) || 0,
        requestCount: (i.request_count as number) || 0,
        tokensIn: (i.tokens_in as number) || 0,
        tokensOut: (i.tokens_out as number) || 0,
      })
    );
    return {
      groupBy: (response.group_by as string) || '',
      totalCostUsd: (response.total_cost_usd as number) || 0,
      items,
      period: (response.period as string) || '',
      periodStart: (response.period_start as string) || '',
      periodEnd: (response.period_end as string) || '',
    };
  }

  /**
   * List usage records.
   *
   * @param options - Filtering and pagination options
   * @returns List of usage records
   */
  async listUsageRecords(options?: ListUsageRecordsOptions): Promise<UsageRecordsResponse> {
    const params = new URLSearchParams();

    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.provider) params.set('provider', options.provider);
    if (options?.model) params.set('model', options.model);

    const queryString = params.toString();
    const path = `/api/v1/usage/records${queryString ? `?${queryString}` : ''}`;

    const response = await this.orchestratorRequest<Record<string, unknown>>('GET', path);
    const records = ((response.records as Record<string, unknown>[]) || []).map(
      (r): UsageRecord => ({
        id: (r.id as string) || '',
        provider: (r.provider as string) || '',
        model: (r.model as string) || '',
        tokensIn: (r.tokens_in as number) || 0,
        tokensOut: (r.tokens_out as number) || 0,
        costUsd: (r.cost_usd as number) || 0,
        requestId: r.request_id as string | undefined,
        orgId: r.org_id as string | undefined,
        agentId: r.agent_id as string | undefined,
        timestamp: r.timestamp as string | undefined,
      })
    );
    return {
      records,
      total: (response.total as number) || 0,
    };
  }

  // ========================================
  // COST CONTROLS - PRICING
  // ========================================

  /**
   * Get pricing information for models.
   *
   * @param provider - Filter by provider (optional)
   * @param model - Filter by model (optional)
   * @returns Pricing information
   */
  async getPricing(provider?: string, model?: string): Promise<PricingListResponse> {
    const params = new URLSearchParams();
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);

    const queryString = params.toString();
    const path = `/api/v1/pricing${queryString ? `?${queryString}` : ''}`;

    const response = await this.orchestratorRequest<Record<string, unknown>>('GET', path);

    // Handle single object vs array response
    if ((response as Record<string, unknown>).provider !== undefined) {
      // Single object response - wrap in list
      const pricing = this.mapPricingResponse(response);
      return { pricing: [pricing] };
    }

    const pricingList = ((response.pricing as Record<string, unknown>[]) || []).map(p =>
      this.mapPricingResponse(p)
    );
    return { pricing: pricingList };
  }

  // ========================================
  // COST CONTROLS - HELPER METHODS
  // ========================================

  private mapBudgetResponse(response: Record<string, unknown>): Budget {
    return {
      id: (response.id as string) || '',
      name: (response.name as string) || '',
      scope: (response.scope as string) || '',
      limitUsd: (response.limit_usd as number) || 0,
      period: (response.period as string) || '',
      onExceed: (response.on_exceed as string) || '',
      alertThresholds: (response.alert_thresholds as number[]) || [],
      enabled: (response.enabled as boolean) ?? true,
      scopeId: response.scope_id as string | undefined,
      createdAt: response.created_at as string | undefined,
      updatedAt: response.updated_at as string | undefined,
    };
  }

  private mapPricingResponse(response: Record<string, unknown>): PricingInfo {
    const pricingData = response.pricing as Record<string, unknown> | undefined;
    return {
      provider: (response.provider as string) || '',
      model: (response.model as string) || '',
      pricing: {
        inputPer1k: (pricingData?.input_per_1k as number) || 0,
        outputPer1k: (pricingData?.output_per_1k as number) || 0,
      },
    };
  }

  /**
   * Generic HTTP request helper for Customer Portal APIs that returns raw text.
   * Used for CSV exports and other non-JSON responses.
   * Requires prior authentication via loginToPortal().
   */
  private async portalRequestText(method: string, path: string): Promise<string> {
    if (!this.sessionCookie) {
      throw new AuthenticationError(
        'Not logged in to Customer Portal. Call loginToPortal() first.'
      );
    }

    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      Cookie: `axonflow_session=${this.sessionCookie}`,
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.config.timeout),
    };

    if (this.config.debug) {
      debugLog('Portal request (text)', { method, path });
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Request failed: ${errorText}`);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    return response.text();
  }

  // =============================================================================
  // Workflow Control Plane (Issue #834)
  // =============================================================================

  /**
   * Create a new workflow for governance tracking.
   *
   * Call this at the start of your external orchestrator workflow (LangChain, LangGraph, CrewAI, etc.)
   * to register it with AxonFlow for governance tracking.
   *
   * @example
   * ```typescript
   * const workflow = await client.createWorkflow({
   *   workflow_name: 'customer-support-agent',
   *   source: 'langgraph',
   *   metadata: { customer_id: 'cust-123' }
   * });
   * console.log(`Workflow created: ${workflow.workflow_id}`);
   * ```
   */
  async createWorkflow(request: CreateWorkflowRequest): Promise<CreateWorkflowResponse> {
    const response = await this.orchestratorRequest<CreateWorkflowResponse>(
      'POST',
      '/api/v1/workflows',
      request
    );
    return response;
  }

  /**
   * Get the status of a workflow.
   *
   * @example
   * ```typescript
   * const status = await client.getWorkflow('wf_123');
   * console.log(`Status: ${status.status}, Step: ${status.current_step_index}`);
   * ```
   */
  async getWorkflow(workflowId: string): Promise<WorkflowStatusResponse> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }

    const response = await this.orchestratorRequest<WorkflowStatusResponse>(
      'GET',
      `/api/v1/workflows/${workflowId}`
    );
    return response;
  }

  /**
   * Check if a workflow step is allowed to proceed (step gate).
   *
   * This is the core governance method. Call this before executing each step
   * in your workflow to check if the step is allowed based on policies.
   *
   * @example
   * ```typescript
   * const gate = await client.stepGate('wf_123', 'step-generate-code', {
   *   step_name: 'Generate Code',
   *   step_type: 'llm_call',
   *   model: 'gpt-4',
   *   provider: 'openai',
   *   step_input: { prompt: 'Generate a hello world function' }
   * });
   *
   * if (gate.decision === 'block') {
   *   throw new Error(`Step blocked: ${gate.reason}`);
   * }
   * if (gate.decision === 'require_approval') {
   *   console.log(`Approval required: ${gate.approval_url}`);
   *   return;
   * }
   * // Step is allowed, proceed with execution
   * ```
   */
  async stepGate(
    workflowId: string,
    stepId: string,
    request: StepGateRequest
  ): Promise<StepGateResponse> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }
    if (!stepId) {
      throw new ConfigurationError('Step ID is required');
    }

    const response = await this.orchestratorRequest<StepGateResponse>(
      'POST',
      `/api/v1/workflows/${workflowId}/steps/${stepId}/gate`,
      request
    );
    return response;
  }

  /**
   * Complete a workflow successfully.
   *
   * Call this when your workflow has completed all steps successfully.
   *
   * @example
   * ```typescript
   * await client.completeWorkflow('wf_123');
   * ```
   */
  async completeWorkflow(workflowId: string): Promise<void> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }

    await this.orchestratorRequest('POST', `/api/v1/workflows/${workflowId}/complete`, {});
  }

  /**
   * Abort a workflow.
   *
   * Call this when you need to stop a workflow due to an error or user request.
   *
   * @example
   * ```typescript
   * await client.abortWorkflow('wf_123', 'User cancelled the operation');
   * ```
   */
  async abortWorkflow(workflowId: string, reason?: string): Promise<void> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }

    const request: AbortWorkflowRequest = reason ? { reason } : {};
    await this.orchestratorRequest('POST', `/api/v1/workflows/${workflowId}/abort`, request);
  }

  /**
   * Fail a workflow.
   *
   * Call this when a workflow has encountered an unrecoverable error and should
   * be marked as failed. Unlike abort (which is user-initiated), fail indicates
   * the workflow could not complete due to an error condition.
   *
   * @example
   * ```typescript
   * await client.failWorkflow('wf_123', 'Step 3 exceeded retry limit');
   * ```
   */
  async failWorkflow(workflowId: string, reason?: string): Promise<void> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }

    const request: FailWorkflowRequest = reason ? { reason } : {};
    await this.orchestratorRequest('POST', `/api/v1/workflows/${workflowId}/fail`, request);
  }

  /**
   * Mark a workflow step as completed.
   *
   * Call this after a step has been executed successfully.
   *
   * @example
   * ```typescript
   * await client.markStepCompleted('wf_123', 'step-1', {
   *   output: { result: 'success' }
   * });
   * ```
   */
  async markStepCompleted(
    workflowId: string,
    stepId: string,
    request?: MarkStepCompletedRequest
  ): Promise<void> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }
    if (!stepId) {
      throw new ConfigurationError('Step ID is required');
    }

    await this.orchestratorRequest(
      'POST',
      `/api/v1/workflows/${workflowId}/steps/${stepId}/complete`,
      request || {}
    );
  }

  /**
   * Resume a workflow after approval.
   *
   * Call this after a step has been approved to continue the workflow.
   *
   * @example
   * ```typescript
   * // After approval received via webhook or polling
   * await client.resumeWorkflow('wf_123');
   * ```
   */
  async resumeWorkflow(workflowId: string): Promise<void> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }

    await this.orchestratorRequest('POST', `/api/v1/workflows/${workflowId}/resume`, {});
  }

  /**
   * List workflows with optional filters.
   *
   * @example
   * ```typescript
   * const result = await client.listWorkflows({
   *   status: 'in_progress',
   *   source: 'langgraph',
   *   limit: 10
   * });
   * console.log(`Found ${result.total} workflows`);
   * ```
   */
  async listWorkflows(options?: ListWorkflowsOptions): Promise<ListWorkflowsResponse> {
    const params = new URLSearchParams();

    if (options?.status) {
      params.set('status', options.status);
    }
    if (options?.source) {
      params.set('source', options.source);
    }
    if (options?.limit !== undefined) {
      params.set('limit', options.limit.toString());
    }
    if (options?.offset !== undefined) {
      params.set('offset', options.offset.toString());
    }
    if (options?.trace_id) {
      params.set('trace_id', options.trace_id);
    }

    const queryString = params.toString();
    const path = queryString ? `/api/v1/workflows?${queryString}` : '/api/v1/workflows';

    const response = await this.orchestratorRequest<ListWorkflowsResponse>('GET', path);
    return response;
  }

  // =============================================================================
  // WCP Approval Methods (Feature 5)
  // =============================================================================

  /**
   * Approve a workflow step that requires human approval.
   *
   * Call this to approve a step that was gated with a 'require_approval' decision.
   *
   * @param workflowId - ID of the workflow
   * @param stepId - ID of the step to approve
   * @returns Approval response with status
   *
   * @example
   * ```typescript
   * const result = await client.approveStep('wf_123', 'step_456');
   * console.log(`Step ${result.step_id} status: ${result.status}`);
   * ```
   */
  async approveStep(workflowId: string, stepId: string): Promise<ApproveStepResponse> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }
    if (!stepId) {
      throw new ConfigurationError('Step ID is required');
    }

    return this.orchestratorRequest<ApproveStepResponse>(
      'POST',
      `/api/v1/workflow-control/${workflowId}/steps/${stepId}/approve`,
      {}
    );
  }

  /**
   * Reject a workflow step that requires human approval.
   *
   * Call this to reject a step that was gated with a 'require_approval' decision.
   *
   * @param workflowId - ID of the workflow
   * @param stepId - ID of the step to reject
   * @param reason - Optional reason for rejection
   * @returns Rejection response with status
   *
   * @example
   * ```typescript
   * const result = await client.rejectStep('wf_123', 'step_456', 'Policy violation detected');
   * console.log(`Step ${result.step_id} status: ${result.status}`);
   * ```
   */
  async rejectStep(
    workflowId: string,
    stepId: string,
    reason?: string
  ): Promise<RejectStepResponse> {
    if (!workflowId) {
      throw new ConfigurationError('Workflow ID is required');
    }
    if (!stepId) {
      throw new ConfigurationError('Step ID is required');
    }

    const body: Record<string, unknown> = {};
    if (reason) {
      body.reason = reason;
    }

    return this.orchestratorRequest<RejectStepResponse>(
      'POST',
      `/api/v1/workflow-control/${workflowId}/steps/${stepId}/reject`,
      body
    );
  }

  /**
   * Get pending approvals for workflow steps.
   *
   * Lists all steps that are waiting for human approval across all workflows.
   *
   * @param options - Optional filtering options
   * @returns List of pending approvals with total count
   *
   * @example
   * ```typescript
   * const pending = await client.getPendingApprovals({ limit: 10 });
   * console.log(`${pending.total} approvals pending`);
   * for (const approval of pending.approvals) {
   *   console.log(`${approval.workflow_name} / ${approval.step_name}`);
   * }
   * ```
   */
  async getPendingApprovals(options?: PendingApprovalsOptions): Promise<PendingApprovalsResponse> {
    const params = new URLSearchParams();

    if (options?.limit !== undefined) {
      params.set('limit', options.limit.toString());
    }

    const queryString = params.toString();
    const path = queryString
      ? `/api/v1/workflow-control/pending-approvals?${queryString}`
      : '/api/v1/workflow-control/pending-approvals';

    return this.orchestratorRequest<PendingApprovalsResponse>('GET', path);
  }

  // =============================================================================
  // Plan Rollback (Feature 7)
  // =============================================================================

  /**
   * Rollback a plan to a previous version.
   *
   * @param planId - ID of the plan to rollback
   * @param targetVersion - Version number to rollback to
   * @returns Rollback response with version information
   *
   * @example
   * ```typescript
   * const result = await client.rollbackPlan('plan_123', 2);
   * console.log(`Rolled back to v${result.version} from v${result.previousVersion}`);
   * ```
   */
  async rollbackPlan(planId: string, targetVersion: number): Promise<RollbackPlanResponse> {
    const url = `${this.config.endpoint}/api/v1/plan/${planId}/rollback/${targetVersion}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new PlanExecutionError(
        `Plan rollback failed: ${response.status} ${response.statusText} - ${errorText}`,
        planId,
        'rollback'
      );
    }

    const data = await response.json();

    if (this.config.debug) {
      debugLog('Plan rolled back', { planId, version: data.version });
    }

    return {
      planId: data.plan_id || planId,
      version: data.version,
      previousVersion: data.previous_version,
      status: data.status,
    };
  }

  // =============================================================================
  // Webhook CRUD Methods (Feature 7)
  // =============================================================================

  /**
   * Create a webhook subscription.
   *
   * @param request - Webhook configuration
   * @returns Created webhook subscription
   *
   * @example
   * ```typescript
   * const webhook = await client.createWebhook({
   *   url: 'https://example.com/webhook',
   *   events: ['workflow.completed', 'step.approval_required'],
   *   active: true
   * });
   * console.log(`Webhook created: ${webhook.id}`);
   * ```
   */
  async createWebhook(request: CreateWebhookRequest): Promise<WebhookSubscription> {
    return this.orchestratorRequest<WebhookSubscription>('POST', '/api/v1/webhooks', request);
  }

  /**
   * Get a webhook subscription by ID.
   *
   * @param webhookId - ID of the webhook to retrieve
   * @returns Webhook subscription details
   *
   * @example
   * ```typescript
   * const webhook = await client.getWebhook('wh_123');
   * console.log(`Webhook URL: ${webhook.url}, Active: ${webhook.active}`);
   * ```
   */
  async getWebhook(webhookId: string): Promise<WebhookSubscription> {
    if (!webhookId) {
      throw new ConfigurationError('Webhook ID is required');
    }

    return this.orchestratorRequest<WebhookSubscription>('GET', `/api/v1/webhooks/${webhookId}`);
  }

  /**
   * Update a webhook subscription.
   *
   * @param webhookId - ID of the webhook to update
   * @param request - Fields to update
   * @returns Updated webhook subscription
   *
   * @example
   * ```typescript
   * const webhook = await client.updateWebhook('wh_123', {
   *   events: ['workflow.completed'],
   *   active: false
   * });
   * ```
   */
  async updateWebhook(
    webhookId: string,
    request: UpdateWebhookRequest
  ): Promise<WebhookSubscription> {
    if (!webhookId) {
      throw new ConfigurationError('Webhook ID is required');
    }

    return this.orchestratorRequest<WebhookSubscription>(
      'PUT',
      `/api/v1/webhooks/${webhookId}`,
      request
    );
  }

  /**
   * Delete a webhook subscription.
   *
   * @param webhookId - ID of the webhook to delete
   *
   * @example
   * ```typescript
   * await client.deleteWebhook('wh_123');
   * ```
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    if (!webhookId) {
      throw new ConfigurationError('Webhook ID is required');
    }

    await this.orchestratorRequest('DELETE', `/api/v1/webhooks/${webhookId}`);
  }

  /**
   * List all webhook subscriptions.
   *
   * @returns List of webhook subscriptions with total count
   *
   * @example
   * ```typescript
   * const result = await client.listWebhooks();
   * console.log(`${result.total} webhooks configured`);
   * for (const wh of result.webhooks) {
   *   console.log(`${wh.id}: ${wh.url} (${wh.active ? 'active' : 'inactive'})`);
   * }
   * ```
   */
  async listWebhooks(): Promise<ListWebhooksResponse> {
    return this.orchestratorRequest<ListWebhooksResponse>('GET', '/api/v1/webhooks');
  }

  // ===========================================================================
  // MAS FEAT Compliance Methods (Enterprise)
  // ===========================================================================

  /**
   * MAS FEAT compliance module for Singapore regulatory compliance.
   *
   * Enterprise Feature: Requires AxonFlow Enterprise license.
   *
   * @example
   * ```typescript
   * // Register an AI system
   * const system = await axonflow.masfeat.registerSystem({
   *   systemId: 'credit-scoring-v1',
   *   systemName: 'Credit Scoring AI',
   *   useCase: 'credit_scoring',
   *   ownerTeam: 'Risk Management',
   *   customerImpact: 4,
   *   modelComplexity: 3,
   *   humanReliance: 5
   * });
   *
   * // Configure kill switch
   * const ks = await axonflow.masfeat.configureKillSwitch('credit-scoring-v1', {
   *   accuracyThreshold: 0.85,
   *   biasThreshold: 0.15,
   *   autoTriggerEnabled: true
   * });
   * ```
   */
  get masfeat() {
    return {
      // Registry methods
      registerSystem: this.masfeatRegisterSystem.bind(this),
      getSystem: this.masfeatGetSystem.bind(this),
      updateSystem: this.masfeatUpdateSystem.bind(this),
      listSystems: this.masfeatListSystems.bind(this),
      activateSystem: this.masfeatActivateSystem.bind(this),
      retireSystem: this.masfeatRetireSystem.bind(this),
      getRegistrySummary: this.masfeatGetRegistrySummary.bind(this),

      // Assessment methods
      createAssessment: this.masfeatCreateAssessment.bind(this),
      getAssessment: this.masfeatGetAssessment.bind(this),
      updateAssessment: this.masfeatUpdateAssessment.bind(this),
      listAssessments: this.masfeatListAssessments.bind(this),
      submitAssessment: this.masfeatSubmitAssessment.bind(this),
      approveAssessment: this.masfeatApproveAssessment.bind(this),
      rejectAssessment: this.masfeatRejectAssessment.bind(this),

      // Kill switch methods
      getKillSwitch: this.masfeatGetKillSwitch.bind(this),
      configureKillSwitch: this.masfeatConfigureKillSwitch.bind(this),
      checkKillSwitch: this.masfeatCheckKillSwitch.bind(this),
      triggerKillSwitch: this.masfeatTriggerKillSwitch.bind(this),
      restoreKillSwitch: this.masfeatRestoreKillSwitch.bind(this),
      enableKillSwitch: this.masfeatEnableKillSwitch.bind(this),
      disableKillSwitch: this.masfeatDisableKillSwitch.bind(this),
      getKillSwitchHistory: this.masfeatGetKillSwitchHistory.bind(this),
    };
  }

  // Registry Methods
  private async masfeatRegisterSystem(request: RegisterSystemRequest): Promise<AISystemRegistry> {
    const url = `${this.config.endpoint}/api/v1/masfeat/registry`;
    const body: Record<string, any> = {
      system_id: request.systemId,
      system_name: request.systemName,
      description: request.description,
      use_case: request.useCase,
      owner_team: request.ownerTeam,
      technical_owner: request.technicalOwner,
      owner_email: request.businessOwner,
      risk_rating_impact: request.customerImpact,
      risk_rating_complexity: request.modelComplexity,
      risk_rating_reliance: request.humanReliance,
      metadata: request.metadata,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapSystemResponse(await response.json());
  }

  private async masfeatGetSystem(systemId: string): Promise<AISystemRegistry> {
    const url = `${this.config.endpoint}/api/v1/masfeat/registry/${systemId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapSystemResponse(await response.json());
  }

  private async masfeatUpdateSystem(
    systemId: string,
    request: UpdateSystemRequest
  ): Promise<AISystemRegistry> {
    const url = `${this.config.endpoint}/api/v1/masfeat/registry/${systemId}`;

    const body: Record<string, any> = {};
    if (request.systemName !== undefined) body.system_name = request.systemName;
    if (request.description !== undefined) body.description = request.description;
    if (request.ownerTeam !== undefined) body.owner_team = request.ownerTeam;
    if (request.technicalOwner !== undefined) body.technical_owner = request.technicalOwner;
    if (request.businessOwner !== undefined) body.business_owner = request.businessOwner;
    if (request.customerImpact !== undefined) body.customer_impact = request.customerImpact;
    if (request.modelComplexity !== undefined) body.model_complexity = request.modelComplexity;
    if (request.humanReliance !== undefined) body.human_reliance = request.humanReliance;
    if (request.metadata !== undefined) body.metadata = request.metadata;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapSystemResponse(await response.json());
  }

  private async masfeatListSystems(options?: ListSystemsOptions): Promise<AISystemRegistry[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.useCase) params.append('use_case', options.useCase);
    if (options?.materialityClassification)
      params.append('materiality', options.materialityClassification);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${this.config.endpoint}/api/v1/masfeat/registry${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    const data = await response.json();
    return (data || []).map((s: any) => this.mapSystemResponse(s));
  }

  private async masfeatActivateSystem(systemId: string): Promise<AISystemRegistry> {
    // Use PUT to update status - the /activate endpoint doesn't exist
    const url = `${this.config.endpoint}/api/v1/masfeat/registry/${systemId}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ status: 'active' }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapSystemResponse(await response.json());
  }

  private async masfeatRetireSystem(systemId: string): Promise<AISystemRegistry> {
    const url = `${this.config.endpoint}/api/v1/masfeat/registry/${systemId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapSystemResponse(await response.json());
  }

  private async masfeatGetRegistrySummary(): Promise<RegistrySummary> {
    const url = `${this.config.endpoint}/api/v1/masfeat/registry/summary`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    const data = await response.json();
    return {
      totalSystems: data.total_systems,
      activeSystems: data.active_systems,
      highMaterialityCount: data.high_materiality_count ?? data.high_materiality ?? 0,
      mediumMaterialityCount: data.medium_materiality_count ?? data.medium_materiality ?? 0,
      lowMaterialityCount: data.low_materiality_count ?? data.low_materiality ?? 0,
      byUseCase: data.by_use_case || {},
      byStatus: data.by_status || {},
    };
  }

  // Assessment Methods
  private async masfeatCreateAssessment(request: CreateAssessmentRequest): Promise<FEATAssessment> {
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments`;
    const body: Record<string, any> = {
      system_id: request.systemId,
      assessment_type: request.assessmentType || 'periodic',
      assessors: request.assessors,
    };
    if (request.assessmentDate) body.assessment_date = request.assessmentDate.toISOString();
    if (request.fairnessScore !== undefined) body.fairness_score = request.fairnessScore;
    if (request.ethicsScore !== undefined) body.ethics_score = request.ethicsScore;
    if (request.accountabilityScore !== undefined)
      body.accountability_score = request.accountabilityScore;
    if (request.transparencyScore !== undefined)
      body.transparency_score = request.transparencyScore;
    if (request.fairnessDetails) body.fairness_details = request.fairnessDetails;
    if (request.ethicsDetails) body.ethics_details = request.ethicsDetails;
    if (request.accountabilityDetails) body.accountability_details = request.accountabilityDetails;
    if (request.transparencyDetails) body.transparency_details = request.transparencyDetails;
    if (request.recommendations) body.recommendations = request.recommendations;
    if (request.findings) {
      body.findings = request.findings.map(f => ({
        id: f.id,
        pillar: f.pillar,
        severity: f.severity,
        category: f.category,
        description: f.description,
        status: f.status,
        remediation: f.remediation,
        due_date: f.dueDate?.toISOString(),
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapAssessmentResponse(await response.json());
  }

  private async masfeatGetAssessment(assessmentId: string): Promise<FEATAssessment> {
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments/${assessmentId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapAssessmentResponse(await response.json());
  }

  private async masfeatUpdateAssessment(
    assessmentId: string,
    request: UpdateAssessmentRequest
  ): Promise<FEATAssessment> {
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments/${assessmentId}`;

    const body: Record<string, any> = {};
    if (request.fairnessScore !== undefined) body.fairness_score = request.fairnessScore;
    if (request.ethicsScore !== undefined) body.ethics_score = request.ethicsScore;
    if (request.accountabilityScore !== undefined)
      body.accountability_score = request.accountabilityScore;
    if (request.transparencyScore !== undefined)
      body.transparency_score = request.transparencyScore;
    if (request.fairnessDetails !== undefined) body.fairness_details = request.fairnessDetails;
    if (request.ethicsDetails !== undefined) body.ethics_details = request.ethicsDetails;
    if (request.accountabilityDetails !== undefined)
      body.accountability_details = request.accountabilityDetails;
    if (request.transparencyDetails !== undefined)
      body.transparency_details = request.transparencyDetails;
    if (request.findings !== undefined) {
      body.findings = request.findings.map(f => ({
        id: f.id,
        pillar: f.pillar,
        severity: f.severity,
        category: f.category,
        description: f.description,
        status: f.status,
        remediation: f.remediation,
        due_date: f.dueDate?.toISOString(),
      }));
    }
    if (request.recommendations !== undefined) body.recommendations = request.recommendations;
    if (request.assessors !== undefined) body.assessors = request.assessors;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapAssessmentResponse(await response.json());
  }

  private async masfeatListAssessments(
    options?: ListAssessmentsOptions
  ): Promise<FEATAssessment[]> {
    const params = new URLSearchParams();
    if (options?.systemId) params.append('system_id', options.systemId);
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    const data = await response.json();
    return (data || []).map((a: any) => this.mapAssessmentResponse(a));
  }

  private async masfeatSubmitAssessment(assessmentId: string): Promise<FEATAssessment> {
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments/${assessmentId}/submit`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapAssessmentResponse(await response.json());
  }

  private async masfeatApproveAssessment(
    assessmentId: string,
    request: ApproveAssessmentRequest
  ): Promise<FEATAssessment> {
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments/${assessmentId}/approve`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        approved_by: request.approvedBy,
        comments: request.comments,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapAssessmentResponse(await response.json());
  }

  private async masfeatRejectAssessment(
    assessmentId: string,
    request: RejectAssessmentRequest
  ): Promise<FEATAssessment> {
    const url = `${this.config.endpoint}/api/v1/masfeat/assessments/${assessmentId}/reject`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        rejected_by: request.rejectedBy,
        reason: request.reason,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapAssessmentResponse(await response.json());
  }

  // Kill Switch Methods
  private async masfeatGetKillSwitch(systemId: string): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatConfigureKillSwitch(
    systemId: string,
    request: ConfigureKillSwitchRequest
  ): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/configure`;

    const body: Record<string, any> = {};
    if (request.accuracyThreshold !== undefined)
      body.accuracy_threshold = request.accuracyThreshold;
    if (request.biasThreshold !== undefined) body.bias_threshold = request.biasThreshold;
    if (request.errorRateThreshold !== undefined)
      body.error_rate_threshold = request.errorRateThreshold;
    if (request.autoTriggerEnabled !== undefined)
      body.auto_trigger_enabled = request.autoTriggerEnabled;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatCheckKillSwitch(
    systemId: string,
    request: CheckKillSwitchRequest
  ): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/check`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        accuracy: request.accuracy,
        bias_score: request.biasScore,
        error_rate: request.errorRate,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatTriggerKillSwitch(
    systemId: string,
    request: TriggerKillSwitchRequest
  ): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/trigger`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        reason: request.reason,
        triggered_by: request.triggeredBy,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatRestoreKillSwitch(
    systemId: string,
    request: RestoreKillSwitchRequest
  ): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/restore`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        reason: request.reason,
        restored_by: request.restoredBy,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatEnableKillSwitch(systemId: string): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/enable`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatDisableKillSwitch(
    systemId: string,
    request?: DisableKillSwitchRequest
  ): Promise<KillSwitch> {
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/disable`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ reason: request?.reason }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    return this.mapKillSwitchResponse(await response.json());
  }

  private async masfeatGetKillSwitchHistory(
    systemId: string,
    limit?: number
  ): Promise<KillSwitchEvent[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());

    const queryString = params.toString();
    const url = `${this.config.endpoint}/api/v1/masfeat/killswitch/${systemId}/history${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, response.statusText, errorText);
    }

    let data = await response.json();
    // Handle nested response format {history: [...], count: N}
    if (data && typeof data === 'object' && 'history' in data) {
      data = data.history;
    }
    return (data || []).map((e: any) => ({
      id: e.id,
      killSwitchId: e.kill_switch_id,
      // Handle both API formats: event_type (SDK expected) vs action (API actual)
      eventType: e.event_type || e.action,
      // Build eventData from additional fields if not present
      eventData:
        e.event_data ||
        (e.previous_status || e.new_status || e.reason
          ? { previousStatus: e.previous_status, newStatus: e.new_status, reason: e.reason }
          : undefined),
      // Handle both API formats: created_by vs performed_by
      createdBy: e.created_by || e.performed_by,
      // Handle both API formats: created_at vs performed_at
      createdAt: new Date(e.created_at || e.performed_at),
    }));
  }

  // Helper methods for MAS FEAT
  private mapSystemResponse(data: any): AISystemRegistry {
    return {
      id: data.id,
      orgId: data.org_id,
      systemId: data.system_id,
      systemName: data.system_name,
      description: data.description,
      useCase: data.use_case,
      ownerTeam: data.owner_team,
      technicalOwner: data.technical_owner,
      businessOwner: data.business_owner || data.owner_email,
      customerImpact: data.customer_impact ?? data.risk_rating_impact,
      modelComplexity: data.model_complexity ?? data.risk_rating_complexity,
      humanReliance: data.human_reliance ?? data.risk_rating_reliance,
      materialityClassification: data.materiality_classification,
      status: data.status,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by,
    };
  }

  private mapFindingResponse(data: any): Finding {
    return {
      id: data.id,
      pillar: data.pillar,
      severity: data.severity,
      category: data.category,
      description: data.description,
      status: data.status,
      remediation: data.remediation,
      dueDate: data.due_date ? new Date(data.due_date) : undefined,
    };
  }

  private mapAssessmentResponse(data: any): FEATAssessment {
    return {
      id: data.id,
      orgId: data.org_id,
      systemId: data.system_id,
      assessmentType: data.assessment_type,
      status: data.status,
      assessmentDate: new Date(data.assessment_date),
      validUntil: data.valid_until ? new Date(data.valid_until) : undefined,
      fairnessScore: data.fairness_score,
      ethicsScore: data.ethics_score,
      accountabilityScore: data.accountability_score,
      transparencyScore: data.transparency_score,
      overallScore: data.overall_score,
      fairnessDetails: data.fairness_details,
      ethicsDetails: data.ethics_details,
      accountabilityDetails: data.accountability_details,
      transparencyDetails: data.transparency_details,
      findings: data.findings?.map((f: any) => this.mapFindingResponse(f)),
      recommendations: data.recommendations,
      assessors: data.assessors,
      approvedBy: data.approved_by,
      approvedAt: data.approved_at ? new Date(data.approved_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      createdBy: data.created_by,
    };
  }

  private mapKillSwitchResponse(data: any): KillSwitch {
    // Handle nested response format (trigger/restore return {kill_switch: {...}, message: ...})
    if (data.kill_switch) {
      data = data.kill_switch;
    }
    return {
      id: data.id,
      orgId: data.org_id,
      systemId: data.system_id,
      status: data.status,
      accuracyThreshold: data.accuracy_threshold,
      biasThreshold: data.bias_threshold,
      errorRateThreshold: data.error_rate_threshold,
      autoTriggerEnabled: data.auto_trigger_enabled,
      triggeredAt: data.triggered_at ? new Date(data.triggered_at) : undefined,
      triggeredBy: data.triggered_by,
      triggeredReason: data.triggered_reason || data.trigger_reason,
      restoredAt: data.restored_at ? new Date(data.restored_at) : undefined,
      restoredBy: data.restored_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // ============================================================================
  // Unified Execution Tracking Methods (Issue #1075)
  // ============================================================================

  /**
   * Get unified execution status for a MAP plan or WCP workflow.
   *
   * This method provides a consistent interface for tracking execution progress
   * regardless of whether the underlying execution is a MAP plan or WCP workflow.
   *
   * @param executionId - The execution ID (plan ID or workflow ID)
   * @returns Unified execution status
   *
   * @example
   * ```typescript
   * // Get status for any execution (MAP or WCP)
   * const status = await client.getExecutionStatus('exec_123');
   * console.log(`Type: ${status.execution_type}`);
   * console.log(`Status: ${status.status}`);
   * console.log(`Progress: ${status.progress_percent}%`);
   *
   * // Check steps
   * for (const step of status.steps) {
   *   console.log(`  Step ${step.step_index}: ${step.step_name} - ${step.status}`);
   * }
   * ```
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
    if (!executionId) {
      throw new ConfigurationError('Execution ID is required');
    }

    if (this.config.debug) {
      debugLog('Getting execution status', { executionId });
    }

    return this.orchestratorRequest<ExecutionStatus>(
      'GET',
      `/api/v1/unified/executions/${executionId}`
    );
  }

  /**
   * List unified executions with optional filters.
   *
   * Returns a paginated list of executions (both MAP plans and WCP workflows)
   * with optional filtering by type, status, tenant, or organization.
   * This method provides a unified view across all execution types.
   *
   * @param options - Filter and pagination options
   * @returns Paginated list of unified executions
   *
   * @example
   * ```typescript
   * // List all running executions
   * const result = await client.listUnifiedExecutions({
   *   status: 'running',
   *   limit: 20
   * });
   * console.log(`Found ${result.total} running executions`);
   *
   * // List only MAP plans
   * const mapPlans = await client.listUnifiedExecutions({
   *   execution_type: 'map_plan',
   *   limit: 50
   * });
   *
   * // List WCP workflows for a specific tenant
   * const workflows = await client.listUnifiedExecutions({
   *   execution_type: 'wcp_workflow',
   *   tenant_id: 'tenant_123'
   * });
   * ```
   */
  async listUnifiedExecutions(
    options?: UnifiedListExecutionsRequest
  ): Promise<UnifiedListExecutionsResponse> {
    const params = new URLSearchParams();

    if (options?.execution_type) {
      params.set('execution_type', options.execution_type);
    }
    if (options?.status) {
      params.set('status', options.status);
    }
    if (options?.tenant_id) {
      params.set('tenant_id', options.tenant_id);
    }
    if (options?.org_id) {
      params.set('org_id', options.org_id);
    }
    if (options?.limit !== undefined) {
      params.set('limit', options.limit.toString());
    }
    if (options?.offset !== undefined) {
      params.set('offset', options.offset.toString());
    }

    const queryString = params.toString();
    const path = queryString
      ? `/api/v1/unified/executions?${queryString}`
      : '/api/v1/unified/executions';

    if (this.config.debug) {
      debugLog('Listing unified executions', { options });
    }

    return this.orchestratorRequest<UnifiedListExecutionsResponse>('GET', path);
  }

  /**
   * Cancel a unified execution (MAP plan or WCP workflow).
   *
   * This method cancels an execution via the unified execution API,
   * automatically propagating to the correct subsystem (MAP or WCP).
   *
   * @param executionId - The execution ID (plan ID or workflow ID)
   * @param reason - Optional reason for cancellation
   *
   * @example
   * ```typescript
   * await client.cancelExecution('wf_abc123', 'User requested cancellation');
   * ```
   */
  async cancelExecution(executionId: string, reason?: string): Promise<void> {
    if (!executionId) {
      throw new ConfigurationError('Execution ID is required');
    }

    const body = reason ? { reason } : {};
    await this.orchestratorRequest(
      'POST',
      `/api/v1/unified/executions/${executionId}/cancel`,
      body
    );
  }

  // ===========================================================================
  // HITL (Human-in-the-Loop) Queue Methods (Enterprise)
  // ===========================================================================

  /**
   * List pending approval requests in the HITL queue.
   *
   * Returns a paginated list of approval requests that require human review.
   * Filter by status and severity to find requests that need attention.
   *
   * Enterprise Feature: Requires AxonFlow Enterprise license.
   *
   * @param options - Filter and pagination options
   * @returns Paginated list of HITL approval requests
   *
   * @example
   * ```typescript
   * // List all pending requests
   * const result = await client.listHITLQueue();
   * console.log(`${result.total} pending requests`);
   *
   * // List critical pending requests
   * const critical = await client.listHITLQueue({
   *   status: 'pending',
   *   severity: 'critical',
   *   limit: 10
   * });
   * ```
   */
  async listHITLQueue(options?: HITLQueueListOptions): Promise<HITLQueueListResponse> {
    const params = new URLSearchParams();

    if (options?.status) {
      params.set('status', options.status);
    }
    if (options?.severity) {
      params.set('severity', options.severity);
    }
    if (options?.limit !== undefined) {
      params.set('limit', options.limit.toString());
    }
    if (options?.offset !== undefined) {
      params.set('offset', options.offset.toString());
    }

    const queryString = params.toString();
    const path = `/api/v1/hitl/queue${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Listing HITL queue', { options });
    }

    const response = await this.orchestratorRequest<{
      success: boolean;
      data: HITLApprovalRequest[];
      meta: { total: number; limit: number; offset: number };
    }>('GET', path);

    return {
      items: response.data || [],
      total: response.meta?.total ?? 0,
      has_more:
        (response.meta?.offset ?? 0) + (response.data?.length ?? 0) < (response.meta?.total ?? 0),
    };
  }

  /**
   * Get a specific HITL approval request by ID.
   *
   * Enterprise Feature: Requires AxonFlow Enterprise license.
   *
   * @param requestId - The approval request ID
   * @returns The approval request details
   *
   * @example
   * ```typescript
   * const request = await client.getHITLRequest('req_abc123');
   * console.log(`Query: ${request.original_query}`);
   * console.log(`Policy: ${request.triggered_policy_name}`);
   * console.log(`Severity: ${request.severity}`);
   * ```
   */
  async getHITLRequest(requestId: string): Promise<HITLApprovalRequest> {
    if (!requestId) {
      throw new ConfigurationError('Request ID is required');
    }

    if (this.config.debug) {
      debugLog('Getting HITL request', { requestId });
    }

    const response = await this.orchestratorRequest<{
      success: boolean;
      data: HITLApprovalRequest;
    }>('GET', `/api/v1/hitl/queue/${requestId}`);

    return response.data;
  }

  /**
   * Approve an HITL request.
   *
   * Approves the specified approval request, allowing the original query to proceed.
   *
   * Enterprise Feature: Requires AxonFlow Enterprise license.
   *
   * @param requestId - The approval request ID
   * @param review - Reviewer information and optional comment
   *
   * @example
   * ```typescript
   * await client.approveHITLRequest('req_abc123', {
   *   reviewer_id: 'user_456',
   *   reviewer_email: 'reviewer@example.com',
   *   comment: 'Approved after verifying compliance'
   * });
   * ```
   */
  async approveHITLRequest(requestId: string, review: HITLReviewInput): Promise<void> {
    if (!requestId) {
      throw new ConfigurationError('Request ID is required');
    }

    if (this.config.debug) {
      debugLog('Approving HITL request', { requestId, reviewerId: review.reviewer_id });
    }

    await this.orchestratorRequest('POST', `/api/v1/hitl/queue/${requestId}/approve`, review);
  }

  /**
   * Reject an HITL request.
   *
   * Rejects the specified approval request, blocking the original query.
   *
   * Enterprise Feature: Requires AxonFlow Enterprise license.
   *
   * @param requestId - The approval request ID
   * @param review - Reviewer information and optional comment
   *
   * @example
   * ```typescript
   * await client.rejectHITLRequest('req_abc123', {
   *   reviewer_id: 'user_456',
   *   reviewer_email: 'reviewer@example.com',
   *   comment: 'Rejected: query contains PII data'
   * });
   * ```
   */
  async rejectHITLRequest(requestId: string, review: HITLReviewInput): Promise<void> {
    if (!requestId) {
      throw new ConfigurationError('Request ID is required');
    }

    if (this.config.debug) {
      debugLog('Rejecting HITL request', { requestId, reviewerId: review.reviewer_id });
    }

    await this.orchestratorRequest('POST', `/api/v1/hitl/queue/${requestId}/reject`, review);
  }

  /**
   * Get HITL queue dashboard statistics.
   *
   * Returns summary statistics about the HITL queue including
   * pending counts, priority breakdown, and age of oldest request.
   *
   * Enterprise Feature: Requires AxonFlow Enterprise license.
   *
   * @returns HITL queue statistics
   *
   * @example
   * ```typescript
   * const stats = await client.getHITLStats();
   * console.log(`Pending: ${stats.total_pending}`);
   * console.log(`Critical: ${stats.critical_priority}`);
   * if (stats.oldest_pending_hours && stats.oldest_pending_hours > 24) {
   *   console.warn('Oldest request is over 24 hours old!');
   * }
   * ```
   */
  async getHITLStats(): Promise<HITLStats> {
    if (this.config.debug) {
      debugLog('Getting HITL stats');
    }

    const response = await this.orchestratorRequest<{
      success: boolean;
      data: HITLStats;
    }>('GET', '/api/v1/hitl/stats');

    return response.data;
  }

  // ============================================================================
  // Media Governance Config Methods (Issue #1222)
  // ============================================================================

  /**
   * Get the current media governance configuration for the authenticated tenant.
   *
   * Returns whether media analysis is enabled, which analyzers are allowed,
   * and when the config was last updated.
   *
   * @returns Media governance configuration for the tenant
   *
   * @example
   * ```typescript
   * const config = await client.getMediaGovernanceConfig();
   * console.log(`Media governance enabled: ${config.enabled}`);
   * if (config.allowedAnalyzers) {
   *   console.log(`Allowed analyzers: ${config.allowedAnalyzers.join(', ')}`);
   * }
   * ```
   */
  async getMediaGovernanceConfig(): Promise<MediaGovernanceConfig> {
    if (this.config.debug) {
      debugLog('Getting media governance config');
    }

    const data = await this.orchestratorRequest<Record<string, unknown>>(
      'GET',
      '/api/v1/media-governance/config'
    );

    // Transform snake_case response to camelCase
    return {
      tenantId: data.tenant_id as string,
      enabled: data.enabled as boolean,
      allowedAnalyzers: data.allowed_analyzers as string[] | undefined,
      updatedAt: data.updated_at as string,
      updatedBy: data.updated_by as string | undefined,
    };
  }

  /**
   * Update the media governance configuration for the authenticated tenant.
   *
   * Use this to enable/disable media analysis or restrict which analyzers
   * are available for the tenant.
   *
   * @param request - Fields to update
   * @returns Updated media governance configuration
   *
   * @example
   * ```typescript
   * // Disable media governance
   * const updated = await client.updateMediaGovernanceConfig({ enabled: false });
   *
   * // Enable with specific analyzers only
   * const config = await client.updateMediaGovernanceConfig({
   *   enabled: true,
   *   allowedAnalyzers: ['nsfw', 'pii']
   * });
   * ```
   */
  async updateMediaGovernanceConfig(
    request: UpdateMediaGovernanceConfigRequest
  ): Promise<MediaGovernanceConfig> {
    if (this.config.debug) {
      debugLog('Updating media governance config', { request });
    }

    // Convert camelCase to snake_case for API compatibility
    const requestBody: Record<string, unknown> = {};
    if (request.enabled !== undefined) requestBody.enabled = request.enabled;
    if (request.allowedAnalyzers !== undefined)
      requestBody.allowed_analyzers = request.allowedAnalyzers;

    const data = await this.orchestratorRequest<Record<string, unknown>>(
      'PUT',
      '/api/v1/media-governance/config',
      requestBody
    );

    // Transform snake_case response to camelCase
    return {
      tenantId: data.tenant_id as string,
      enabled: data.enabled as boolean,
      allowedAnalyzers: data.allowed_analyzers as string[] | undefined,
      updatedAt: data.updated_at as string,
      updatedBy: data.updated_by as string | undefined,
    };
  }

  /**
   * Get the platform-level media governance status.
   *
   * Reports whether media governance is available on this platform instance,
   * the default enablement state, whether per-tenant control is supported,
   * and the required license tier.
   *
   * @returns Media governance platform status
   *
   * @example
   * ```typescript
   * const status = await client.getMediaGovernanceStatus();
   * console.log(`Available: ${status.available}`);
   * console.log(`Tier: ${status.tier}`);
   * console.log(`Per-tenant control: ${status.perTenantControl}`);
   * ```
   */
  async getMediaGovernanceStatus(): Promise<MediaGovernanceStatus> {
    if (this.config.debug) {
      debugLog('Getting media governance status');
    }

    const data = await this.orchestratorRequest<Record<string, unknown>>(
      'GET',
      '/api/v1/media-governance/status'
    );

    // Transform snake_case response to camelCase
    return {
      available: data.available as boolean,
      enabledByDefault: data.enabled_by_default as boolean,
      perTenantControl: data.per_tenant_control as boolean,
      tier: data.tier as string,
    };
  }

  /**
   * Stream real-time execution status updates via Server-Sent Events (SSE).
   *
   * Connects to the SSE streaming endpoint and invokes the callback with each
   * ExecutionStatus update as it arrives. The stream automatically closes when
   * the execution reaches a terminal state (completed, failed, cancelled, aborted,
   * or expired).
   *
   * @param executionId - The execution ID (plan ID or workflow ID)
   * @param callback - Function called with each ExecutionStatus update
   * @param options - Optional configuration including an AbortSignal for cancellation
   *
   * @example
   * ```typescript
   * // Stream with a callback
   * await client.streamExecutionStatus('exec_123', (status) => {
   *   console.log(`Progress: ${status.progress_percent}%`);
   *   console.log(`Status: ${status.status}`);
   *   for (const step of status.steps) {
   *     console.log(`  Step ${step.step_index}: ${step.step_name} - ${step.status}`);
   *   }
   * });
   *
   * // Stream with abort support
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 60000); // timeout after 1 minute
   * await client.streamExecutionStatus('exec_123', (status) => {
   *   console.log(`${status.status}: ${status.progress_percent}%`);
   * }, { signal: controller.signal });
   * ```
   */
  async streamExecutionStatus(
    executionId: string,
    callback: (status: ExecutionStatus) => void,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    if (!executionId) {
      throw new ConfigurationError('Execution ID is required');
    }

    const url = `${this.config.endpoint}/api/v1/unified/executions/${executionId}/stream`;
    const headers = this.buildAuthHeaders();
    // Override Content-Type for SSE — Accept is what matters
    headers['Accept'] = 'text/event-stream';
    delete headers['Content-Type'];

    if (this.config.debug) {
      debugLog('Streaming execution status', { executionId, url });
    }

    const fetchOptions: RequestInit = {
      method: 'GET',
      headers,
    };

    if (options?.signal) {
      fetchOptions.signal = options.signal;
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Clean exit on abort
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(`Stream request failed: ${errorText}`);
      }
      if (response.status === 404) {
        throw new APIError(404, 'Not Found', errorText);
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    if (!response.body) {
      throw new APIError(0, 'No Body', 'SSE response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (separated by double newline)
        const events = buffer.split('\n\n');
        // Keep the last (potentially incomplete) chunk in the buffer
        buffer = events.pop() || '';

        for (const event of events) {
          const trimmed = event.trim();
          if (!trimmed) {
            continue;
          }

          // Parse SSE data lines (handle both "data: " and "data:" formats per SSE spec)
          for (const line of trimmed.split('\n')) {
            let jsonStr: string | undefined;
            if (line.startsWith('data: ')) {
              jsonStr = line.slice(6);
            } else if (line.startsWith('data:')) {
              jsonStr = line.slice(5);
            }
            if (jsonStr !== undefined) {
              if (!jsonStr || jsonStr === '[DONE]') {
                continue;
              }
              try {
                const status: ExecutionStatus = JSON.parse(jsonStr);
                callback(status);

                // Check for terminal status — stream is done
                if (
                  status.status === 'completed' ||
                  status.status === 'failed' ||
                  status.status === 'cancelled' ||
                  status.status === 'aborted' ||
                  status.status === 'expired'
                ) {
                  return;
                }
              } catch (parseError) {
                if (this.config.debug) {
                  debugLog('Failed to parse SSE data', { jsonStr, error: parseError });
                }
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Clean exit on abort
      }
      throw error;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released
      }
    }
  }
}
