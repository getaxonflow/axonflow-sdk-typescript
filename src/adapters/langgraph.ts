/**
 * LangGraph Adapter for AxonFlow Workflow Control Plane.
 *
 * This adapter wraps LangGraph workflows with AxonFlow governance gates,
 * providing policy enforcement at step transitions.
 *
 * "LangGraph runs the workflow. AxonFlow decides when it's allowed to move forward."
 *
 * @example
 * ```typescript
 * import { AxonFlow, AxonFlowLangGraphAdapter } from '@axonflow/sdk';
 *
 * const client = new AxonFlow({ endpoint: 'http://localhost:8080' });
 * const adapter = new AxonFlowLangGraphAdapter(client, 'my-workflow');
 *
 * // Start workflow and register with AxonFlow
 * await adapter.startWorkflow();
 *
 * // Before each step, check the gate
 * if (await adapter.checkGate('generate_code', 'llm_call', { model: 'gpt-4' })) {
 *   const result = await executeStep();
 *   await adapter.stepCompleted('generate_code');
 * }
 *
 * // Complete workflow
 * await adapter.completeWorkflow();
 * ```
 */

import { AxonFlow } from '../client';
import {
  AxonFlowError,
  PolicyViolationError,
  TimeoutError as AxonFlowTimeoutError,
} from '../errors';
import type { StepType, ToolContext, WorkflowSource } from '../types/workflows';
import { registerAdapter } from '../telemetry';

/**
 * Error thrown when a workflow step is blocked by policy.
 */
export class WorkflowBlockedError extends AxonFlowError {
  public readonly stepId?: string;
  public readonly reason?: string;
  public readonly policyIds: string[];

  constructor(message: string, stepId?: string, reason?: string, policyIds?: string[]) {
    super(message, { stepId, reason, policyIds: policyIds ?? [] });
    this.name = 'WorkflowBlockedError';
    this.stepId = stepId;
    this.reason = reason;
    this.policyIds = policyIds ?? [];
    Object.setPrototypeOf(this, WorkflowBlockedError.prototype);
  }
}

/**
 * Error thrown when a workflow step requires approval.
 */
export class WorkflowApprovalRequiredError extends AxonFlowError {
  public readonly stepId?: string;
  public readonly approvalUrl?: string;
  public readonly reason?: string;

  constructor(message: string, stepId?: string, approvalUrl?: string, reason?: string) {
    super(message, { stepId, approvalUrl, reason });
    this.name = 'WorkflowApprovalRequiredError';
    this.stepId = stepId;
    this.approvalUrl = approvalUrl;
    this.reason = reason;
    Object.setPrototypeOf(this, WorkflowApprovalRequiredError.prototype);
  }
}

/**
 * Options for the MCP tool interceptor.
 */
export interface MCPInterceptorOptions {
  /**
   * Optional function that maps an MCP request to a connector type string
   * identifying the MCP server. Defaults to `request.serverName`.
   *
   * This identifies the server only — the tool name is reported
   * separately via the `tool` field on `mcpCheckInput`/`mcpCheckOutput`
   * (epic #2905 / #2904 two-field identity contract). Do not concatenate
   * server and tool name into this string; use a custom `connectorTypeFn`
   * only if you need to override how the server identity itself is
   * derived.
   */
  connectorTypeFn?: (request: any) => string;
  /**
   * Operation type passed to mcp_check_input.
   * Defaults to "execute". Set to "query" for known read-only tool calls.
   */
  operation?: string;
}

/**
 * Options for the LangGraph adapter constructor.
 */
export interface LangGraphAdapterOptions {
  /** Workflow source (defaults to 'langgraph') */
  source?: WorkflowSource;
  /**
   * If true, checkGate raises WorkflowBlockedError on block.
   * If false, returns false and caller handles it.
   * Defaults to true.
   */
  autoBlock?: boolean;
}

/**
 * Options for checkGate method.
 */
export interface CheckGateOptions {
  /** Optional step ID (auto-generated if not provided) */
  stepId?: string;
  /** Input data for the step (for policy evaluation) */
  stepInput?: Record<string, unknown>;
  /** LLM model being used */
  model?: string;
  /** LLM provider being used */
  provider?: string;
  /** Tool context for per-tool governance within tool_call steps */
  toolContext?: ToolContext;
}

/**
 * Options for stepCompleted method.
 */
