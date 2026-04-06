/**
 * AxonFlow GovernedTool - Framework-agnostic tool governance.
 *
 * Wraps any tool implementing the ToolDefinition interface with AxonFlow
 * input/output policy enforcement. Works with any framework that uses
 * tools with name, description, and invoke().
 *
 * @example
 * ```typescript
 * import { AxonFlow, GovernedTool, governTools } from '@axonflow/sdk';
 *
 * const tool: ToolDefinition = {
 *   name: 'search',
 *   description: 'Search the web',
 *   invoke: async (input) => webSearch(input),
 * };
 *
 * const axonflow = new AxonFlow({ endpoint: 'http://localhost:8080' });
 * const governed = governTools([tool], axonflow);
 * const result = await governed[0].invoke({ query: 'latest AI research' });
 * ```
 */

import { AxonFlow } from '../client';
import { PolicyViolationError } from '../errors';
import type { MCPCheckInputOptions, MCPCheckOutputOptions } from '../types/connector';

/**
 * Minimal tool interface for governance wrapping.
 * Any object with name, description, and an async invoke method qualifies.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  invoke(input: unknown): Promise<unknown>;
}

/**
 * Options for configuring a GovernedTool.
 */
export interface GovernedToolOptions {
  /** Maps a tool name to a connector type string. Defaults to using the tool name. */
  connectorTypeFn?: (name: string) => string;
  /** Operation type for input checks: "execute" (default) or "query" for read-only tools. */
  operation?: string;
}

/**
 * Serialize content for policy evaluation.
 * Strings pass through; objects are JSON-serialized.
 */
function serializeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/**
 * Wraps a tool with AxonFlow input/output governance.
 *
 * Every invoke() call runs through two policy checks:
 * 1. Input check (mcpCheckInput): evaluates tool arguments before execution.
 *    Blocked calls raise PolicyViolationError and the tool never runs.
 * 2. Output check (mcpCheckOutput): evaluates tool results after execution.
 *    Can block (raise), redact (return cleaned data), or allow.
 */
export class GovernedTool implements ToolDefinition {
  readonly name: string;
  readonly description: string;
  private readonly wrapped: ToolDefinition;
  private readonly client: AxonFlow;
  private readonly connectorType: string;
  private readonly operation: string;

  constructor(tool: ToolDefinition, client: AxonFlow, options?: GovernedToolOptions) {
    if (!tool || typeof tool.name !== 'string' || !tool.name) {
      throw new TypeError('tool must have a non-empty "name" property');
    }
    if (typeof tool.invoke !== 'function') {
      throw new TypeError('tool must have an "invoke" method');
    }

    this.name = tool.name;
    this.description = tool.description || '';
    this.wrapped = tool;
    this.client = client;
    this.connectorType = options?.connectorTypeFn
      ? options.connectorTypeFn(tool.name)
      : tool.name;
    this.operation = options?.operation || 'execute';
  }

  /**
   * Adapt a LangChain.js tool (duck-typed: has .name, .description, .invoke())
   * to the ToolDefinition interface and wrap with governance.
   */
  static fromLangChain(
    tool: { name: string; description: string; invoke: (input: unknown) => Promise<unknown> },
    client: AxonFlow,
    options?: GovernedToolOptions,
  ): GovernedTool {
    const adapted: ToolDefinition = {
      name: tool.name,
      description: tool.description,
      invoke: (input: unknown) => tool.invoke(input),
    };
    return new GovernedTool(adapted, client, options);
  }

  /**
   * Invoke the tool with input/output governance.
   *
   * 1. Serialize input
   * 2. Check input against policies
   * 3. Execute tool if allowed
   * 4. Check output against policies
   * 5. Return result (possibly redacted)
   */
  async invoke(input: unknown): Promise<unknown> {
    const statement = serializeContent(input);

    // Input policy check
    const inputCheck = await this.client.mcpCheckInput({
      connectorType: this.connectorType,
      statement,
      operation: this.operation,
    });

    if (!inputCheck.allowed) {
      throw new PolicyViolationError(
        inputCheck.block_reason || 'Tool call blocked by input policy',
      );
    }

    // Execute the wrapped tool
    const result = await this.wrapped.invoke(input);

    // Output policy check
    const serialized = serializeContent(result);
    const outputCheck = await this.client.mcpCheckOutput({
      connectorType: this.connectorType,
      message: serialized,
    });

    if (!outputCheck.allowed) {
      throw new PolicyViolationError(
        outputCheck.block_reason || 'Tool output blocked by policy',
      );
    }

    if (outputCheck.redacted_data !== undefined && outputCheck.redacted_data !== null) {
      return outputCheck.redacted_data;
    }

    return result;
  }

  toString(): string {
    return `GovernedTool(name=${this.name}, connectorType=${this.connectorType})`;
  }
}

/**
 * Wrap a list of tools with AxonFlow governance.
 *
 * @example
 * ```typescript
 * const governed = governTools([search, calculator], client);
 * ```
 */
export function governTools(
  tools: ToolDefinition[],
  client: AxonFlow,
  options?: GovernedToolOptions,
): GovernedTool[] {
  return tools.map((t) => new GovernedTool(t, client, options));
}
