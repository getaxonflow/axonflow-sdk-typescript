/**
 * Media Governance Types
 *
 * Types for multimodal image governance. When images are sent through AxonFlow,
 * they are analyzed for PII, content safety, biometric data, and document classification.
 */

/**
 * Media content (image) to include with a request for governance analysis.
 */
export interface MediaContent {
  /** How media is provided: "base64" or "url" */
  source: 'base64' | 'url';
  /** Base64-encoded image data (required when source is "base64") */
  base64Data?: string;
  /** Image URL (required when source is "url") */
  url?: string;
  /** Media content type (e.g., "image/jpeg", "image/png", "image/gif", "image/webp") */
  mimeType: string;
}

/**
 * Analysis results for a single media item.
 */
export interface MediaAnalysisResult {
  /** Index of the media item in the request */
  mediaIndex: number;
  /** SHA-256 hash of the image data */
  sha256Hash: string;
  /** Whether faces were detected */
  hasFaces: boolean;
  /** Number of faces detected */
  faceCount: number;
  /** Whether biometric data was detected (GDPR Art. 9) */
  hasBiometricData: boolean;
  /** NSFW content score (0-1) */
  nsfwScore: number;
  /** Violence content score (0-1) */
  violenceScore: number;
  /** Aggregated content safety flag */
  contentSafe: boolean;
  /** Classified document type (e.g., "id_card", "bank_statement") */
  documentType?: string;
  /** Whether the document is classified as sensitive */
  isSensitiveDocument: boolean;
  /** Whether PII was detected via OCR */
  hasPII: boolean;
  /** Types of PII detected */
  piiTypes?: string[];
  /** Whether text was extracted from image via OCR */
  hasExtractedText: boolean;
  /** Length of extracted text in characters */
  extractedTextLength: number;
  /** Estimated analysis cost for this item in USD */
  estimatedCostUsd: number;
  /** Governance warnings */
  warnings?: string[];
}

/**
 * Aggregated media analysis response.
 */
export interface MediaAnalysisResponse {
  /** Per-item analysis results */
  results: MediaAnalysisResult[];
  /** Total analysis cost in USD */
  totalCostUsd: number;
  /** Total analysis time in milliseconds */
  analysisTimeMs: number;
}

/**
 * Per-tenant media governance configuration.
 *
 * Controls whether media analysis is enabled for a tenant and which
 * analyzers are allowed. Managed via the media governance config API.
 */
export interface MediaGovernanceConfig {
  /** Tenant identifier */
  tenantId: string;
  /** Whether media governance analysis is enabled for this tenant */
  enabled: boolean;
  /** List of allowed analyzer names (e.g., ["nsfw", "pii", "document"]). If omitted, all analyzers are available. */
  allowedAnalyzers?: string[];
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** User or system that last updated the config */
  updatedBy?: string;
}

/**
 * Platform-level media governance status.
 *
 * Reports whether media governance is available on the platform,
 * whether it is enabled by default for new tenants, and the
 * license tier required.
 */
export interface MediaGovernanceStatus {
  /** Whether media governance is available on this platform instance */
  available: boolean;
  /** Whether media analysis is enabled by default for new tenants */
  enabledByDefault: boolean;
  /** Whether per-tenant control is supported */
  perTenantControl: boolean;
  /** License tier required (e.g., "enterprise", "professional") */
  tier: string;
}

/**
 * Request body for updating a tenant's media governance configuration.
 */
export interface UpdateMediaGovernanceConfigRequest {
  /** Enable or disable media governance for the tenant */
  enabled?: boolean;
  /** Set the list of allowed analyzers */
  allowedAnalyzers?: string[];
}
