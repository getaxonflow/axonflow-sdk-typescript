import { BaseInterceptor } from './base';
import { AIRequest } from '../types';

/**
 * Interceptor for AWS Bedrock API calls
 *
 * Bedrock uses AWS IAM authentication (no API keys required).
 * Supports multiple model providers: Anthropic Claude, Amazon Titan, Meta Llama, etc.
 *
 * @example
 * ```typescript
 * import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
 * import { AxonFlow, wrapBedrockClient } from '@axonflow/sdk';
 *
 * const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
 * const axonflow = new AxonFlow({ endpoint: 'http://localhost:8080' });
 *
 * const wrapped = wrapBedrockClient(bedrockClient, axonflow);
 * const response = await wrapped.send(new InvokeModelCommand({...}));
 * ```
 */
export class BedrockInterceptor extends BaseInterceptor {
  canHandle(aiCall: any): boolean {
    const callString = aiCall.toString();
    return (
      callString.includes('bedrock') ||
      callString.includes('BedrockRuntime') ||
      callString.includes('InvokeModel') ||
      callString.includes('anthropic.claude') ||
      callString.includes('amazon.titan')
    );
  }

  extractRequest(aiCall: any): AIRequest {
    const callString = aiCall.toString();

    let model = 'anthropic.claude-3-sonnet';
    if (callString.includes('titan')) {
      model = 'amazon.titan-text-express-v1';
    } else if (callString.includes('llama')) {
      model = 'meta.llama2-70b-chat-v1';
    } else if (callString.includes('claude-3-opus')) {
      model = 'anthropic.claude-3-opus';
    } else if (callString.includes('claude-3-haiku')) {
      model = 'anthropic.claude-3-haiku';
    }

    return {
      provider: 'bedrock',
      model,
      prompt: callString,
      parameters: {},
    };
  }

  executeWithModifications(aiCall: any, _modifications: any): Promise<any> {
    return aiCall();
  }

  getProvider(): string {
    return 'bedrock';
  }
}

/**
 * Bedrock model providers and their model IDs
 */
export const BedrockModels = {
  // Anthropic Claude models
  CLAUDE_3_OPUS: 'anthropic.claude-3-opus-20240229-v1:0',
  CLAUDE_3_SONNET: 'anthropic.claude-3-sonnet-20240229-v1:0',
  CLAUDE_3_HAIKU: 'anthropic.claude-3-haiku-20240307-v1:0',
  CLAUDE_2_1: 'anthropic.claude-v2:1',
  CLAUDE_2: 'anthropic.claude-v2',
  CLAUDE_INSTANT: 'anthropic.claude-instant-v1',

  // Amazon Titan models
  TITAN_TEXT_EXPRESS: 'amazon.titan-text-express-v1',
  TITAN_TEXT_LITE: 'amazon.titan-text-lite-v1',
  TITAN_TEXT_PREMIER: 'amazon.titan-text-premier-v1:0',

  // Meta Llama models
  LLAMA2_13B: 'meta.llama2-13b-chat-v1',
  LLAMA2_70B: 'meta.llama2-70b-chat-v1',
  LLAMA3_8B: 'meta.llama3-8b-instruct-v1:0',
  LLAMA3_70B: 'meta.llama3-70b-instruct-v1:0',

  // Cohere models
  COHERE_COMMAND: 'cohere.command-text-v14',
  COHERE_COMMAND_LIGHT: 'cohere.command-light-text-v14',

  // AI21 models
  AI21_JURASSIC_ULTRA: 'ai21.j2-ultra-v1',
  AI21_JURASSIC_MID: 'ai21.j2-mid-v1',
} as const;

/**
 * Bedrock invoke model request body for Claude
 */
export interface BedrockClaudeRequest {
  anthropic_version: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: 'text'; text: string }>;
  }>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  system?: string;
}

/**
 * Bedrock invoke model response for Claude
 */
export interface BedrockClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Bedrock invoke model request body for Titan
 */
