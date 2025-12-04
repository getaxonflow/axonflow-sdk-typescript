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
export { wrapOpenAIClient } from './interceptors/openai';
export { wrapAnthropicClient } from './interceptors/anthropic';

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
  AuditOptions
} from './types';

// Export version
export const VERSION = '1.2.0';

// Default export for convenience
import { AxonFlow } from './client';
export default AxonFlow;