import { BaseInterceptor } from './base';
import { AIRequest } from '../types';

/**
 * Interceptor for Ollama API calls
 *
 * Ollama is a local LLM server that runs on localhost:11434 by default.
 * No authentication is required.
 *
 * @example
 * ```typescript
 * import { AxonFlow, wrapOllamaClient } from '@axonflow/sdk';
 * import Ollama from 'ollama';
 *
 * const ollama = new Ollama({ host: 'http://localhost:11434' });
 * const axonflow = new AxonFlow({ endpoint: 'http://localhost:8080' });
 *
 * const wrapped = wrapOllamaClient(ollama, axonflow);
 * const response = await wrapped.chat({
 *   model: 'llama2',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class OllamaInterceptor extends BaseInterceptor {
  canHandle(aiCall: any): boolean {
    const callString = aiCall.toString();
    return (
      callString.includes('ollama') ||
      callString.includes('llama') ||
      callString.includes('mistral') ||
      callString.includes('codellama') ||
      callString.includes('localhost:11434')
    );
  }

  extractRequest(aiCall: any): AIRequest {
    const callString = aiCall.toString();

    let model = 'llama2';
    if (callString.includes('mistral')) {
      model = 'mistral';
    } else if (callString.includes('codellama')) {
      model = 'codellama';
    } else if (callString.includes('llama3')) {
      model = 'llama3';
    }

    return {
      provider: 'ollama',
      model,
      prompt: callString,
      parameters: {},
    };
  }

  executeWithModifications(aiCall: any, _modifications: any): Promise<any> {
    return aiCall();
  }

  getProvider(): string {
    return 'ollama';
  }
}

/**
 * Ollama chat message
 */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

/**
 * Ollama chat request
 */
export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Ollama chat response
 */
export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama generate request (for completions)
 */
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Ollama generate response
 */
export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Wraps an Ollama client with AxonFlow governance.
 *
 * @example
 * ```typescript
 * import Ollama from 'ollama';
 * import { AxonFlow, wrapOllamaClient } from '@axonflow/sdk';
 *
 * const ollama = new Ollama({ host: 'http://localhost:11434' });
 * const axonflow = new AxonFlow({ endpoint: 'http://localhost:8080' });
 *
 * const wrapped = wrapOllamaClient(ollama, axonflow);
 *
 * // Chat API
 * const chatResponse = await wrapped.chat({
 *   model: 'llama2',
 *   messages: [{ role: 'user', content: 'What is AI governance?' }]
 * });
 *
 * // Generate API
 * const genResponse = await wrapped.generate({
 *   model: 'llama2',
 *   prompt: 'What is AI governance?'
 * });
 * ```
 */
export function wrapOllamaClient(ollamaClient: any, axonflow: any): any {
  return new Proxy(ollamaClient, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // Intercept chat and generate methods
      if (typeof original === 'function' && ['chat', 'generate'].includes(prop.toString())) {
        return async (...args: any[]) => {
          return axonflow.protect(() => original.apply(target, args));
        };
      }

      return original;
    },
  });
}

/**
 * Creates a governed Ollama chat function.
 *
 * Use this when you want fine-grained control over individual calls
 * rather than wrapping the entire client.
 *
 * @example
 * ```typescript
 * const governedChat = createGovernedOllamaChat(ollamaClient, axonflow, 'user-123');
 * const response = await governedChat({
 *   model: 'llama2',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export function createGovernedOllamaChat(
  ollamaClient: any,
  axonflow: any,
  userToken: string = ''
): (request: OllamaChatRequest) => Promise<OllamaChatResponse> {
  return async (request: OllamaChatRequest): Promise<OllamaChatResponse> => {
    // Extract prompt from messages
    const prompt = request.messages.map(m => m.content).join(' ');

    // Pre-check with AxonFlow
    const preCheck = await axonflow.getPolicyApprovedContext({
      userToken,
      query: prompt,
      context: {
        provider: 'ollama',
        model: request.model,
      },
    });

    if (!preCheck.approved) {
      throw new Error(`Request blocked by policy: ${preCheck.blockReason}`);
    }

    // Execute the call
    const startTime = Date.now();
    const response = await ollamaClient.chat(request);
    const latencyMs = Date.now() - startTime;

    // Audit the call
    if (preCheck.contextId) {
      await axonflow.auditLLMCall(
        preCheck.contextId,
        response.message?.content?.substring(0, 200) || '',
        'ollama',
        request.model,
        {
          promptTokens: response.prompt_eval_count || 0,
          completionTokens: response.eval_count || 0,
          totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        },
        latencyMs
      );
    }

    return response;
  };
}
