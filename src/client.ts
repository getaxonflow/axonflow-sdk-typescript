import {
  AxonFlowConfig,
  AIRequest,
  GovernanceRequest,
  GovernanceResponse,
  ConnectorMetadata,
  ConnectorInstallRequest,
  ConnectorResponse,
  PlanResponse,
  PlanExecutionResponse
} from './types';
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
    // Validate that either licenseKey or apiKey is provided
    if (!config.licenseKey && !config.apiKey) {
      throw new Error('Either licenseKey or apiKey must be provided');
    }

    // Set defaults
    this.config = {
      apiKey: config.apiKey,
      licenseKey: config.licenseKey,
      endpoint: config.endpoint || 'https://staging-eu.getaxonflow.com',
      mode: config.mode || 'production',
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
        authMethod: this.config.licenseKey ? 'license-key' : 'api-key'
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
      throw new Error(`AxonFlow API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const agentResponse = await response.json();

    // Transform Agent API response to SDK format
    return {
      requestId: request.requestId,
      allowed: !agentResponse.blocked,
      violations: agentResponse.blocked ? [{
        type: 'security',
        severity: 'high',
        description: agentResponse.block_reason || 'Request blocked by policy',
        policy: 'agent-policy',
        action: 'blocked'
      }] : [],
      modifiedRequest: agentResponse.data,
      policies: [],
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
   */
  async generatePlan(query: string, domain?: string): Promise<PlanResponse> {
    const agentRequest = {
      query,
      user_token: this.config.apiKey || '',
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
   */
  async executePlan(planId: string): Promise<PlanExecutionResponse> {
    const agentRequest = {
      query: '',
      user_token: this.config.apiKey || '',
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
}