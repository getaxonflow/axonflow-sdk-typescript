/**
 * Types for the platform's LLM provider listing endpoint
 * (`GET /api/v1/llm-providers`).
 *
 * Mirrors `LLMProvider` / `LLMProviderHealth` in the Python and Go SDKs.
 */

/** Health snapshot for a registered LLM provider. */
export interface LLMProviderHealth {
  status: string;
  message?: string;
  last_checked?: string;
}

/**
 * A configured LLM provider returned by `client.listProviders()`.
 *
 * Mirrors the platform's `LLMProviderResource` schema. Optional fields
 * are populated when the provider config has them set; `settings` is a
 * free-form provider-specific record (e.g. Bedrock inference-profile id,
 * Azure OpenAI deployment name).
 */
export interface LLMProvider {
  name: string;
  type: string;
  enabled: boolean;
  priority?: number;
  weight?: number;
  has_api_key: boolean;
  health?: LLMProviderHealth;
  endpoint?: string;
  model?: string;
  region?: string;
  rate_limit?: number;
  timeout_seconds?: number;
  settings?: Record<string, unknown>;
}

/**
 * Optional filters and pagination controls for `client.listProviders()`.
 * All fields are optional; leaving them undefined uses the server's
 * defaults (page 1, page_size 20, no filtering).
 */
export interface ListProvidersOptions {
  /** Filter by provider type (e.g. `"openai"`, `"anthropic"`). */
  type?: string;
  /** Filter by the provider's enabled flag. */
  enabled?: boolean;
  /** 1-indexed page number. Server default: 1. */
  page?: number;
  /** Items per page. Server default: 20, max: 100. */
  page_size?: number;
}

/** Pagination metadata returned alongside paginated list responses. */
export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/** Paginated wrapper returned by `client.listProvidersPaged()`. */
export interface LLMProviderListResponse {
  providers: LLMProvider[];
  pagination: PaginationMeta;
}
