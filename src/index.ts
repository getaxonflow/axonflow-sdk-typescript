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

// Read-path per-user identity and the platform's read-scope contract (#2922).
export { HEADER_READ_SCOPE, HEADER_USER_TOKEN, ReadScope, ReadScopeError } from './read-identity';
export type { ReadIdentityOptions } from './read-identity';

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
  // v6.0.0: `PolicyInfo` exported from connector.ts is the OpenAPI
  // `PolicyInfo` (MCP shape). The proxy-mode shape is `ProxyPolicyInfo`
  // (exported below). `MCPPolicyInfo` kept as a type alias for one
  // major-version migration window.
  PolicyInfo,
  MCPPolicyInfo,
  ExfiltrationCheckInfo,
  MCPCheckInputOptions,
  MCPCheckInputResponse,
  MCPCheckOutputOptions,
  MCPCheckOutputResponse,
  // v6.1.0: per-policy explainability record on MCP responses
  // (snake_case wire shape). Distinct from the camelCase ExplainPolicy
  // in `./types/decisions` which is the hand-decoded view returned by
  // client.explainDecision().
  MCPExplainPolicy,
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
  IdempotencyKeyMismatchError,
  APIError,
  ObligationNotFulfillableError,
} from './errors';
export type { UpgradeInfo } from './errors';

// Export Decision Mode PEP contract: decide -> fulfill -> forward
// (ADR-056, epic #2563). Types, constants, and the pure helpers a PEP uses
// to branch on a verdict before fulfilling.
export {
  OBLIGATION_REDACT_PII,
  PHASE_REQUEST,
  PHASE_RESPONSE,
  CONTENT_TYPE_TEXT,
  VERDICT_ALLOW,
  VERDICT_DENY,
  VERDICT_NEEDS_APPROVAL,
  REQUEST_REDACTION_PATH,
  RESPONSE_REDACTION_PATH,
  DECIDE_PATH,
  hasRequestRedaction,
  endpointPathMatches,
} from './pep';
export type {
  DecideRequest,
  DecideResponse,
  Obligation,
  ObligationFulfillment,
  DecisionCallerIdentity,
  DecisionTarget,
} from './pep';

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
  // Cross-border transfer basis (UU PDP Pasal 56)
  TransferBasis,
  // Audit Tool Call types
  AuditToolCallRequest,
  AuditToolCallResponse,
  // Circuit Breaker types
  CircuitBreakerCircuit,
  CircuitBreakerStatusResponse,
  CircuitBreakerHistoryEntry,
  CircuitBreakerHistoryResponse,
  CircuitBreakerConfig,
  CircuitBreakerConfigUpdate,
  // Proxy Mode types
  RequestType,
  // v6.0.0: this is the proxy-mode shape, renamed from `PolicyInfo`.
  // The OpenAPI `PolicyInfo` (MCP shape) is now exported from the
  // connector group above; `PolicyInfoLegacyProxyShape` is a kept-
  // for-back-compat alias of `ProxyPolicyInfo` removed in v7.
  ProxyPolicyInfo,
  PolicyInfoLegacyProxyShape,
  CodeArtifact,
  HealthStatus,
  PlatformCapability,
  SDKCompatibility,
  // ADR-043 explainability + Session γ list_decisions (#1982)
  DecisionExplanation,
  ExplainPolicy,
  ExplainRule,
  DecisionSummary,
  ListDecisionsOptions,
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
  StepGateOptions,
  RetryContext,
  PriorCompletionStatus,
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

// Export GovernedTool adapter (framework-agnostic tool governance)
export { GovernedTool, governTools } from './adapters/governed-tool';
export type { ToolDefinition, GovernedToolOptions } from './adapters/governed-tool';

// Export LangGraph adapter
export {
  AxonFlowLangGraphAdapter,
  WorkflowBlockedError,
  WorkflowApprovalRequiredError,
} from './adapters/langgraph';
export type {
  MCPInterceptorOptions,
  LangGraphAdapterOptions,
  CheckGateOptions,
  CheckToolGateOptions,
  StepCompletedOptions,
  ToolCompletedOptions,
  WaitForApprovalOptions,
} from './adapters/langgraph';

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
  HITLCreateInput,
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

// Export Policy Simulation types (Evaluation Tier+)
export type {
  SimulatePoliciesRequest,
  SimulationDailyUsage,
  SimulatePoliciesResponse,
  ImpactReportInput,
  ImpactReportRequest,
  ImpactReportResult,
  ImpactReportResponse,
  PolicyConflictRef,
  PolicyConflict,
  PolicyConflictResponse,
} from './types/simulation';

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

// AuthZEN-native authorization (ADR-065).
//
// The wire types, enum constants and runtime validators are GENERATED from the
// platform's canonical surface artifact (scripts/gen-authzen-types/generate.js)
// and re-exported as a whole rather than name by name: a hand-maintained list
// would be a second transcription of the artifact — exactly the drift the
// generator exists to prevent — and it would silently leave a newly-added error
// code unreachable from '@axonflow/sdk' while four other SDKs had it.
export * from './types/authzen.gen';

// The hand-written half: the tri-state attribute, the decision readings, the
// two error classes and the envelope helpers.
export {
  AUTHZEN_ATTRIBUTE_MARKER,
  AUTHZEN_PATH,
  AUTHZEN_PROFILE_HEADER,
  AUTHZEN_UNKNOWN_CLOSURE_TRUNCATED,
  AUTHZEN_UNKNOWN_CLOSURE_UNAVAILABLE,
  AUTHZEN_UNKNOWN_MALFORMED_VALUE,
  AUTHZEN_UNKNOWN_NOT_SUPPLIED,
  AUTHZEN_UNKNOWN_REQUIRED_ABSENT,
  AUTHZEN_UNKNOWN_RESOLUTION_FAILED,
  AUTHZEN_UNKNOWN_SCHEMA_MISMATCH,
  AUTHZEN_UNKNOWN_STALE,
  AuthZENAttribute,
  AuthZENDecision,
  AuthZENProtocolError,
  AuthZENRefusal,
  buildEnvelope,
  toWire,
} from './authzen';
export type { AuthZENAttributeState, AuthZENRefusedBy, AuthZENTransport } from './authzen';

// Export community SaaS registration helper
export { registerTry } from './community';
export type { TryRegistration } from './community';

// Export version
export { VERSION } from './version';

// Default export for convenience
import { AxonFlow } from './client';
export default AxonFlow;
