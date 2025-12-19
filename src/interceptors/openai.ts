import { BaseInterceptor } from './base';
import { AIRequest } from '../types';

/**
 * Interceptor for OpenAI API calls
 */
export class OpenAIInterceptor extends BaseInterceptor {
  canHandle(aiCall: any): boolean {
    // Check if this looks like an OpenAI call
    const callString = aiCall.toString();
    return (
      callString.includes('openai') ||
      callString.includes('createCompletion') ||
      callString.includes('createChatCompletion') ||
      callString.includes('gpt')
    );
  }

  extractRequest(aiCall: any): AIRequest {
    // Try to extract OpenAI-specific details
    // This is simplified - in production, we'd use more sophisticated parsing
    const callString = aiCall.toString();

    // Try to detect model
    let model = 'unknown';
    if (callString.includes('gpt-4')) {
      model = 'gpt-4';
    } else if (callString.includes('gpt-3.5')) {
      model = 'gpt-3.5-turbo';
    }

    return {
      provider: 'openai',
      model,
      prompt: callString,
      parameters: {
        // Would extract temperature, max_tokens, etc. in production
      },
    };
  }

  executeWithModifications(aiCall: any, _modifications: any): Promise<any> {
    // Execute the call with any modifications from governance
    // In production, this would apply actual modifications
    return aiCall();
  }

  getProvider(): string {
    return 'openai';
  }
}

/**
 * Helper to wrap OpenAI client for easier interception
 *
 * @deprecated This function is deprecated and will be removed in v2.0.0.
 * Modern OpenAI SDK versions (v4+) use private class fields that are incompatible
 * with JavaScript Proxy-based wrapping.
 *
 * Use Gateway Mode or Proxy Mode instead:
 *
 * Gateway Mode (recommended):
 * ```typescript
 * const context = await axonflow.getPolicyApprovedContext({ query, userToken });
 * const response = await openai.chat.completions.create({ ... });
 * await axonflow.auditLLMCall({ contextId: context.contextId, ... });
 * ```
 *
 * Proxy Mode:
 * ```typescript
 * const response = await axonflow.executeQuery({
 *   query,
 *   userToken,
 *   context: { provider: 'openai', model: 'gpt-4' }
 * });
 * ```
 *
 * See: https://docs.getaxonflow.com/sdk/gateway-mode
 */
export function wrapOpenAIClient(openaiClient: any, axonflow: any): any {
  console.warn(
    '[AxonFlow] wrapOpenAIClient is deprecated and will be removed in v2.0.0. ' +
      'Use Gateway Mode (getPolicyApprovedContext + auditLLMCall) or Proxy Mode (executeQuery) instead. ' +
      'See: https://docs.getaxonflow.com/sdk/gateway-mode'
  );
  // Create a proxy that intercepts method calls
  return new Proxy(openaiClient, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // If it's a function that makes API calls
      if (
        typeof original === 'function' &&
        ['createCompletion', 'createChatCompletion', 'createEdit'].includes(prop.toString())
      ) {
        return async (...args: any[]) => {
          // Protect the call with AxonFlow
          return axonflow.protect(() => original.apply(target, args));
        };
      }

      // For nested objects (like openai.chat.completions)
      if (typeof original === 'object' && original !== null) {
        return wrapOpenAIClient(original, axonflow);
      }

      return original;
    },
  });
}
