/**
 * Decision explainability types (ADR-043 Explainability Data Contract).
 *
 * The DecisionExplanation shape is frozen: additive-only changes are
 * non-breaking; renames/removals require a major version bump.
 */

/** A policy reference inside a decision explanation. */
export interface ExplainPolicy {
  policyId: string;
  policyName?: string;
  action?: string;
  /** low | medium | high | critical */
  riskLevel?: string;
  /** false iff policy forbids session override (ADR-042) */
  allowOverride?: boolean;
  policyDescription?: string;
}

/** Rule-level detail inside a decision explanation. */
export interface ExplainRule {
  policyId: string;
  ruleId?: string;
  ruleText?: string;
  matchedOn?: string;
}

/**
 * Canonical payload returned by {@link AxonFlowClient.explainDecision}.
 *
 * Shape frozen per ADR-043. Fields are documented in
 * `axonflow-docs/governance/explainability`.
 */
export interface DecisionExplanation {
  decisionId: string;
  timestamp: Date;
  policyMatches: ExplainPolicy[];
  matchedRules?: ExplainRule[];
  /** allow | deny | require_approval */
  decision: string;
  reason: string;
  /** low | medium | high | critical */
  riskLevel?: string;
  overrideAvailable: boolean;
  overrideExistingId?: string;
  /** Number of hits for the same (policy, user) pair in the rolling 24h window. */
  historicalHitCountSession: number;
  policySourceLink?: string;
  toolSignature?: string;
  /**
   * The FULL sanitized request context the PEP attached to the decision
   * (canonical lower_snake_case keys, string values), read from the audit
   * row's `policy_details->'context'`. Unlike {@link DecisionSummary} (which
   * truncates to 5 keys), explain returns every persisted key up to the
   * platform's 10-key cap (e.g. `x_ai_agent`, `x_session_id`,
   * `x_leader_identity`, `x-bukuwarung-*`). Absent for pre-v8.4.0 audit rows.
   * (platform #2509 / epic #2508)
   */
  context?: Record<string, string>;
  /** True when the agent dropped surplus context keys at write time. */
  contextTruncated?: boolean;
}

/**
 * Slim 5-field row returned by {@link AxonFlowClient.listDecisions}.
 *
 * `policyId` and `toolSignature` are optional because pre-α1 audit rows +
 * dynamic-only blocks may not populate them. Additive new fields land via
 * optional properties per ADR-043 §"Versioning" (non-breaking).
 *
 * Cross-SDK parity:
 *   Go:     axonflow-sdk-go/decisions.go (DecisionSummary)
 *   Python: axonflow-sdk-python/axonflow/decisions.py (DecisionSummary)
 *   Java:   .../sdk/types/DecisionSummary.java
 *   Rust:   axonflow-sdk-rust/src/types/decisions.rs (DecisionSummary)
 */
export interface DecisionSummary {
  decisionId: string;
  timestamp: Date;
  /** allow | deny | require_approval */
  decision: string;
  policyId?: string;
  toolSignature?: string;
  /**
   * The sanitized request context the PEP attached to the decision (canonical
   * lower_snake_case keys, string values), surfaced from the audit row's
   * `policy_details->'context'`. The list summary is truncated by the platform
   * to the 5 most-correlated keys; the full map is available via
   * {@link AxonFlowClient.explainDecision}. Absent for pre-v8.4.0 audit rows or
   * decisions with no context. (platform #2509 / epic #2508)
   */
  context?: Record<string, string>;
}

/**
 * Optional filters for {@link AxonFlowClient.listDecisions}.
 *
 * Every field is optional; `undefined` values are omitted from the URL so
 * the platform applies its tier-default page. `decision` must be one of
 * `'allow' | 'deny' | 'require_approval'` when set. `limit` is server-
 * capped per tier; over-cap requests yield a 429 with the V1 upgrade
 * envelope (surfaced as {@link RateLimitError} carrying `upgrade`).
 */
export interface ListDecisionsOptions {
  since?: Date;
  decision?: string;
  policyId?: string;
  toolSignature?: string;
  limit?: number;
}
