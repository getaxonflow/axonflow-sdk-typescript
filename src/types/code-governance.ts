/**
 * Code Governance Types
 *
 * Enterprise features for Git provider integration and PR creation
 * from LLM-generated code.
 */

// Git Provider Types
export type GitProviderType = 'github' | 'gitlab' | 'bitbucket';

export interface ConfigureGitProviderRequest {
  /** Provider type: github, gitlab, or bitbucket */
  type: GitProviderType;
  /** Access token (PAT, app password, or access token) */
  token?: string;
  /** Base URL for self-hosted instances */
  baseUrl?: string;
  /** GitHub App ID (for GitHub App authentication) */
  appId?: number;
  /** GitHub App Installation ID */
  installationId?: number;
  /** GitHub App private key (PEM format) */
  privateKey?: string;
}

export interface ValidateGitProviderRequest {
  /** Provider type: github, gitlab, or bitbucket */
  type: GitProviderType;
  /** Access token */
  token?: string;
  /** Base URL for self-hosted instances */
  baseUrl?: string;
  /** GitHub App ID */
  appId?: number;
  /** GitHub App Installation ID */
  installationId?: number;
  /** GitHub App private key */
  privateKey?: string;
}

export interface ValidateGitProviderResponse {
  /** Whether credentials are valid */
  valid: boolean;
  /** Validation message */
  message: string;
}

export interface ConfigureGitProviderResponse {
  /** Success message */
  message: string;
  /** Configured provider type */
  type: string;
}

export interface GitProviderInfo {
  /** Provider type */
  type: GitProviderType;
}

export interface ListGitProvidersResponse {
  /** Configured providers */
  providers: GitProviderInfo[];
  /** Number of providers */
  count: number;
}

// PR/MR Types
export type FileAction = 'create' | 'update' | 'delete';

export interface CodeFile {
  /** File path relative to repository root */
  path: string;
  /** File content */
  content: string;
  /** Programming language (optional) */
  language?: string;
  /** File action: create, update, or delete */
  action: FileAction;
}

export interface CreatePRRequest {
  /** Repository owner (org or user) */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR title */
  title: string;
  /** PR description/body */
  description?: string;
  /** Base branch to merge into (default: main) */
  baseBranch?: string;
  /** Head branch name (auto-generated if not provided) */
  branchName?: string;
  /** Create as draft PR */
  draft?: boolean;
  /** Files to include in PR */
  files: CodeFile[];
  /** Agent request ID for traceability */
  agentRequestId?: string;
  /** LLM model used to generate code */
  model?: string;
  /** Policies checked during code generation */
  policiesChecked?: string[];
  /** Number of secrets detected in code */
  secretsDetected?: number;
  /** Number of unsafe patterns detected */
  unsafePatterns?: number;
}

export interface CreatePRResponse {
  /** Internal PR record ID */
  prId: string;
  /** PR number on Git provider */
  prNumber: number;
  /** PR URL */
  prUrl: string;
  /** PR state (open, merged, closed) */
  state: string;
  /** Head branch name */
  headBranch: string;
  /** Creation timestamp */
  createdAt: string;
}

export interface PRRecord {
  /** Internal PR record ID */
  id: string;
  /** PR number on Git provider */
  prNumber: number;
  /** PR URL */
  prUrl: string;
  /** PR title */
  title: string;
  /** PR state */
  state: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Head branch */
  headBranch: string;
  /** Base branch */
  baseBranch: string;
  /** Number of files in PR */
  filesCount: number;
  /** Secrets detected count */
  secretsDetected: number;
  /** Unsafe patterns count */
  unsafePatterns: number;
  /** Creation timestamp */
  createdAt: string;
  /** Closed timestamp (if closed) */
  closedAt?: string;
  /** User who created the PR */
  createdBy?: string;
  /** Provider type */
  providerType?: string;
}

export interface ListPRsOptions {
  /** Maximum number of PRs to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by state: open, merged, closed */
  state?: string;
}

export interface ListPRsResponse {
  /** PR records */
  prs: PRRecord[];
  /** Total count */
  count: number;
}

// Metrics and Export Types

export interface CodeGovernanceMetrics {
  /** Tenant identifier */
  tenantId: string;
  /** Total number of PRs created */
  totalPrs: number;
  /** Number of open PRs */
  openPrs: number;
  /** Number of merged PRs */
  mergedPrs: number;
  /** Number of closed (not merged) PRs */
  closedPrs: number;
  /** Total files modified across all PRs */
  totalFiles: number;
  /** Total secrets detected across all PRs */
  totalSecretsDetected: number;
  /** Total unsafe patterns detected */
  totalUnsafePatterns: number;
  /** Timestamp of the first PR */
  firstPrAt?: string;
  /** Timestamp of the most recent PR */
  lastPrAt?: string;
}

export interface ExportOptions {
  /** Export format: 'json' or 'csv' */
  format?: 'json' | 'csv';
  /** Filter PRs created on or after this date (ISO 8601) */
  startDate?: string;
  /** Filter PRs created on or before this date (ISO 8601) */
  endDate?: string;
  /** Filter by PR state: open, merged, closed */
  state?: string;
}

export interface ExportResponse {
  /** Exported PR records */
  records: PRRecord[];
  /** Number of records */
  count: number;
  /** When the export was generated */
  exportedAt: string;
}
