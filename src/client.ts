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
  AuditOptions
} from './types';
import {
  AxonFlowError,
  PolicyViolationError,
  AuthenticationError,
  APIError
} from './errors';
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
      retry: {
        enabled: config.retry?.enabled !== false,
        maxAttempts: config.retry?.maxAttempts || 3,
        delay: config.retry?.delay || 1000
      },
      cache: {
        enabled: config.cache?.enabled !== false,
        ttl: config.cache?.ttl || 60000
      }
    };

    // Initialize interceptors
    this.interceptors = [
      new OpenAIInterceptor(),
      new AnthropicInterceptor()
    ];

    if (this.config.debug) {
      debugLog('AxonFlow initialized', {
        mode: this.config.mode,
        endpoint: this.config.endpoint,
        authMethod: isLocalhost ? 'self-hosted (no auth)' : (this.config.licenseKey ? 'license-key' : 'api-key')
      });
    }
  }

  /**
   * Main method to protect AI calls with governance
   * @param aiCall The AI call to protect
   * @returns The AI response after governance
   */
  async protect<T = any>(aiCall: () => Promise<T>): Promise<T> {
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
        tenant: this.config.tenant
      };

      // Check policies with AxonFlow Agent
      const governanceResponse = await this.checkPolicies(governanceRequest);

      // If denied, throw error
      if (!governanceResponse.allowed) {
        const violation = governanceResponse.violations?.[0];
        throw new Error(`Request blocked by AxonFlow: ${violation?.description || 'Policy violation'}`);
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
      parameters: {}
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
        mode: this.config.mode
      }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add license key header if available (preferred auth method)
    // Skip auth headers for localhost (self-hosted mode)
    const isLocalhost = this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
    if (!isLocalhost && this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AxonFlow API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const agentResponse = await response.json();

    // Transform Agent API response to SDK format
    // Extract policy name from policy_info if available
    const policyName = agentResponse.policy_info?.policies_evaluated?.[0] || 'agent-policy';
    return {
      requestId: request.requestId,
      allowed: !agentResponse.blocked,
      violations: agentResponse.blocked ? [{
        type: 'security',
        severity: 'high',
        description: agentResponse.block_reason || 'Request blocked by policy',
        policy: policyName,
        action: 'blocked'
      }] : [],
      modifiedRequest: agentResponse.data,
      policies: agentResponse.policy_info?.policies_evaluated || [],
      audit: {
        timestamp: Date.now(),
        duration: parseInt(agentResponse.policy_info?.processing_time?.replace('ms', '') || '0'),
        tenant: this.config.tenant
      }
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
        duration: response.audit.duration
      });
    }
  }

  /**
   * Check if an error is from AxonFlow (vs the AI provider)
   */
  private isAxonFlowError(error: any): boolean {
    return error?.message?.includes('AxonFlow') ||
           error?.message?.includes('governance') ||
           error?.message?.includes('fetch');
  }

  /**
   * Create a sandbox client for testing
   */
  static sandbox(apiKey: string = 'demo-key'): AxonFlow {
    return new AxonFlow({
      apiKey,
      mode: 'sandbox',
      endpoint: 'https://staging-eu.getaxonflow.com',
      debug: true
    });
  }

  /**
   * List all available MCP connectors from the marketplace
   */
  async listConnectors(): Promise<ConnectorMetadata[]> {
    const url = `${this.config.endpoint}/api/connectors`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout)
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
      'Content-Type': 'application/json'
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
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to install connector: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (this.config.debug) {
      debugLog('Connector installed', { name: request.name });
    }
  }

  /**
   * Execute a query against an installed MCP connector
   */
  async queryConnector(connectorName: string, query: string, params?: any): Promise<ConnectorResponse> {
    const agentRequest = {
      query,
      user_token: this.config.apiKey || '',
      client_id: this.config.tenant,
      request_type: 'mcp-query',
      context: {
        connector: connectorName,
        params: params || {}
      }
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Connector query failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const agentResponse = await response.json();

    if (this.config.debug) {
      debugLog('Connector query executed', { connector: connectorName });
    }

    return {
      success: agentResponse.success,
      data: agentResponse.data,
      error: agentResponse.error,
      meta: agentResponse.metadata
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
      context: domain ? { domain } : {}
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Plan generation failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const agentResponse = await response.json();

    if (!agentResponse.success) {
      throw new Error(`Plan generation failed: ${agentResponse.error}`);
    }

    if (this.config.debug) {
      debugLog('Plan generated', { planId: agentResponse.plan_id });
    }

    return {
      planId: agentResponse.plan_id,
      steps: agentResponse.data?.steps || [],
      domain: agentResponse.data?.domain || domain || 'generic',
      complexity: agentResponse.data?.complexity || 0,
      parallel: agentResponse.data?.parallel || false,
      metadata: agentResponse.metadata || {}
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
      context: { plan_id: planId }
    };

    const url = `${this.config.endpoint}/api/request`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.licenseKey) {
      headers['X-License-Key'] = this.config.licenseKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Plan execution failed: ${response.status} ${response.statusText} - ${errorText}`);
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
      duration: agentResponse.metadata?.duration
    };
  }

  /**
   * Get the status of a running or completed plan
   */
  async getPlanStatus(planId: string): Promise<PlanExecutionResponse> {
    const url = `${this.config.endpoint}/api/plans/${planId}`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Get plan status failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const status = await response.json();

    return {
      planId,
      status: status.status,
      result: status.result,
      stepResults: status.step_results,
      error: status.error,
      duration: status.duration
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
      context: options.context || {}
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add authentication headers
    const isLocalhost = this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
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
      signal: AbortSignal.timeout(this.config.timeout)
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
      blockReason: data.block_reason
    };

    // Parse rate limit info if present
    if (data.rate_limit) {
      result.rateLimitInfo = {
        limit: data.rate_limit.limit,
        remaining: data.rate_limit.remaining,
        resetAt: new Date(data.rate_limit.reset_at)
      };
    }

    if (this.config.debug) {
      debugLog('Gateway Mode: Pre-check result', {
        approved: result.approved,
        contextId: result.contextId,
        policies: result.policies.length
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
        total_tokens: options.tokenUsage.totalTokens
      },
      latency_ms: options.latencyMs,
      metadata: options.metadata || {}
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add authentication headers
    const isLocalhost = this.config.endpoint.includes('localhost') || this.config.endpoint.includes('127.0.0.1');
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
        model: options.model
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout)
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
      auditId: data.audit_id
    };

    if (this.config.debug) {
      debugLog('Gateway Mode: Audit logged', { auditId: result.auditId });
    }

    return result;
  }
}