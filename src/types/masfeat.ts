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
  technicalOwner?: string;
  businessOwner?: string;
  customerImpact?: number;
  modelComplexity?: number;
  humanReliance?: number;
  materiality: MaterialityClassification;
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
  highMaterialityCount: number;
  mediumMaterialityCount: number;
  lowMaterialityCount: number;
  byUseCase: Record<string, number>;
  byStatus: Record<string, number>;
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
  materiality?: MaterialityClassification;
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
  triggeredReason?: string;
  restoredAt?: Date;
  restoredBy?: string;
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
