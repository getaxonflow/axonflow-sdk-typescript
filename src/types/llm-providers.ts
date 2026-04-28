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

/** A configured LLM provider returned by `client.listProviders()`. */
export interface LLMProvider {
  name: string;
  type: string;
  enabled: boolean;
  priority?: number;
  weight?: number;
  has_api_key: boolean;
  health?: LLMProviderHealth;
}

/**
 * Optional filters for `client.listProviders()`. Both fields are optional;
 * leaving them undefined returns every configured provider.
 */
export interface ListProvidersOptions {
  /** Filter by provider type (e.g. `"openai"`, `"anthropic"`). */
  type?: string;
  /** Filter by the provider's enabled flag. */
  enabled?: boolean;
}