export interface StepCompletedOptions {
  /** Optional step ID (must match the one used in checkGate) */
  stepId?: string;
  /** Output data from the step */
  output?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Input tokens consumed */
  tokensIn?: number;
  /** Output tokens produced */
  tokensOut?: number;
  /** Cost in USD */
  costUsd?: number;
}

/**
 * Options for checkToolGate method.
 */
export interface CheckToolGateOptions {
  /** Step name (defaults to "tools/{toolName}") */
  stepName?: string;
  /** Optional step ID (auto-generated if not provided) */
  stepId?: string;
  /** Input arguments for the tool */
  toolInput?: Record<string, unknown>;
  /** LLM model being used */
  model?: string;
  /** LLM provider being used */
  provider?: string;
}

/**
 * Options for toolCompleted method.
 */
export interface ToolCompletedOptions {
  /** Step name (defaults to "tools/{toolName}") */
  stepName?: string;
  /** Optional step ID (must match the one used in checkToolGate) */
  stepId?: string;
  /** Output data from the tool */
  output?: Record<string, unknown>;
  /** Input tokens consumed */
  tokensIn?: number;
  /** Output tokens produced */
  tokensOut?: number;
  /** Cost in USD */
  costUsd?: number;
}

/**
 * Options for waitForApproval method.
 */
export interface WaitForApprovalOptions {
  /** Seconds between polls (default 5) */
  pollInterval?: number;
  /** Maximum seconds to wait (default 300) */
  timeout?: number;
}

/**
 * Wraps LangGraph workflows with AxonFlow governance gates.
 *
 * This adapter provides a simple interface for integrating AxonFlow's
 * Workflow Control Plane with LangGraph workflows. It handles workflow
 * registration, step gate checks, and workflow lifecycle management.
 *
 * @example
 * ```typescript
 * const adapter = new AxonFlowLangGraphAdapter(client, 'code-review-pipeline');
 * await adapter.startWorkflow();
 *
 * // Before each LangGraph node execution
 * if (await adapter.checkGate('analyze', 'llm_call')) {
 *   const result = await analyzeCode(state);
 *   await adapter.stepCompleted('analyze');
 * }
 * ```
 */
export class AxonFlowLangGraphAdapter {
  public readonly client: AxonFlow;
  public readonly workflowName: string;
  public readonly source: WorkflowSource;
  public workflowId: string | null = null;

  private _stepCounter = 0;
  private readonly _autoBlock: boolean;

  constructor(client: AxonFlow, workflowName: string, options?: LangGraphAdapterOptions) {
    // Declare this adapter on the next telemetry heartbeat. Without it, an
    // application driving the SDK through this adapter is indistinguishable
    // from bare SDK use on every telemetry dimension — same sdk, same
    // sdk_version, same endpoint — which is the gap the registry closes.
    //
    // Here rather than at module import, and the distinction is the point:
    // importing the module says the adapter is INSTALLED, constructing one says
    // it is IN USE, and only the second is adoption signal.
    //
    // The heartbeat fires on the client's first outbound REQUEST, not at client
    // construction, so a registration made here — necessarily after the client
    // exists and before any call through it — reaches the very first ping. No
    // I/O; one insert into a Set that deduplicates.
    //
    // A LITERAL, not `options?.source`: `source` is a PLATFORM API value the
    // orchestrator interprets and a caller may override, while this is a
    // TELEMETRY value the checkpoint buckets. Deriving one from the other would
    // let a caller repoint an analytics dimension by passing a custom source.
    registerAdapter('langgraph');

    this.client = client;
    this.workflowName = workflowName;
    this.source = options?.source ?? 'langgraph';
    this._autoBlock = options?.autoBlock ?? true;
  }

  /**
   * Register the workflow with AxonFlow.
   *
   * Call this at the start of your LangGraph workflow execution.
   *
   * @param metadata - Additional workflow metadata
   * @param traceId - External trace ID for correlation (Langsmith, Datadog, OTel)
   * @returns The assigned workflow ID
   */
  async startWorkflow(metadata?: Record<string, unknown>, traceId?: string): Promise<string> {
    const response = await this.client.createWorkflow({
      workflow_name: this.workflowName,
      source: this.source,
      metadata: metadata ?? {},
      trace_id: traceId,
    });
    this.workflowId = response.workflow_id;
    return this.workflowId;
  }

