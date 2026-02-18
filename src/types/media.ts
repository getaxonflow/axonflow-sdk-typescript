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
