/**
 * MAS FEAT Compliance Types
 *
 * Types for the Monetary Authority of Singapore FEAT (Fairness, Ethics,
 * Accountability, Transparency) compliance module.
 *
 * Enterprise Feature: Requires AxonFlow Enterprise license.
 */

// ===========================================================================
// Enums
// ===========================================================================

/** Materiality classification based on 3-dimensional risk rating. */
export type MaterialityClassification = 'high' | 'medium' | 'low';

/** AI System lifecycle status. */
export type SystemStatus = 'draft' | 'active' | 'suspended' | 'retired';

/** FEAT Assessment lifecycle status. */
export type FEATAssessmentStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'approved'
  | 'rejected';

/** Kill Switch operational status. */
export type KillSwitchStatus = 'enabled' | 'disabled' | 'triggered';

/** FEAT framework pillars. */
export type FEATPillar = 'fairness' | 'ethics' | 'accountability' | 'transparency';

/** Predefined AI system use cases for MAS compliance. */
export type AISystemUseCase =
  | 'credit_scoring'
  | 'robo_advisory'
  | 'insurance_underwriting'
  | 'trading_algorithm'
  | 'aml_cft'
  | 'customer_service'
  | 'fraud_detection'
  | 'other';

/** Kill Switch event types. */
export type KillSwitchEventType =
  | 'created'
  | 'enabled'
  | 'disabled'
  | 'triggered'
  | 'restored'
  | 'configured';

/** FEAT Assessment finding severity levels. */
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'observation';

/** FEAT Assessment finding status. */
export type FindingStatus = 'open' | 'resolved' | 'accepted';

// ===========================================================================
// Finding (for FEAT Assessments)
// ===========================================================================

/** A FEAT assessment finding. */
export interface Finding {
  id: string;
  pillar: FEATPillar;
  severity: FindingSeverity;
  category: string;
  description: string;
  status: FindingStatus;
  remediation?: string;
  /** Regulatory article reference (e.g. MAS FEAT principle number). */
  article?: string;
  dueDate?: Date;
}

// ===========================================================================
// AI System Registry
// ===========================================================================

