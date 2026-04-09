/**
 * Community SaaS registration helper for try.getaxonflow.com.
 */

const TRY_ENDPOINT = 'https://try.getaxonflow.com';

export interface TryRegistration {
  tenant_id: string;
  secret: string;
  secret_prefix: string;
  expires_at: string;
  endpoint: string;
  note: string;
}

/**
 * Register for a free evaluation tenant on try.getaxonflow.com.
 * Store the secret securely — it is shown only once.
 */
export async function registerTry(
  label?: string,
  endpoint: string = TRY_ENDPOINT
): Promise<TryRegistration> {
  const response = await fetch(`${endpoint}/api/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(label ? { label } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Registration failed (${response.status}): ${text}`);
  }
  return response.json();
}
