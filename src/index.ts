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
 * const response = await axonflow.proxyLLMCall({
 *   userToken: 'user-123',
 *   query: 'What is the capital of France?',
 *   requestType: 'chat'
 * });
 * ```
 */

export { AxonFlow } from './client';

// Export connector utilities
export { wasRedacted } from './types/connector';

// Export MCP connector types
export type {
  ConnectorResponse,
  ConnectorMetadata,
  ConnectorInstallRequest,
  PolicyMatchInfo,
  DynamicPolicyInfo,
  DynamicPolicyMatch,
  ConnectorHealthStatus,
  MCPPolicyInfo,
  ExfiltrationCheckInfo,
  MCPCheckInputOptions,
  MCPCheckInputResponse,
  MCPCheckOutputOptions,
  MCPCheckOutputResponse,
} from './types/connector';

// Export error classes for proper error handling
export {
  AxonFlowError,
  ConfigurationError,
  ConnectionError,
  ConnectorError,
  PlanExecutionError,
  VersionConflictError,
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
  // Audit Log Read types
  AuditSearchRequest,
  AuditQueryOptions,
  AuditLogEntry,
  AuditSearchResponse,
  // Audit Tool Call types
  AuditToolCallRequest,
  AuditToolCallResponse,
  // Proxy Mode types
  RequestType,
  PolicyInfo,
  CodeArtifact,
  HealthStatus,
  PlatformCapability,
  SDKCompatibility,
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
  EffectivePoliciesResponse,
  PaginatedResponse,
} from './types/policies';
export {
  CATEGORY_MEDIA_SAFETY,
  CATEGORY_MEDIA_BIOMETRIC,
  CATEGORY_MEDIA_DOCUMENT,
  CATEGORY_MEDIA_PII,
} from './types/policies';

// Export MAP (Multi-Agent Planning) types
export type {
  PlanStep,
  PlanResponse,
  PlanExecutionResponse,
  PlanExecutionStatus,
  PolicyMatch,
  PolicyEvaluationResult,
  ExecutionMode,
  GeneratePlanOptions,
  CancelPlanResponse,
  UpdatePlanRequest,
  UpdatePlanResponse,
  PlanVersionEntry,
  PlanVersionsResponse,
  ResumePlanResponse,
  RollbackPlanResponse,
} from './types/planning';

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
  CodeGovernanceMetrics,
  ExportOptions,
  ExportResponse,
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

// Export Workflow Control Plane types
export type {
  WorkflowStatus,
  WorkflowSource,
  GateDecision,
  ApprovalStatus,
  StepType,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  StepGateRequest,
  StepGateResponse,
  WorkflowStepInfo,
  WorkflowStatusResponse,
  ListWorkflowsOptions,
  ListWorkflowsResponse,
  AbortWorkflowRequest,
  FailWorkflowRequest,
  MarkStepCompletedRequest,
  // WCP Approval types (Feature 5)
  ApproveStepResponse,
  RejectStepResponse,
  PendingApproval,
  PendingApprovalsResponse,
  PendingApprovalsOptions,
  // Webhook CRUD types (Feature 7)
  CreateWebhookRequest,
  WebhookSubscription,
  UpdateWebhookRequest,
  ListWebhooksResponse,
  // Tool governance types
  ToolContext,
} from './types/workflows';
export { WorkflowHelpers } from './types/workflows';

// Export LangGraph adapter
export {
  AxonFlowLangGraphAdapter,
  WorkflowBlockedError,
  WorkflowApprovalRequiredError,
} from './adapters/langgraph';
export type { MCPInterceptorOptions, LangGraphAdapterOptions } from './adapters/langgraph';

// Export Media Governance types
export type {
  MediaContent,
  MediaAnalysisResult,
  MediaAnalysisResponse,
  MediaGovernanceConfig,
  MediaGovernanceStatus,
  UpdateMediaGovernanceConfigRequest,
} from './types/media';

// Export HITL Queue types (Enterprise)
export type {
  HITLApprovalRequest,
  HITLQueueListOptions,
  HITLQueueListResponse,
  HITLReviewInput,
  HITLStats,
} from './types/hitl';

// Export Unified Execution types (Issue #1075 - EPIC #1074)
export type {
  ExecutionType,
  ExecutionStatusValue,
  StepStatusValue,
  UnifiedStepType,
  UnifiedGateDecision,
  UnifiedApprovalStatus,
  UnifiedStepStatus,
  ExecutionStatus,
  UnifiedListExecutionsRequest,
  UnifiedListExecutionsResponse,
  StreamExecutionStatusOptions,
} from './types/execution';
export { ExecutionHelpers } from './types/execution';

// Export config types
export type { RetryConfig, CacheConfig } from './types/config';

// Export proxy types
export type { BudgetInfo } from './types/proxy';

// Export MAS FEAT Compliance types (Enterprise)
export type {
  MaterialityClassification,
  SystemStatus,
  FEATAssessmentStatus,
  KillSwitchStatus,
  FEATPillar,
  AISystemUseCase,
  KillSwitchEventType,
  FindingSeverity,
  FindingStatus,
  Finding,
  AISystemRegistry,
  RegistrySummary,
  RegisterSystemRequest,
  UpdateSystemRequest,
  ListSystemsOptions,
  FEATAssessment,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
  ApproveAssessmentRequest,
  RejectAssessmentRequest,
  ListAssessmentsOptions,
  KillSwitch,
  KillSwitchEvent,
  ConfigureKillSwitchRequest,
  CheckKillSwitchRequest,
  TriggerKillSwitchRequest,
  RestoreKillSwitchRequest,
  DisableKillSwitchRequest,
} from './types/masfeat';

// Export version
export { VERSION } from './version';

// Default export for convenience
import { AxonFlow } from './client';
export default AxonFlow;
