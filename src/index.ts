/**
 * AxonFlow SDK - Invisible AI Governance Layer
 *
 * Add enterprise-grade governance to your AI applications with just 3 lines of code.
 * No UI changes. No user training. Just drop-in protection.
 *
 * @example
 * ```typescript
 * import { AxonFlow } from '@axonflow/sdk';
 *
 * const axonflow = new AxonFlow({ apiKey: 'your-key' });
 * const response = await axonflow.protect(() => openai.complete(prompt));
 * ```
 */

export { AxonFlow } from './client';

// LLM Interceptor Wrappers (DEPRECATED - use Gateway Mode or Proxy Mode instead)
// These will be removed in v2.0.0. See: https://docs.getaxonflow.com/sdk/gateway-mode
/** @deprecated Use Gateway Mode or Proxy Mode instead */
export { wrapOpenAIClient } from './interceptors/openai';
/** @deprecated Use Gateway Mode or Proxy Mode instead */
export { wrapAnthropicClient } from './interceptors/anthropic';
/** @deprecated Use Gateway Mode or Proxy Mode instead */
export { wrapGeminiModel } from './interceptors/gemini';
/** @deprecated Use Gateway Mode or Proxy Mode instead */
export { wrapOllamaClient } from './interceptors/ollama';
/** @deprecated Use Gateway Mode or Proxy Mode instead */
export { wrapBedrockClient } from './interceptors/bedrock';

// Export error classes for proper error handling
export {
  AxonFlowError,
  PolicyViolationError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  APIError,
} from './errors';

// Export types for TypeScript users
export type {
  AxonFlowConfig,
  AIRequest,
  GovernanceRequest,
  GovernanceResponse,
  PolicyDecision,
  Violation,
  Policy,
  PolicyRule,
  // Gateway Mode types
  TokenUsage,
  RateLimitInfo,
  PolicyApprovalResult,
  PolicyApprovalOptions,
  AuditResult,
  AuditOptions,
  // Proxy Mode types
  RequestType,
  ExecuteQueryOptions,
  ExecuteQueryResponse,
  PolicyInfo,
  HealthStatus,
} from './types';

// Export version
export const VERSION = '1.4.0';

// Default export for convenience
import { AxonFlow } from './client';
export default AxonFlow;