  /**
   * Check if a step is allowed to proceed.
   *
   * Call this before executing each LangGraph node to check policy approval.
   *
   * @param stepName - Human-readable step name
   * @param stepType - Type of step (llm_call, tool_call, connector_call, human_task)
   * @param opts - Additional options
   * @returns True if step is allowed, false if blocked (when autoBlock=false)
   * @throws WorkflowBlockedError if step is blocked and autoBlock=true
   * @throws WorkflowApprovalRequiredError if step requires approval
   * @throws Error if workflow not started
   */
  async checkGate(stepName: string, stepType: StepType, opts?: CheckGateOptions): Promise<boolean> {
    if (!this.workflowId) {
      throw new Error('Workflow not started. Call startWorkflow() first.');
    }

    // Generate step ID if not provided
    let stepId = opts?.stepId;
    if (!stepId) {
      this._stepCounter += 1;
      const safeName = stepName.toLowerCase().replace(/ /g, '-').replace(/\//g, '-');
      stepId = `step-${this._stepCounter}-${safeName}`;
    }

    const response = await this.client.stepGate(this.workflowId, stepId, {
      step_name: stepName,
      step_type: stepType,
      step_input: opts?.stepInput ?? {},
      model: opts?.model,
      provider: opts?.provider,
      tool_context: opts?.toolContext,
    });

    if (response.decision === 'block') {
      if (this._autoBlock) {
        throw new WorkflowBlockedError(
          `Step '${stepName}' blocked: ${response.reason}`,
          response.step_id,
          response.reason,
          response.policy_ids
        );
      }
      return false;
    }

    if (response.decision === 'require_approval') {
      throw new WorkflowApprovalRequiredError(
        `Step '${stepName}' requires approval`,
        response.step_id,
        response.approval_url,
        response.reason
      );
    }

    return true;
  }

  /**
   * Mark a step as completed.
   *
   * Call this after successfully executing a LangGraph node.
   *
   * @param stepName - Step name (used to generate step_id if not provided)
   * @param opts - Additional options
   */
  async stepCompleted(stepName: string, opts?: StepCompletedOptions): Promise<void> {
    if (!this.workflowId) {
      throw new Error('Workflow not started. Call startWorkflow() first.');
    }

    // Generate step ID if not provided (must match checkGate)
    let stepId = opts?.stepId;
    if (!stepId) {
      const safeName = stepName.toLowerCase().replace(/ /g, '-').replace(/\//g, '-');
      stepId = `step-${this._stepCounter}-${safeName}`;
    }

    await this.client.markStepCompleted(this.workflowId, stepId, {
      output: opts?.output ?? {},
      metadata: opts?.metadata ?? {},
      tokens_in: opts?.tokensIn,
      tokens_out: opts?.tokensOut,
      cost_usd: opts?.costUsd,
    });
  }

  /**
   * Check if a specific tool invocation is allowed.
   *
   * Convenience wrapper around checkGate() that sets step_type='tool_call'
   * and includes ToolContext for per-tool governance.
   *
   * @param toolName - Name of the tool being invoked
   * @param toolType - Tool type (function, mcp, api)
   * @param opts - Additional options
   * @returns True if tool invocation is allowed, false if blocked (when autoBlock=false)
   */
  async checkToolGate(
    toolName: string,
    toolType?: string,
    opts?: CheckToolGateOptions
  ): Promise<boolean> {
    const stepName = opts?.stepName ?? `tools/${toolName}`;

    const toolContext: ToolContext = {
      tool_name: toolName,
      tool_type: toolType,
      tool_input: opts?.toolInput ?? {},
    };

    return this.checkGate(stepName, 'tool_call', {
      stepId: opts?.stepId,
      model: opts?.model,
      provider: opts?.provider,
      toolContext,
    });
  }

  /**
   * Mark a tool invocation as completed.
   *
   * Convenience wrapper around stepCompleted() for tool-level tracking.
   *
   * @param toolName - Name of the tool that was invoked
   * @param opts - Additional options
   */
  async toolCompleted(toolName: string, opts?: ToolCompletedOptions): Promise<void> {
    const stepName = opts?.stepName ?? `tools/${toolName}`;

    await this.stepCompleted(stepName, {
      stepId: opts?.stepId,
      output: opts?.output,
      tokensIn: opts?.tokensIn,
      tokensOut: opts?.tokensOut,
      costUsd: opts?.costUsd,
    });
  }

  /**
   * Mark the workflow as completed.
   *
   * Call this when your LangGraph workflow finishes successfully.
   */
  async completeWorkflow(): Promise<void> {
    if (!this.workflowId) {
      throw new Error('Workflow not started. Call startWorkflow() first.');
    }
    await this.client.completeWorkflow(this.workflowId);
  }

  /**
   * Abort the workflow.
   *
   * Call this when your LangGraph workflow fails or is cancelled.
   *
   * @param reason - Reason for aborting
   */
  async abortWorkflow(reason?: string): Promise<void> {
    if (!this.workflowId) {
      throw new Error('Workflow not started. Call startWorkflow() first.');
    }
    await this.client.abortWorkflow(this.workflowId, reason);
  }

  /**
   * Fail the workflow.
   *
   * Call this when your LangGraph workflow has encountered an unrecoverable error.
   *
   * @param reason - Reason for the failure
   */
  async failWorkflow(reason?: string): Promise<void> {
    if (!this.workflowId) {
      throw new Error('Workflow not started. Call startWorkflow() first.');
    }
    await this.client.failWorkflow(this.workflowId, reason);
  }

  /**
   * Wait for a step to be approved.
   *
   * Poll the workflow status until the step is approved or rejected.
   *
   * @param stepId - Step ID to wait for
   * @param opts - Polling options
   * @returns True if approved, false if rejected
   * @throws Error if approval not received within timeout
   */
  async waitForApproval(stepId: string, opts?: WaitForApprovalOptions): Promise<boolean> {
    if (!this.workflowId) {
      throw new Error('Workflow not started. Call startWorkflow() first.');
    }

    const pollInterval = opts?.pollInterval ?? 5;
    const timeout = opts?.timeout ?? 300;
    let elapsed = 0;

    while (elapsed < timeout) {
      const status = await this.client.getWorkflow(this.workflowId);

      // Find the step
      if (status.steps) {
        for (const step of status.steps) {
          if (step.step_id === stepId) {
            if (step.approval_status) {
              if (step.approval_status === 'approved') {
                return true;
              }
              if (step.approval_status === 'rejected') {
                return false;
              }
            }
            break;
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
      elapsed += pollInterval;
    }

    throw new AxonFlowTimeoutError(timeout * 1000);
  }

  /**
   * Return an async MCP tool interceptor for use with MultiServerMCPClient.
   *
   * The interceptor enforces AxonFlow input and output policies around every
   * MCP tool call.
   *
   * @example
   * ```typescript
   * const mcp = new MultiServerMCPClient(
   *   { 'my-server': { url: '...', transport: 'http' } },
   *   { toolInterceptors: [adapter.mcpToolInterceptor()] },
   * );
   * ```
   *
   * @param opts - Optional interceptor options
   * @returns An async callable (request, handler) => result
   */
  mcpToolInterceptor(
    opts?: MCPInterceptorOptions
  ): (request: any, handler: (request: any) => Promise<any>) => Promise<any> {
    const operation = opts?.operation ?? 'execute';

    const defaultConnectorType = (request: any): string => {
      return request.serverName;
    };

    const resolveConnectorType = opts?.connectorTypeFn ?? defaultConnectorType;

    return async (request: any, handler: (request: any) => Promise<any>): Promise<any> => {
      const connectorType = resolveConnectorType(request);
      const tool = request.name;
      let argsStr = '{}';
      if (request.args) {
        try {
          argsStr = JSON.stringify(request.args);
        } catch {
          argsStr = String(request.args);
        }
      }
      const statement = `${connectorType}.${tool}(${argsStr})`;

      const preCheck = await this.client.mcpCheckInput({
        connectorType,
        tool,
        statement,
        operation,
        parameters: request.args,
      });

      if (!preCheck.allowed) {
        throw new PolicyViolationError(preCheck.block_reason ?? 'Tool call blocked by policy');
      }

      const result = await handler(request);

      let resultStr: string;
      try {
        resultStr = JSON.stringify(result);
      } catch {
        resultStr = String(result);
      }

      const outputCheck = await this.client.mcpCheckOutput({
        connectorType,
        tool,
        message: resultStr,
      });

      if (!outputCheck.allowed) {
        throw new PolicyViolationError(outputCheck.block_reason ?? 'Tool result blocked by policy');
      }

      if (outputCheck.redacted_data !== undefined && outputCheck.redacted_data !== null) {
        return outputCheck.redacted_data;
      }

      return result;
    };
  }
}
