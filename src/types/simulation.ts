/**
 * Policy simulation types for dry-run policy evaluation.
 *
 * These types support the Evaluation tier+ policy simulation feature,
 * which allows testing policy configurations without affecting live traffic.
 */

export interface SimulatePoliciesRequest {
  query: string;
  request_type?: string;
  user?: Record<string, unknown>;
  client?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface SimulationDailyUsage {
  used: number;
  limit: number;
}

export interface SimulatePoliciesResponse {
  allowed: boolean;
  applied_policies: string[];
  risk_score: number;
  required_actions: string[];
  processing_time_ms: number;
  total_policies: number;
  dry_run: boolean;
  simulated_at: string;
  tier: string;
  daily_usage?: SimulationDailyUsage;
}

export interface ImpactReportInput {
  query: string;
  request_type?: string;
  user?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface ImpactReportRequest {
  policy_id: string;
  inputs: ImpactReportInput[];
}

export interface ImpactReportResult {
  input_index: number;
  matched: boolean;
  blocked: boolean;
  actions?: string[];
}

export interface ImpactReportResponse {
  policy_id: string;
  policy_name?: string;
  total_inputs: number;
  matched: number;
  blocked: number;
  match_rate: number;
  block_rate: number;
  results: ImpactReportResult[];
  processing_time_ms: number;
  generated_at: string;
  tier: string;
}

export interface PolicyConflictRef {
  id: string;
  name: string;
  type: string;
}

export interface PolicyConflict {
  policy_a: PolicyConflictRef;
  policy_b: PolicyConflictRef;
  conflict_type: string;
  description: string;
  severity: string;
  overlapping_field: string;
}

export interface PolicyConflictResponse {
  conflicts: PolicyConflict[];
  total_policies: number;
  conflict_count: number;
  checked_at: string;
  tier: string;
}
