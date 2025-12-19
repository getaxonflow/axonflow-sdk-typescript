import { BaseInterceptor } from './base';
import { AIRequest } from '../types';

/**
 * Interceptor for Anthropic Claude API calls
 */
export class AnthropicInterceptor extends BaseInterceptor {
  canHandle(aiCall: any): boolean {
    // Check if this looks like an Anthropic call
    const callString = aiCall.toString();
    return (
      callString.includes('anthropic') ||
      callString.includes('claude') ||
      callString.includes('messages.create')
    );
  }

  extractRequest(aiCall: any): AIRequest {
    // Try to extract Anthropic-specific details
    const callString = aiCall.toString();

    // Try to detect model
    let model = 'unknown';
    if (callString.includes('claude-3')) {
      model = 'claude-3';
    } else if (callString.includes('claude-2')) {
      model = 'claude-2';
    }

    return {
      provider: 'anthropic',
      model,
      prompt: callString,
      parameters: {
        // Would extract max_tokens, temperature, etc. in production
      },
    };
  }

  executeWithModifications(aiCall: any, _modifications: any): Promise<any> {
    // Execute the call with any modifications from governance
    return aiCall();
  }

  getProvider(): string {
    return 'anthropic';
  }
}

/**
 * Helper to wrap Anthropic client for easier interception
 *
 * @deprecated This function is deprecated and will be removed in v2.0.0.
 * Modern Anthropic SDK versions use private class fields that are incompatible
 * with JavaScript Proxy-based wrapping.
 *
 * Use Gateway Mode or Proxy Mode instead:
 *
 * Gateway Mode (recommended):
 * ```typescript
 * const context = await axonflow.getPolicyApprovedContext({ query, userToken });
 * const response = await anthropic.messages.create({ ... });
 * await axonflow.auditLLMCall({ contextId: context.contextId, ... });
 * ```
 *
 * Proxy Mode:
 * ```typescript
 * const response = await axonflow.executeQuery({
 *   query,
 *   userToken,
 *   context: { provider: 'anthropic', model: 'claude-3-sonnet' }
 * });
 * ```
 *
 * See: https://docs.getaxonflow.com/sdk/gateway-mode
 */
export function wrapAnthropicClient(anthropicClient: any, axonflow: any): any {
  console.warn(
    '[AxonFlow] wrapAnthropicClient is deprecated and will be removed in v2.0.0. ' +
      'Use Gateway Mode (getPolicyApprovedContext + auditLLMCall) or Proxy Mode (executeQuery) instead. ' +
      'See: https://docs.getaxonflow.com/sdk/gateway-mode'
  );
  // Create a proxy that intercepts method calls
  return new Proxy(anthropicClient, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // If it's the messages object
      if (prop === 'messages' && typeof original === 'object') {
        return new Proxy(original, {
          get(messagesTarget, messagesProp) {
            const messagesOriginal = Reflect.get(messagesTarget, messagesProp);

            // If it's the create method
            if (messagesProp === 'create' && typeof messagesOriginal === 'function') {
              return async (...args: any[]) => {
                // Protect the call with AxonFlow
                return axonflow.protect(() => messagesOriginal.apply(messagesTarget, args));
              };
            }

            return messagesOriginal;
          },
        });
      }

      return original;
    },
  });
}