export interface BedrockTitanRequest {
  inputText: string;
  textGenerationConfig?: {
    maxTokenCount?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
}

/**
 * Bedrock invoke model response for Titan
 */
export interface BedrockTitanResponse {
  inputTextTokenCount: number;
  results: Array<{
    tokenCount: number;
    outputText: string;
    completionReason: string;
  }>;
}

/**
 * Wraps an AWS Bedrock client with AxonFlow governance.
 *
 * @example
 * ```typescript
 * import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
 * import { AxonFlow, wrapBedrockClient } from '@axonflow/sdk';
 *
 * const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
 * const axonflow = new AxonFlow({ endpoint: 'http://localhost:8080' });
 *
 * const wrapped = wrapBedrockClient(bedrock, axonflow);
 *
 * const command = new InvokeModelCommand({
 *   modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
 *   body: JSON.stringify({
 *     anthropic_version: 'bedrock-2023-05-31',
 *     max_tokens: 1024,
 *     messages: [{ role: 'user', content: 'Hello!' }]
 *   })
 * });
 *
 * const response = await wrapped.send(command);
 * ```
 */
export function wrapBedrockClient(bedrockClient: any, axonflow: any): any {
  const originalSend = bedrockClient.send.bind(bedrockClient);

  bedrockClient.send = async (command: any) => {
    // Check if this is an InvokeModelCommand
    const commandName = command.constructor?.name || '';
    if (!commandName.includes('InvokeModel')) {
      return originalSend(command);
    }

    // Extract model ID and prompt for governance context
    const modelId = command.input?.modelId || 'unknown';
    let prompt = '';

    try {
      const body = JSON.parse(
        typeof command.input?.body === 'string'
          ? command.input.body
          : new TextDecoder().decode(command.input?.body)
      );

      // Extract prompt based on model type
      if (body.messages) {
        // Claude format
        prompt = body.messages
          .map((m: any) => (typeof m.content === 'string' ? m.content : m.content?.[0]?.text || ''))
          .join(' ');
      } else if (body.inputText) {
        // Titan format
        prompt = body.inputText;
      } else if (body.prompt) {
        // Generic format
        prompt = body.prompt;
      }
    } catch {
      // If we can't parse the body, continue without prompt extraction
    }

    // Protect the call with AxonFlow, passing context
    return axonflow.protect(
      async () => {
        return originalSend(command);
      },
      { provider: 'bedrock', model: modelId, query: prompt }
    );
  };

  return bedrockClient;
}

/**
 * Creates a governed Bedrock invoke function with full governance flow.
 *
 * Use this for fine-grained control with pre-check and audit.
 */
export function createGovernedBedrockInvoke(
  bedrockClient: any,
  axonflow: any,
  userToken: string = ''
): (modelId: string, body: any) => Promise<any> {
  return async (modelId: string, body: any): Promise<any> => {
    // Extract prompt
    let prompt = '';
    if (body.messages) {
      prompt = body.messages
        .map((m: any) => (typeof m.content === 'string' ? m.content : m.content?.[0]?.text || ''))
        .join(' ');
    } else if (body.inputText) {
      prompt = body.inputText;
    }

    // Pre-check with AxonFlow
    const preCheck = await axonflow.getPolicyApprovedContext({
      userToken,
      query: prompt,
      context: {
        provider: 'bedrock',
        model: modelId,
      },
    });

    if (!preCheck.approved) {
      throw new Error(`Request blocked by policy: ${preCheck.blockReason}`);
    }

    // Execute the call
    const startTime = Date.now();

    // Dynamically import to avoid requiring AWS SDK as a dependency
    const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const command = new InvokeModelCommand({
      modelId,
      body: JSON.stringify(body),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const response = await bedrockClient.send(command);
    const latencyMs = Date.now() - startTime;

    // Parse response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Audit the call
    if (preCheck.contextId) {
      let summary = '';
      let promptTokens = 0;
      let completionTokens = 0;

      if (responseBody.content) {
        // Claude response
        summary = responseBody.content[0]?.text?.substring(0, 200) || '';
        promptTokens = responseBody.usage?.input_tokens || 0;
        completionTokens = responseBody.usage?.output_tokens || 0;
      } else if (responseBody.results) {
        // Titan response
        summary = responseBody.results[0]?.outputText?.substring(0, 200) || '';
        promptTokens = responseBody.inputTextTokenCount || 0;
        completionTokens = responseBody.results[0]?.tokenCount || 0;
      }

      await axonflow.auditLLMCall(
        preCheck.contextId,
        summary,
        'bedrock',
        modelId,
        {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs
      );
    }

    return responseBody;
  };
}
