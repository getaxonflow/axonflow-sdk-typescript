/**
 * Cost Controls types for AxonFlow SDK
 */

// Enums
export type BudgetScope = 'organization' | 'team' | 'agent' | 'workflow' | 'user';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type BudgetOnExceed = 'warn' | 'block' | 'downgrade';

// Budget types
export interface CreateBudgetRequest {
  id: string;
  name: string;
  scope: BudgetScope;
  limitUsd: number;
  period: BudgetPeriod;
  onExceed: BudgetOnExceed;
  alertThresholds?: number[];
  scopeId?: string;
}

export interface UpdateBudgetRequest {
  name?: string;
  limitUsd?: number;
  onExceed?: BudgetOnExceed;
  alertThresholds?: number[];
}

export interface ListBudgetsOptions {
  scope?: BudgetScope;
  limit?: number;
  offset?: number;
}

export interface Budget {
  id: string;
  name: string;
  scope: string;
  limitUsd: number;
  period: string;
  onExceed: string;
  alertThresholds: number[];
  enabled: boolean;
  scopeId?: string;
  /** Tenant ID that owns this budget. */
  tenant_id?: string;
  /** Organization ID that owns this budget. */
  org_id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetsResponse {
  budgets: Budget[];
  total: number;
}

// Budget Status types
export interface BudgetStatus {
  budget: Budget;
  usedUsd: number;
  remainingUsd: number;
  percentage: number;
  isExceeded: boolean;
  isBlocked: boolean;
  periodStart: string;
  periodEnd: string;
}

// Budget Alert types
export interface BudgetAlert {
  id: string;
  budgetId: string;
  alertType: string;
  threshold: number;
  percentageReached: number;
  amountUsd: number;
  message: string;
  createdAt: string;
  /** Whether the alert has been dismissed by an operator. */
  acknowledged?: boolean;
}

export interface BudgetAlertsResponse {
  alerts: BudgetAlert[];
  count: number;
}

// Budget Check types
export interface BudgetCheckRequest {
  orgId?: string;
  teamId?: string;
  agentId?: string;
  workflowId?: string;
  userId?: string;
}

export interface BudgetDecision {
  allowed: boolean;
  action?: string;
  message?: string;
  budgets?: Budget[];
}

// Usage types
export interface UsageSummary {
  totalCostUsd: number;
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  averageCostPerRequest: number;
  period: string;
  periodStart: string;
  periodEnd: string;
}

export interface UsageBreakdownItem {
  /** Dimension name (provider, model, agent, etc.). */
  groupBy?: string;
  groupValue: string;
  costUsd: number;
  percentage: number;
  requestCount: number;
  tokensIn: number;
  tokensOut: number;
}

export interface UsageBreakdown {
  groupBy: string;
  totalCostUsd: number;
  items: UsageBreakdownItem[];
  period: string;
  periodStart: string;
  periodEnd: string;
}

export interface ListUsageRecordsOptions {
  limit?: number;
  offset?: number;
  provider?: string;
  model?: string;
}

export interface UsageRecord {
  id: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  requestId?: string;
  orgId?: string;
  agentId?: string;
  /** When the record was created (canonical wire field). */
  created_at?: string;
  /** Whether the underlying request succeeded. */
  success?: boolean;
  /** Error message if the request failed. */
  error_message?: string;
  /** Request latency in milliseconds. */
  latency_ms?: number;
  /** Team ID associated with the request. */
  team_id?: string;
  /** Tenant ID. */
  tenant_id?: string;
  /** User ID. */
  user_id?: string;
  /** Workflow ID if this record came from a workflow execution. */
  workflow_id?: string;
  /**
   * @deprecated The transformer reads `r.timestamp`, but the wire
   * emits `created_at`. So this field has always read `undefined`.
   * Use `created_at`. Removed in v7.
   */
  timestamp?: string;
}

export interface UsageRecordsResponse {
  records: UsageRecord[];
  total: number;
}

// Pricing types
export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export interface PricingInfo {
  provider: string;
  model: string;
  pricing: ModelPricing;
}

export interface PricingListResponse {
  pricing: PricingInfo[];
}
