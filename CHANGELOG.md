# Changelog

All notable changes to the AxonFlow TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
