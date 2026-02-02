# Changelog

All notable changes to the AxonFlow TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

**Note:** npm releases temporarily delayed. Latest: v3.0.0 (source) vs v2.3.0 (npm). [Install from source](https://github.com/getaxonflow/axonflow-sdk-typescript#install-from-source) for latest features.

---

## [3.0.0] - Unreleased

### Breaking Changes

- **Removed `executeQuery()`**: Use `proxyLLMCall()` instead (deprecated since v2.7.0)
- **Removed deprecated interceptors**: `wrapOpenAIClient`, `wrapAnthropicClient`, `wrapGeminiModel`, `wrapOllamaClient`, `wrapBedrockClient` (all deprecated since v2.0.0). Entire `src/interceptors/` directory removed.
- **Removed `ExecuteQueryOptions` and `ExecuteQueryResponse` from public API**: Types kept internally for `proxyLLMCall()` but no longer exported from package index

### Added

- **`wasRedacted()` helper**: Convenience method on `ConnectorResponse` to check if any fields were redacted by PII policies

- **Unified Execution Tracking** (Issue #1075 - EPIC #1074): Consistent status tracking for MAP plans and WCP workflows
  - `getExecutionStatus(executionId)` - Get unified execution status by ID
  - `listUnifiedExecutions(options)` - List executions with type/status filters
  - `ExecutionStatus` type with unified fields for both MAP and WCP executions
  - `ExecutionType` enum: `map_plan`, `wcp_workflow`
  - `ExecutionStatusValue` enum: `pending`, `running`, `completed`, `failed`, `cancelled`, `aborted`, `expired`
  - `StepStatusValue` enum: `pending`, `running`, `completed`, `failed`, `skipped`, `blocked`, `approval`
  - `UnifiedStepType` enum: `llm_call`, `tool_call`, `connector_call`, `human_task`, `synthesis`, `action`, `gate`
  - `UnifiedStepStatus` type with step-level details (duration, cost, policy decisions)
  - `ExecutionHelpers` utilities: `isTerminal()`, `isStepTerminal()`, `isStepBlocking()`, `calculateProgress()`, `getCurrentStep()`, `calculateTotalCost()`, `isMapPlan()`, `isWcpWorkflow()`
  - Consistent response format across MAP Multi-Agent Planning and WCP Workflow Control Plane

- **MAS FEAT Compliance Module** (Enterprise): Singapore financial services AI governance
  - AI System Registry: `masfeat.registerSystem()`, `masfeat.getSystem()`, `masfeat.updateSystem()`, `masfeat.listSystems()`, `masfeat.activateSystem()`, `masfeat.retireSystem()`, `masfeat.getRegistrySummary()`
  - 3-Dimensional Risk Rating: Customer Impact × Model Complexity × Human Reliance
  - Materiality Classification: High (sum≥12), Medium (sum≥8), Low (sum<8)
  - FEAT Assessments: `masfeat.createAssessment()`, `masfeat.getAssessment()`, `masfeat.updateAssessment()`, `masfeat.listAssessments()`, `masfeat.submitAssessment()`, `masfeat.approveAssessment()`, `masfeat.rejectAssessment()`
  - Assessment Lifecycle: pending → in_progress → completed → approved/rejected
  - Kill Switch: `masfeat.getKillSwitch()`, `masfeat.configureKillSwitch()`, `masfeat.checkKillSwitch()`, `masfeat.triggerKillSwitch()`, `masfeat.restoreKillSwitch()`, `masfeat.enableKillSwitch()`, `masfeat.disableKillSwitch()`, `masfeat.getKillSwitchHistory()`
  - Automatic model shutdown based on accuracy, bias, and error rate thresholds
  - New types: `AISystemRegistry`, `AISystemUseCase`, `MaterialityClassification`, `SystemStatus`, `FEATAssessment`, `FEATAssessmentStatus`, `FEATPillar`, `KillSwitch`, `KillSwitchStatus`, `KillSwitchEvent`, `KillSwitchEventType`, `RegistrySummary`

- **Workflow Control Plane** (Issue #834): Governance gates for external orchestrators
  - "LangChain runs the workflow. AxonFlow decides when it's allowed to move forward."
  - `createWorkflow()` - Register workflows from LangChain/LangGraph/CrewAI/external
  - `stepGate()` - Check if step is allowed to proceed (allow/block/require_approval)
  - `markStepCompleted()` - Mark a step as completed with optional output data
  - `getWorkflow()` - Get workflow status and step history
  - `listWorkflows()` - List workflows with filters (status, source, pagination)
  - `completeWorkflow()` - Mark workflow as completed
  - `abortWorkflow()` - Abort workflow with reason
  - `resumeWorkflow()` - Resume after approval
  - New types: `WorkflowStatus`, `WorkflowSource`, `GateDecision`, `StepType`, `ApprovalStatus`, `MarkStepCompletedRequest`
  - Helper utilities in `WorkflowHelpers`: `isAllowed()`, `isBlocked()`, `requiresApproval()` (gate decisions)
  - Helper utilities in `WorkflowHelpers`: `isTerminal()` (workflow status)

- **Workflow Policy Enforcement** (Issues #1019, #1020, #1021): Policy transparency for workflow operations
  - `StepGateResponse` now includes `policiesEvaluated` and `policiesMatched` fields with `PolicyMatch` type
  - `PolicyMatch` interface with `policy_id`, `policy_name`, `action`, `reason` for policy transparency
  - `PolicyEvaluationResult` interface for MAP execution with `allowed`, `applied_policies`, `risk_score`
  - Workflow operations (`workflow_created`, `workflow_step_gate`, `workflow_completed`) logged to audit trail

- **MCP Exfiltration Detection** (Issue #966): `MCPPolicyInfo` now includes `exfiltration_check` with row/volume limit information
  - `ExfiltrationCheckInfo` type with `rows_returned`, `row_limit`, `bytes_returned`, `byte_limit`, `within_limits` fields
  - Prevents large-scale data extraction via MCP queries
  - Configurable via `MCP_MAX_ROWS_PER_QUERY` and `MCP_MAX_BYTES_PER_QUERY` environment variables

- **MCP Dynamic Policies** (Issue #968): `MCPPolicyInfo` now includes `dynamic_policy_info` for Orchestrator-evaluated policies
  - `DynamicPolicyInfo` type with `policies_evaluated`, `matched_policies`, `orchestrator_reachable`, `processing_time_ms`
  - `DynamicPolicyMatch` type with `policy_id`, `policy_name`, `policy_type`, `action`, `reason`
  - Supports rate limiting, budget controls, time-based access, and role-based access policies
  - Optional feature - enable via `MCP_DYNAMIC_POLICIES_ENABLED=true`

- **proxyLLMCall()**: New primary method for Proxy Mode with improved documentation
  - Clearly describes Proxy Mode behavior (AxonFlow makes the LLM call on your behalf)
  - Documents when to use Proxy Mode vs Gateway Mode

- **BudgetInfo**: `QueryResponse.budgetInfo` for budget enforcement (HTTP 402)

- **Analytics**: Added optional install analytics via Scarf (opt-out: `SCARF_NO_ANALYTICS=1`)

### Changed

- Updated all internal references and examples from `executeQuery` to `proxyLLMCall`
- **Gateway Mode smart defaults**: `getPolicyApprovedContext()` and `auditLLMCall()` now use `"community"` as default clientId when not configured, enabling zero-config usage for community/self-hosted deployments

### Fixed

- **Gateway Mode smart defaults**: Fixed fallback to `"community"` when no clientId is configured - previously defaulted to `"default"` due to tenant default value
- **PolicyCategory**: Added `pii-singapore` to PolicyCategory type for Singapore PII detection policies (NRIC, FIN, UEN patterns)

---

## [2.3.0] - 2026-01-09

### Added

- **MCP Policy Enforcement Response Fields**: `mcpQuery()` and `mcpExecute()` now return policy enforcement metadata
  - `redacted: boolean` - Whether any fields were redacted by PII policies
  - `redacted_fields: string[]` - JSON paths of redacted fields (e.g., `rows[0].ssn`)
  - `policy_info: PolicyInfo` - Full policy evaluation metadata

- **PolicyInfo types**: New types for policy enforcement metadata
  - `PolicyInfo` - Contains `policies_evaluated`, `blocked`, `block_reason`, `redactions_applied`, `processing_time_ms`, `matched_policies`
  - `PolicyMatchInfo` - Details of matched policies including `policy_id`, `policy_name`, `category`, `severity`, `action`

---

## [2.2.0] - 2026-01-08

### Added

- **OAuth2-style client credentials**: New `clientId` and `clientSecret` configuration options following OAuth2 client credentials pattern.
  - `clientId` is used for request identification (required for most API calls)
  - `clientSecret` is optional - community/self-hosted deployments work without it
  - The old `tenant` field still works as a fallback for `clientId`

- **Improved error types**: Added `ConnectorError` and `PlanExecutionError` classes for better error handling in connector and MAP operations.

- **Enterprise: Close PR** (`closePR`): Close a PR without merging and optionally delete the branch
  - Useful for cleaning up test/demo PRs created by code governance examples
  - Supports all providers: GitHub, GitLab, Bitbucket
  - Requires enterprise portal authentication

### Changed

- **Simplified authentication**: For community mode, simply provide `clientId` for request identification. No `clientSecret` needed.

```typescript
// Community mode - no secret needed
const client = new AxonFlow({
  endpoint: 'http://localhost:8080',
  clientId: 'my-app',  // Used for request identification
});
```

### Fixed

- **getPlanStatus endpoint**: Fixed endpoint path from `/api/plans/{id}` to `/api/v1/plan/{id}` to match orchestrator API

### Enterprise

- OAuth2 Basic auth: `Authorization: Basic base64(clientId:clientSecret)` replaces `X-License-Key` header
- Removed `licenseKey` and `apiKey` configuration options (use `clientId`/`clientSecret`)

---

## [2.1.0] - 2026-01-05

### Added

- **Sensitive Data Category**: Added `'sensitive-data'` to `PolicyCategory` type union for policies that return `sensitive-data` category
- **Provider Restrictions for Compliance**: Support for `allowed_providers` in dynamic policy action config
  - Specify allowed providers via `actions: [{ type: 'route', config: { allowed_providers: [...] } }]`
  - Enables GDPR, HIPAA, and RBI compliance by restricting LLM routing to specific providers
- **Category field**: Added `category` field to `CreateDynamicPolicyRequest` and `UpdateDynamicPolicyRequest`

### Fixed

- **toggleDynamicPolicy HTTP Method**: Changed from PATCH to PUT to match API specification
- **Tenant Header Name**: Changed header from `X-Tenant-ID` to `X-Org-ID` to match API specification
- **PolicyVersion timestamp parsing**: Fixed `getStaticPolicyVersions()` to correctly transform snake_case API fields (`changed_at`, `changed_by`, `change_type`) to camelCase interface fields
- **Dynamic Policy Response Parsing**: Fixed all dynamic policy methods to correctly parse wrapped API responses (Issue #886)
  - Agent proxy returns `{"policies": [...]}` and `{"policy": {...}}` wrappers
  - Updated `listDynamicPolicies`, `getDynamicPolicy`, `createDynamicPolicy`, `updateDynamicPolicy`, `toggleDynamicPolicy`, `getEffectiveDynamicPolicies`
  - Added fallback handling for both wrapped and unwrapped responses

## [2.0.0] - 2026-01-05

### Breaking Changes

- **BREAKING**: Removed `orchestratorEndpoint` and `portalEndpoint` config options (Agent now proxies all routes per ADR-026)
- **BREAKING**: Dynamic policy API path changed from `/api/v1/policies/dynamic` to `/api/v1/dynamic-policies`

### Added

- **Audit Log Reading**: Added `searchAuditLogs()` for searching audit logs with filters (user email, client ID, time range, request type)
- **Tenant Audit Logs**: Added `getAuditLogsByTenant()` for retrieving audit logs scoped to a specific tenant
- **Audit Types**: Added `AuditLogEntry`, `AuditSearchRequest`, `AuditQueryOptions`, and `AuditSearchResponse` types
- **PII Redaction Support**: Added `requiresRedaction` field to `PolicyApprovalResult` (Issue #891)
  - When `true`, PII was detected with redact action and response should be processed for redaction
  - Supports new detection defaults: PII defaults to redact instead of block

### Changed

- All SDK methods now route through single Agent endpoint
- Simplified configuration - only `endpoint` field needed
- Removed `getOrchestratorUrl()` and `getPortalUrl()` helper methods (now return endpoint directly)

### Migration Guide

**Before (v1.x):**
```typescript
const client = new AxonFlow({
  endpoint: 'http://localhost:8080',
  orchestratorEndpoint: 'http://localhost:8081',
  portalEndpoint: 'http://localhost:8082',
  apiKey: 'my-api-key',
});
```

**After (v2.x):**
```typescript
const client = new AxonFlow({
  endpoint: 'http://localhost:8080',
  apiKey: 'my-api-key',
});
```

---

## [1.14.0] - 2026-01-04

### Added

- **Portal Authentication**: Added `loginToPortal()` and `logoutFromPortal()` for session-based authentication
- **Portal URL Configuration**: New `portalUrl` config option for Code Governance portal endpoints
- **CSV Export**: Added `exportCodeGovernanceDataCsv()` for CSV format exports

### Fixed

- **Code Governance Authentication**: Changed Code Governance methods to use portal session-based auth instead of API key auth

---

## [1.13.0] - 2026-01-04

### Added

- **Get Connector**: `getConnector(id)` to retrieve details for a specific connector
- **Connector Health Check**: `getConnectorHealth(id)` to check health status of an installed connector
- **ConnectorHealthStatus type**: New type for connector health responses
- **Orchestrator Health Check**: `orchestratorHealthCheck()` to verify Orchestrator service health
- **Uninstall Connector**: `uninstallConnector()` to remove installed MCP connectors

### Fixed

- **Connector API Endpoints**: Fixed endpoints to use Orchestrator (port 8081) instead of Agent
  - `listConnectors()` - Changed from Agent `/api/connectors` to Orchestrator `/api/v1/connectors`
  - `installConnector()` - Fixed path to `/api/v1/connectors/{id}/install`
- **Dynamic Policies Endpoint**: Changed from Agent `/api/v1/policies` to Orchestrator `/api/v1/policies/dynamic`

---

## [1.12.0] - 2026-01-04

### Added

- **Execution Replay API**: Debug governed workflows with step-by-step state capture
  - `listExecutions()` - List executions with filtering (status, time range)
  - `getExecution()` - Get execution with all step snapshots
  - `getExecutionSteps()` - Get individual step snapshots
  - `getExecutionTimeline()` - Timeline view for visualization
  - `exportExecution()` - Export for compliance/archival
  - `deleteExecution()` - Delete execution records

- **Cost Controls**: Budget management and LLM usage tracking
  - `createBudget()` / `getBudget()` / `listBudgets()` - Budget CRUD
  - `updateBudget()` / `deleteBudget()` - Budget management
  - `getBudgetStatus()` - Check current budget usage
  - `checkBudget()` - Pre-request budget validation
  - `recordUsage()` - Record LLM token usage
  - `getUsageSummary()` - Usage analytics and reporting

---

## [1.11.1] - 2025-12-31

### Fixed

- **Gateway Mode Community Support**: `getPolicyApprovedContext()` and `auditLLMCall()` now work without credentials
  - Removed SDK-level credential check that blocked community mode usage
  - Server decides whether to require authentication based on `DEPLOYMENT_MODE`
  - Consistent with Go/Python SDKs behavior

---

## [1.11.0] - 2025-12-30

### Changed

- **Community Mode**: Credentials are now optional for self-hosted/community deployments
  - SDK can be initialized without `apiKey` or `licenseKey` for community features
  - `executeQuery()` and `healthCheck()` work without credentials
  - Auth headers are only sent when credentials are configured

### Added

- Enterprise features (`getPolicyApprovedContext`, `auditLLMCall`) now validate credentials at call time

### Fixed

- Gateway Mode methods now throw `AuthenticationError` when called without credentials

> **Note:** v1.11.0 credential validation for Gateway Mode was too restrictive for community deployments. Use v1.11.1 for full community mode support.

---

## [1.10.0] - 2025-12-30

### Fixed

- Fixed `PolicyOverride` interface to use correct field names (`policy_id`, `action_override`, `override_reason`)
- Fixed `listPolicyOverrides()` endpoint path
- Fixed response parsing for `getStaticPolicyVersions()`
- Fixed `createStaticPolicy()` to use correct field names

> **Note:** These changes affect Enterprise users only. Community users can skip this release.

---

## [1.9.0] - 2025-12-29

### Added

- **Enterprise Policy Features**:
  - `organizationId` field in `CreateStaticPolicyRequest` for organization-tier policies
  - `organizationId` field in `ListStaticPoliciesOptions` for filtering by organization
  - `listPolicyOverrides()` method to list all active policy overrides

---

## [1.8.0] - 2025-12-29

### Added

- **Code Governance Metrics & Export APIs** (Enterprise): Compliance reporting for AI-generated code
  - `getCodeGovernanceMetrics()` - Returns aggregated statistics (PR counts, file totals, security findings)
  - `exportCodeGovernanceData()` - Exports PR records as JSON for auditors

- **New Types**: `CodeGovernanceMetrics`, `ExportOptions`, `ExportResponse`

---

## [1.7.0] - 2025-12-29

### Added

- **Code Governance Git Provider APIs** (Enterprise): Create PRs from LLM-generated code
  - `validateGitProvider()` - Validate credentials before saving
  - `configureGitProvider()` - Configure GitHub, GitLab, or Bitbucket
  - `listGitProviders()` - List configured providers
  - `deleteGitProvider()` - Remove a provider
  - `createPR()` - Create PR from generated code with audit trail
  - `listPRs()` - List PRs with filtering
  - `getPR()` - Get PR details
  - `syncPRStatus()` - Sync status from Git provider

- **New Types**: `GitProviderType`, `FileAction`, `CodeFile`, `CreatePRRequest`, `CreatePRResponse`, `PRRecord`, `ListPRsOptions`, `ListPRsResponse`

- **Supported Git Providers**:
  - GitHub (Cloud and Enterprise Server)
  - GitLab (Cloud and Self-Managed)
  - Bitbucket (Cloud and Server/Data Center)

---

## [1.6.0] - 2025-12-28

### Added

- **HITL Support**: `require_approval` action for human oversight policies
  - Use with `createStaticPolicy()` to trigger approval workflows
  - Enterprise: Full HITL queue integration
  - Community: Auto-approves immediately

- **Code Governance**: `CodeArtifact` type for LLM-generated code detection
  - Language and code type identification
  - Potential secrets and unsafe pattern detection

---

## [1.5.0] - 2025-12-25

### Added

- **Policy CRUD Methods**: Full policy management support for Unified Policy Architecture v2.0.0
  - `listStaticPolicies()` - List policies with filtering by tier, category, enabled status
  - `getStaticPolicy()` - Get single policy by ID
  - `createStaticPolicy()` - Create custom policy
  - `updateStaticPolicy()` - Update existing policy
  - `deleteStaticPolicy()` - Delete policy
  - `toggleStaticPolicy()` - Enable/disable policy
  - `getEffectiveStaticPolicies()` - Get merged hierarchy for tenant
  - `testPattern()` - Test regex pattern against input

- **Policy Override Methods** (Enterprise):
  - `createPolicyOverride()`, `getPolicyOverride()`, `deletePolicyOverride()`

- **Dynamic Policy Methods**:
  - `listDynamicPolicies()`, `getDynamicPolicy()`, `createDynamicPolicy()`
  - `updateDynamicPolicy()`, `deleteDynamicPolicy()`, `toggleDynamicPolicy()`
  - `getEffectiveDynamicPolicies()`

- **New Types**: `StaticPolicy`, `DynamicPolicy`, `PolicyOverride`, `PolicyCategory`, `PolicyTier`, `PolicyAction`

## [1.4.2] - 2025-12-23

### Added

- **MAP Timeout Configuration** - New `mapTimeout` config option (default: 120000ms) for Multi-Agent Planning operations
  - MAP operations involve multiple LLM calls and can take 30-60+ seconds
  - `generatePlan()` now uses the longer MAP timeout

### Fixed

- **Plan ID Parsing** - Fixed `plan_id` extraction to check both top-level and nested `data.plan_id`

## [1.4.1] - 2025-12-22

### Deprecated
- **`protect()` method**: Now shows deprecation warning at runtime (#14)
  - Root cause: `extractRequest()` uses `aiCall.toString()` which returns JS source code, not runtime values
  - This causes `response.choices[0]` to be undefined
  - Will be removed in v2.0.0
  - Use Gateway Mode (`getPolicyApprovedContext` + `auditLLMCall`) or Proxy Mode (`executeQuery`) instead

### Changed
- Updated README with Gateway Mode and Proxy Mode examples (removed all `protect()` examples)
- Updated module docstring with recommended patterns and approval check example

## [1.4.0] - 2025-12-19

### Deprecated
- **LLM Interceptor wrappers**: All interceptor functions now show deprecation warnings (#10)
  - `wrapOpenAIClient()`
  - `wrapAnthropicClient()`
  - `wrapGeminiModel()`
  - `wrapOllamaClient()`
  - `wrapBedrockClient()`
  - Will be removed in v2.0.0
  - Use Gateway Mode or Proxy Mode instead

### Changed
- Added `@deprecated` JSDoc annotations to all interceptor exports
- Updated documentation to recommend Gateway/Proxy Mode patterns

## [1.3.0] - 2025-12-19

### Added
- **Proxy Mode**: Full `executeQuery()` implementation for routing requests through AxonFlow (#7)
  - Supports all request types: `chat`, `sql`, `mcp-query`, `multi-agent-plan`, `execute-plan`
  - Automatic policy enforcement with `PolicyViolationError` for blocked requests
  - Rich response with policy info, metadata, and processing details
- **Health Check**: New `healthCheck()` method to verify agent availability
  - Returns `HealthStatus` with status, version, uptime, and component health
- New types: `ExecuteQueryOptions`, `ExecuteQueryResponse`, `PolicyInfo`, `HealthStatus`, `RequestType`
- Proxy Mode example at `examples/proxy-mode/index.ts`
- Comprehensive integration tests for Proxy Mode

### Changed
- Version bumped to 1.3.0
- SDK now has full parity with Python SDK for both Gateway and Proxy modes

## [1.2.1] - 2025-12-15

### Fixed
- Fix authorization header handling for plan generation with explicit userToken (#3)
- Fix policy name extraction from blocked responses - now correctly extracts from `policy_info.policies_evaluated` (#4)

### Added
- Contract testing with real Agent API response fixtures (#6)
- Comprehensive E2E test suite (16 tests) for pre-release validation
- ESLint linting in CI workflow
- Codecov coverage reporting
- Node.js 18/20/22 matrix testing

### Validated APIs
- Gateway Mode (pre-check, audit)
- Policy Enforcement (SQL injection, PII blocking)
- Plan Generation (multi-agent)
- Protect API (fail-open mode)

## [1.2.0] - 2025-12-04

### Added
- Self-hosted mode for localhost deployments without license requirement
- Gateway Mode API for direct LLM calls with policy enforcement

### Changed
- License key now optional for localhost/self-hosted deployments

## [1.1.0] - 2025-11-27

### Added
- License-based authentication as primary authentication method
- MCP connector documentation

### Changed
- Updated README with new connector examples

## [1.0.0] - 2025-10-27

### Added
- Initial release of AxonFlow TypeScript SDK
- Core client with `executeQuery` for governed AI calls
- Policy enforcement with `PolicyViolationError` exceptions
- Gateway Mode support (`getPolicyApprovedContext`, `auditLlmCall`)
- Plan generation and execution (`generatePlan`, `executePlan`)
- Protect API for fail-open mode (`protect`)
- TypeScript type definitions for all API responses
- Examples for basic usage, connectors, and planning
