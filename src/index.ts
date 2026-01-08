/**
 * AxonFlow SDK - Invisible AI Governance Layer
 *
 * Add enterprise-grade governance to your AI applications with just a few lines of code.
 * No UI changes. No user training. Just drop-in protection.
 *
 * @example Gateway Mode (recommended)
 * ```typescript
 * import { AxonFlow } from '@axonflow/sdk';
 * import OpenAI from 'openai';
 *
 * const axonflow = new AxonFlow({ clientId: 'your-client', clientSecret: 'your-secret', endpoint: 'http://localhost:8080' });
 * const openai = new OpenAI();
 *
 * // 1. Pre-check policies
 * const ctx = await axonflow.getPolicyApprovedContext({
 *   userToken: 'user-123',
 *   query: 'What is the capital of France?'
 * });
 *
 * if (!ctx.approved) {
 *   throw new Error(`Blocked: ${ctx.blockReason}`);
 * }
 *
 * // 2. Make your own LLM call
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'What is the capital of France?' }]
 * });
 *
 * // 3. Audit the call
 * await axonflow.auditLLMCall({
 *   contextId: ctx.contextId,
 *   responseSummary: response.choices[0].message.content,
 *   provider: 'openai',
 *   model: 'gpt-4',
 *   tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
 *   latencyMs: 250
 * });
 * ```
 *
 * @example Proxy Mode
 * ```typescript
 * const response = await axonflow.executeQuery({
 *   userToken: 'user-123',
 *   query: 'What is the capital of France?',
 *   requestType: 'chat'
 * });
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
  ConfigurationError,
  ConnectionError,
  ConnectorError,
  PlanExecutionError,
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
  CodeArtifact,
  HealthStatus,
} from './types';

// Export policy types
export type {
  PolicyCategory,
  PolicyTier,
  PolicyAction,
  PolicySeverity,
  OverrideAction,
  StaticPolicy,
  CreateStaticPolicyRequest,
  UpdateStaticPolicyRequest,
  ListStaticPoliciesOptions,
  PolicyOverride,
  CreatePolicyOverrideRequest,
  DynamicPolicy,
  DynamicPolicyAction,
  DynamicPolicyCondition,
  CreateDynamicPolicyRequest,
  UpdateDynamicPolicyRequest,
  ListDynamicPoliciesOptions,
  TestPatternResult,
  TestPatternMatch,
  PolicyVersion,
  EffectivePoliciesOptions,
} from './types/policies';

// Export Code Governance types (Enterprise)
export type {
  GitProviderType,
  FileAction,
  CodeFile,
  ConfigureGitProviderRequest,
  ConfigureGitProviderResponse,
  ValidateGitProviderRequest,
  ValidateGitProviderResponse,
  GitProviderInfo,
  ListGitProvidersResponse,
  CreatePRRequest,
  CreatePRResponse,
  PRRecord,
  ListPRsOptions,
  ListPRsResponse,
} from './types/code-governance';

// Export Execution Replay types
export type {
  ExecutionSummary,
  ExecutionSnapshot,
  TimelineEntry,
  ExecutionDetail,
  ListExecutionsResponse,
  ListExecutionsOptions,
  ExecutionExportOptions,
} from './types/execution-replay';

// Export Cost Controls types
export type {
  BudgetScope,
  BudgetPeriod,
  BudgetOnExceed,
  CreateBudgetRequest,
  UpdateBudgetRequest,
  ListBudgetsOptions,
  Budget,
  BudgetsResponse,
  BudgetStatus,
  BudgetAlert,
  BudgetAlertsResponse,
  BudgetCheckRequest,
  BudgetDecision,
  UsageSummary,
  UsageBreakdownItem,
  UsageBreakdown,
  ListUsageRecordsOptions,
  UsageRecord,
  UsageRecordsResponse,
  ModelPricing,
  PricingInfo,
  PricingListResponse,
} from './types/cost-controls';

// Export version
export const VERSION = '3.0.0';

// Default export for convenience
import { AxonFlow } from './client';
export default AxonFlow;