/** Registered AI system in the MAS FEAT registry. */
export interface AISystemRegistry {
  id: string;
  orgId: string;
  systemId: string;
  systemName: string;
  description?: string;
  useCase: AISystemUseCase;
  ownerTeam: string;
  /**
   * @deprecated Never populated on the 9.x line - the server has never sent
   * the `technical_owner` wire field (getaxonflow/axonflow-enterprise#3254).
   * The wire carries `owner_email`/`owner_team`; read `ownerEmail`.
   * Scheduled for removal in the next major.
   */
  technicalOwner?: string;
  /**
   * @deprecated The server has never sent the `business_owner` wire field on
   * the 9.x line (getaxonflow/axonflow-enterprise#3254); this property is
   * populated from the real `owner_email` wire field as a legacy fallback.
   * Read `ownerEmail`. Scheduled for removal in the next major.
   */
  businessOwner?: string;
  /**
   * @deprecated The server has never sent the `customer_impact` wire field
   * on the 9.x line (getaxonflow/axonflow-enterprise#3254); this property is
   * populated from the real `risk_rating_impact` wire field as a legacy
   * fallback. Read `riskRatingImpact`. Scheduled for removal in the next
   * major.
   */
  customerImpact?: number;
  /**
   * @deprecated The server has never sent the `model_complexity` wire field
   * on the 9.x line (getaxonflow/axonflow-enterprise#3254); this property is
   * populated from the real `risk_rating_complexity` wire field as a legacy
   * fallback. Read `riskRatingComplexity`. Scheduled for removal in the next
   * major.
   */
  modelComplexity?: number;
  /**
   * @deprecated The server has never sent the `human_reliance` wire field on
   * the 9.x line (getaxonflow/axonflow-enterprise#3254); this property is
   * populated from the real `risk_rating_reliance` wire field as a legacy
   * fallback. Read `riskRatingReliance`. Scheduled for removal in the next
   * major.
   */
  humanReliance?: number;
  /** System owner email as served on the wire (`owner_email`). */
  ownerEmail?: string;
  /** Impact dimension of the 3-part MAS risk rating (wire `risk_rating_impact`, 1-5). */
  riskRatingImpact?: number;
  /** Complexity dimension of the 3-part MAS risk rating (wire `risk_rating_complexity`, 1-5). */
  riskRatingComplexity?: number;
  /** Reliance dimension of the 3-part MAS risk rating (wire `risk_rating_reliance`, 1-5). */
  riskRatingReliance?: number;
  materialityClassification: MaterialityClassification;
  status: SystemStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

/** Summary of all AI systems in the registry. */
export interface RegistrySummary {
  totalSystems: number;
  activeSystems: number;
  /**
   * @deprecated The server has never sent the `high_materiality_count` wire
   * field on the 9.x line (getaxonflow/axonflow-enterprise#3254); this
   * property is populated from the real `high_materiality` wire field as a
   * legacy fallback. Read `highMateriality`. Scheduled for removal in the
   * next major.
   */
  highMaterialityCount: number;
  /**
   * @deprecated The server has never sent the `medium_materiality_count`
   * wire field on the 9.x line (getaxonflow/axonflow-enterprise#3254); this
   * property is populated from the real `medium_materiality` wire field as a
   * legacy fallback. Read `mediumMateriality`. Scheduled for removal in the
   * next major.
   */
  mediumMaterialityCount: number;
  /**
   * @deprecated The server has never sent the `low_materiality_count` wire
   * field on the 9.x line (getaxonflow/axonflow-enterprise#3254); this
   * property is populated from the real `low_materiality` wire field as a
   * legacy fallback. Read `lowMateriality`. Scheduled for removal in the
   * next major.
   */
  lowMaterialityCount: number;
  /**
   * @deprecated Never populated on the 9.x line - the server has never sent
   * the `by_use_case` wire field (getaxonflow/axonflow-enterprise#3254);
   * this property is always `{}` against real servers. No wire equivalent.
   * Scheduled for removal in the next major.
   */
  byUseCase: Record<string, number>;
  /**
   * @deprecated Never populated on the 9.x line - the server has never sent
   * the `by_status` wire field (getaxonflow/axonflow-enterprise#3254); this
   * property is always `{}` against real servers. No wire equivalent.
   * Scheduled for removal in the next major.
   */
  byStatus: Record<string, number>;
  /** Organization the summary is scoped to (wire `org_id`). */
  orgId?: string;
  /** Count of high-materiality systems as served on the wire (`high_materiality`). */
  highMateriality?: number;
  /** Count of medium-materiality systems as served on the wire (`medium_materiality`). */
  mediumMateriality?: number;
  /** Count of low-materiality systems as served on the wire (`low_materiality`). */
  lowMateriality?: number;
  /** Count of systems with assessments due (wire `assessments_due`). */
  assessmentsDue?: number;
  /** Count of currently triggered kill switches (wire `kill_switches_triggered`). */
  killSwitchesTriggered?: number;
}

/** Request to register a new AI system. */
export interface RegisterSystemRequest {
  systemId: string;
  systemName: string;
  description?: string;
  useCase: AISystemUseCase;
  ownerTeam: string;
  technicalOwner?: string;
  businessOwner?: string;
  customerImpact?: number;
  modelComplexity?: number;
  humanReliance?: number;
  metadata?: Record<string, unknown>;
}

/** Request to update an AI system. */
export interface UpdateSystemRequest {
  systemName?: string;
  description?: string;
  useCase?: AISystemUseCase;
  ownerTeam?: string;
  technicalOwner?: string;
  businessOwner?: string;
  customerImpact?: number;
  modelComplexity?: number;
  humanReliance?: number;
  status?: SystemStatus;
  metadata?: Record<string, unknown>;
}

/** Options for listing AI systems. */
export interface ListSystemsOptions {
  status?: SystemStatus;
  useCase?: AISystemUseCase;
  materialityClassification?: MaterialityClassification;
  limit?: number;
  offset?: number;
}

// ===========================================================================
// FEAT Assessments
// ===========================================================================

/** FEAT Assessment record. */
export interface FEATAssessment {
  id: string;
  orgId: string;
  systemId: string;
  assessmentType: string;
  status: FEATAssessmentStatus;
  assessmentDate: Date;
  validUntil?: Date;
  fairnessScore?: number;
  ethicsScore?: number;
  accountabilityScore?: number;
  transparencyScore?: number;
  overallScore?: number;
  fairnessDetails?: Record<string, unknown>;
  ethicsDetails?: Record<string, unknown>;
  accountabilityDetails?: Record<string, unknown>;
  transparencyDetails?: Record<string, unknown>;
  findings?: Finding[];
  recommendations?: string[];
  assessors?: string[];
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

/** Request to create a new FEAT assessment. */
export interface CreateAssessmentRequest {
  systemId: string;
  assessmentType: string;
  assessmentDate?: Date;
  fairnessScore?: number;
  ethicsScore?: number;
  accountabilityScore?: number;
  transparencyScore?: number;
  fairnessDetails?: Record<string, unknown>;
  ethicsDetails?: Record<string, unknown>;
  accountabilityDetails?: Record<string, unknown>;
  transparencyDetails?: Record<string, unknown>;
  findings?: Finding[];
  recommendations?: string[];
  assessors?: string[];
}

/** Request to update a FEAT assessment. */
export interface UpdateAssessmentRequest {
  status?: FEATAssessmentStatus;
  validUntil?: Date;
  fairnessScore?: number;
  ethicsScore?: number;
  accountabilityScore?: number;
  transparencyScore?: number;
  fairnessDetails?: Record<string, unknown>;
  ethicsDetails?: Record<string, unknown>;
  accountabilityDetails?: Record<string, unknown>;
  transparencyDetails?: Record<string, unknown>;
  findings?: Finding[];
  recommendations?: string[];
  assessors?: string[];
}

/** Request to approve a FEAT assessment. */
export interface ApproveAssessmentRequest {
  approvedBy?: string;
  validUntil?: Date;
  comments?: string;
}

/** Request to reject a FEAT assessment. */
export interface RejectAssessmentRequest {
  rejectedBy?: string;
  reason: string;
}

/** Options for listing assessments. */
export interface ListAssessmentsOptions {
  systemId?: string;
  status?: FEATAssessmentStatus;
  limit?: number;
  offset?: number;
}

// ===========================================================================
// Kill Switch
// ===========================================================================

/** Kill Switch configuration and status. */
export interface KillSwitch {
  id: string;
  orgId: string;
  systemId: string;
  status: KillSwitchStatus;
  autoTriggerEnabled: boolean;
  accuracyThreshold?: number;
  biasThreshold?: number;
  errorRateThreshold?: number;
  triggeredAt?: Date;
  triggeredBy?: string;
  /**
   * @deprecated The server has never sent the `triggered_reason` wire field
   * on the 9.x line (getaxonflow/axonflow-enterprise#3254); this property is
   * populated from the real `trigger_reason` wire field as a legacy
   * fallback. Read `triggerReason`. Scheduled for removal in the next major.
   */
  triggeredReason?: string;
  /** Reason the switch was triggered, as served on the wire (`trigger_reason`). */
  triggerReason?: string;
  /** Auto-trigger conditions as served on the wire (`trigger_conditions`). */
  triggerConditions?: Record<string, unknown>;
  restoredAt?: Date;
  restoredBy?: string;
  /** Reason the switch was restored, as served on the wire (`restore_reason`). */
  restoreReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Kill Switch event record. */
export interface KillSwitchEvent {
  id: string;
  killSwitchId: string;
  eventType: KillSwitchEventType;
  eventData?: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
}

/** Request to configure a kill switch. */
export interface ConfigureKillSwitchRequest {
  autoTriggerEnabled?: boolean;
  accuracyThreshold?: number;
  biasThreshold?: number;
  errorRateThreshold?: number;
  triggerConditions?: Record<string, unknown>;
}

/** Request to check kill switch status with metrics. */
export interface CheckKillSwitchRequest {
  accuracy?: number;
  biasScore?: number;
  errorRate?: number;
}

/** Request to trigger a kill switch. */
export interface TriggerKillSwitchRequest {
  reason: string;
  triggeredBy?: string;
}

/** Request to restore a kill switch. */
export interface RestoreKillSwitchRequest {
  reason: string;
  restoredBy?: string;
}

/** Request to disable a kill switch. */
export interface DisableKillSwitchRequest {
  reason?: string;
}
