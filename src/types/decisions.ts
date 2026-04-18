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
}
