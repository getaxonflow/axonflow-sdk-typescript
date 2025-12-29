import {
  AxonFlowConfig,
  AIRequest,
  GovernanceRequest,
  GovernanceResponse,
  ConnectorMetadata,
  ConnectorInstallRequest,
  ConnectorResponse,
  PlanResponse,
  PlanExecutionResponse,
  PolicyApprovalResult,
  PolicyApprovalOptions,
  AuditResult,
  AuditOptions,
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
} from './types';
import { AuthenticationError, APIError, PolicyViolationError } from './errors';
import { OpenAIInterceptor } from './interceptors/openai';
import { AnthropicInterceptor } from './interceptors/anthropic';
import { BaseInterceptor } from './interceptors/base';
import { generateRequestId, debugLog } from './utils/helpers';

/**
 * Main AxonFlow client for invisible AI governance
 */
export class AxonFlow {
  private config: {
    apiKey?: string;
    licenseKey?: string;
    endpoint: string;
    mode: 'sandbox' | 'production';
    tenant: string;
    debug: boolean;
    timeout: number;
    mapTimeout: number;
    retry: { enabled: boolean; maxAttempts: number; delay: number };
    cache: { enabled: boolean; ttl: number };
  };
  private interceptors: BaseInterceptor[] = [];

  constructor(config: AxonFlowConfig) {
    // Set defaults first to determine endpoint
    const endpoint = config.endpoint || 'https://staging-eu.getaxonflow.com';

    // Check if running in self-hosted mode (localhost)
    const isLocalhost = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

    // License key is optional for self-hosted deployments
    // When not provided, agent must have SELF_HOSTED_MODE=true
    if (!isLocalhost && !config.licenseKey && !config.apiKey) {
      throw new Error('Either licenseKey or apiKey must be provided for non-localhost endpoints');
    }

    if (isLocalhost && !config.licenseKey && !config.apiKey && config.debug) {
      console.warn('[AxonFlow] No license key provided - ensure agent has SELF_HOSTED_MODE=true');
    }

    // Set configuration
    this.config = {
      apiKey: config.apiKey,
      licenseKey: config.licenseKey,
      endpoint,
      mode: config.mode || (isLocalhost ? 'sandbox' : 'production'),
      tenant: config.tenant || 'default',
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

    // Initialize interceptors
    this.interceptors = [new OpenAIInterceptor(), new AnthropicInterceptor()];

    if (this.config.debug) {
      debugLog('AxonFlow initialized', {
        mode: this.config.mode,
        endpoint: this.config.endpoint,
        authMethod: isLocalhost
          ? 'self-hosted (no auth)'
          : this.config.licenseKey
            ? 'license-key'
            : 'api-key',
      });
    }
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
   * const response = await axonflow.executeQuery({
   *   userToken: 'user-123',
   *   query: 'Your prompt here',
   *   requestType: 'chat'
   * });
   * ```
   *
   * See: https://docs.getaxonflow.com/sdk/gateway-mode
   */
  async protect<T = any>(aiCall: () => Promise<T>): Promise<T> {
    console.warn(
      '[AxonFlow] protect() is deprecated and will be removed in v2.0.0. ' +
        'Use Gateway Mode (getPolicyApprovedContext + auditLLMCall) or Proxy Mode (executeQuery) instead. ' +
        'See: https://docs.getaxonflow.com/sdk/gateway-mode'
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
      user_token: this.config.apiKey || '',
      client_id: this.config.tenant,
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
    };

    // Add license key header if available (preferred auth method)
    // Skip auth headers for localhost (self-hosted mode)
    const isLocalhost =
      this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
    if (!isLocalhost && this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

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
  static sandbox(apiKey: string = 'demo-key'): AxonFlow {
    return new AxonFlow({
      apiKey,
      mode: 'sandbox',
      endpoint: 'https://staging-eu.getaxonflow.com',
      debug: true,
    });
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

      return {
        status: data.status === 'healthy' ? 'healthy' : 'degraded',
        version: data.version,
        uptime: data.uptime,
        components: data.components,
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
   * Execute a query through AxonFlow with policy enforcement (Proxy Mode).
   *
   * This is the primary method for Proxy Mode, where AxonFlow handles policy
   * checking and optionally routes requests to LLM providers.
   *
   * @param options - Query execution options
   * @returns ExecuteQueryResponse with results or error information
   * @throws PolicyViolationError if request is blocked by policy
   * @throws AuthenticationError if credentials are invalid
   * @throws APIError for other API errors
   *
   * @example
   * ```typescript
   * const response = await axonflow.executeQuery({
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
  async executeQuery(options: ExecuteQueryOptions): Promise<ExecuteQueryResponse> {
    const agentRequest = {
      query: options.query,
      user_token: options.userToken,
      client_id: this.config.tenant,
      request_type: options.requestType,
      context: options.context || {},
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication headers
    const isLocalhost =
      this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
    if (!isLocalhost) {
      if (this.config.licenseKey) {
        headers['X-License-Key'] = this.config.licenseKey;
      } else if (this.config.apiKey) {
        headers['X-Client-Secret'] = this.config.apiKey;
      }
    }

    if (this.config.debug) {
      debugLog('Proxy Mode: executeQuery', {
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

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
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
      }
      throw new APIError(response.status, response.statusText, errorText);
    }

    const data = await response.json();

    // Check for policy violation in successful response (some blocked responses return 200)
    if (data.blocked) {
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

    if (this.config.debug) {
      debugLog('Proxy Mode: executeQuery result', {
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
    const url = `${this.config.endpoint}/api/connectors`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to list connectors: ${response.status} ${response.statusText}`);
    }

    const connectors = await response.json();

    if (this.config.debug) {
      debugLog('Listed connectors', { count: connectors.length });
    }

    return connectors;
  }

  /**
   * Install an MCP connector from the marketplace
   */
  async installConnector(request: ConnectorInstallRequest): Promise<void> {
    const url = `${this.config.endpoint}/api/connectors/install`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication headers
    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    } else if (this.config.apiKey) {
      headers['X-Client-Secret'] = this.config.apiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to install connector: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (this.config.debug) {
      debugLog('Connector installed', { name: request.name });
    }
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
      user_token: this.config.apiKey || '',
      client_id: this.config.tenant,
      request_type: 'mcp-query',
      context: {
        connector: connectorName,
        params: params || {},
      },
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Connector query failed: ${response.status} ${response.statusText} - ${errorText}`
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
   * Generate a multi-agent execution plan from a natural language query
   * @param query - Natural language query describing the task
   * @param domain - Optional domain hint (travel, healthcare, etc.)
   * @param userToken - Optional user token for authentication (defaults to tenant/client_id)
   */
  async generatePlan(query: string, domain?: string, userToken?: string): Promise<PlanResponse> {
    const agentRequest = {
      query,
      user_token: userToken || this.config.tenant,
      client_id: this.config.tenant,
      request_type: 'multi-agent-plan',
      context: domain ? { domain } : {},
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    // Use mapTimeout for MAP operations (default 2 minutes)
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Plan generation failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const agentResponse = await response.json();

    if (!agentResponse.success) {
      throw new Error(`Plan generation failed: ${agentResponse.error}`);
    }

    // plan_id can be at top level or inside data
    const planId = agentResponse.plan_id || agentResponse.data?.plan_id;

    if (this.config.debug) {
      debugLog('Plan generated', { planId });
    }

    return {
      planId,
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
      user_token: userToken || this.config.tenant,
      client_id: this.config.tenant,
      request_type: 'execute-plan',
      context: { plan_id: planId },
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    // Use mapTimeout for MAP operations (default 2 minutes)
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.mapTimeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Plan execution failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const agentResponse = await response.json();

    if (this.config.debug) {
      debugLog('Plan executed', { planId, success: agentResponse.success });
    }

    return {
      planId,
      status: agentResponse.success ? 'completed' : 'failed',
      result: agentResponse.result,
      stepResults: agentResponse.metadata?.step_results,
      error: agentResponse.error,
      duration: agentResponse.metadata?.duration,
    };
  }

  /**
   * Get the status of a running or completed plan
   */
  async getPlanStatus(planId: string): Promise<PlanExecutionResponse> {
    const url = `${this.config.endpoint}/api/plans/${planId}`;

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
    const url = `${this.config.endpoint}/api/policy/pre-check`;

    const requestBody = {
      user_token: options.userToken,
      client_id: this.config.tenant,
      query: options.query,
      data_sources: options.dataSources || [],
      context: options.context || {},
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication headers
    const isLocalhost =
      this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
    if (!isLocalhost) {
      if (this.config.licenseKey) {
        headers['X-License-Key'] = this.config.licenseKey;
      } else if (this.config.apiKey) {
        headers['X-Client-Secret'] = this.config.apiKey;
      }
    }

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
    const url = `${this.config.endpoint}/api/audit/llm-call`;

    const requestBody = {
      context_id: options.contextId,
      client_id: this.config.tenant,
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
    };

    // Add authentication headers
    const isLocalhost =
      this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
    if (!isLocalhost) {
      if (this.config.licenseKey) {
        headers['X-License-Key'] = this.config.licenseKey;
      } else if (this.config.apiKey) {
        headers['X-Client-Secret'] = this.config.apiKey;
      }
    }

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

  // ============================================================================
  // Policy CRUD Methods - Static Policies
  // ============================================================================

  /**
   * Build authentication headers for API requests
   */
  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Always include tenant ID for policy APIs
    if (this.config.tenant) {
      headers['X-Tenant-ID'] = this.config.tenant;
    }

    const isLocalhost =
      this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');

    if (!isLocalhost) {
      if (this.config.licenseKey) {
        headers['X-License-Key'] = this.config.licenseKey;
      } else if (this.config.apiKey) {
        headers['X-Client-Secret'] = this.config.apiKey;
      }
    }

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

    // Handle DELETE responses with no body
    if (response.status === 204 || method === 'DELETE') {
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
    const policyWithDefaults = {
      ...policy,
      tier: policy.tier || 'tenant',
    };

    return this.policyRequest<StaticPolicy>('POST', '/api/v1/static-policies', policyWithDefaults);
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

    return this.policyRequest<PolicyVersion[]>('GET', `/api/v1/static-policies/${id}/versions`);
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
   *   action: 'warn',
   *   reason: 'Temporarily reducing strictness for migration',
   *   expiresAt: '2025-01-31T23:59:59Z'
   * });
   * ```
   */
  async createPolicyOverride(
    policyId: string,
    override: CreatePolicyOverrideRequest
  ): Promise<PolicyOverride> {
    if (this.config.debug) {
      debugLog('Creating policy override', { policyId, action: override.action });
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
   *   category: 'dynamic-cost',
   *   enabled: true
   * });
   * ```
   */
  async listDynamicPolicies(options?: ListDynamicPoliciesOptions): Promise<DynamicPolicy[]> {
    const params = new URLSearchParams();

    if (options?.category) params.set('category', options.category);
    if (options?.tier) params.set('tier', options.tier);
    if (options?.enabled !== undefined) params.set('enabled', String(options.enabled));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.sortBy) params.set('sort_by', options.sortBy);
    if (options?.sortOrder) params.set('sort_order', options.sortOrder);
    if (options?.search) params.set('search', options.search);

    const queryString = params.toString();
    const path = `/api/v1/policies${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Listing dynamic policies', { options });
    }

    return this.policyRequest<DynamicPolicy[]>('GET', path);
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

    return this.policyRequest<DynamicPolicy>('GET', `/api/v1/policies/${id}`);
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

    return this.policyRequest<DynamicPolicy>('POST', '/api/v1/policies', policy);
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

    return this.policyRequest<DynamicPolicy>('PUT', `/api/v1/policies/${id}`, policy);
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

    await this.policyRequest<void>('DELETE', `/api/v1/policies/${id}`);
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

    return this.policyRequest<DynamicPolicy>('PATCH', `/api/v1/policies/${id}`, { enabled });
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
    const path = `/api/v1/policies/effective${queryString ? `?${queryString}` : ''}`;

    if (this.config.debug) {
      debugLog('Getting effective dynamic policies', { options });
    }

    return this.policyRequest<DynamicPolicy[]>('GET', path);
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

    return this.policyRequest<ValidateGitProviderResponse>(
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

    return this.policyRequest<ConfigureGitProviderResponse>(
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

    return this.policyRequest<ListGitProvidersResponse>(
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

    await this.policyRequest<void>('DELETE', `/api/v1/code-governance/git-providers/${type}`);
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
      files: request.files.map((f) => ({
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
    if (request.secretsDetected !== undefined) apiRequest.secrets_detected = request.secretsDetected;
    if (request.unsafePatterns !== undefined) apiRequest.unsafe_patterns = request.unsafePatterns;

    const response = await this.policyRequest<{
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

    const response = await this.policyRequest<{
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
      prs: response.prs.map((pr) => ({
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

    const response = await this.policyRequest<{
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

    const response = await this.policyRequest<{
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

    const response = await this.policyRequest<{
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

    const response = await this.policyRequest<{
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
      records: response.records.map(r => ({
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
}
