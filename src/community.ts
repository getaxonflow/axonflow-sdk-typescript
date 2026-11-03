/**
 * Legacy registration helper for self-hosted Community servers.
 */

const TRY_ENDPOINT = 'https://try.getaxonflow.com';
const HOSTED_START_URL = 'https://portal.try.getaxonflow.com/hosted/start';

export interface TryRegistration {
  tenant_id: string;
  secret: string;
  secret_prefix: string;
  expires_at: string;
  endpoint: string;
  note: string;
}

/**
 * Direct new Hosted users to verified Portal signup. Registration remains
 * available when an explicit self-hosted Community endpoint is supplied.
 */
export async function registerTry(
  label?: string,
  endpoint: string = TRY_ENDPOINT
): Promise<TryRegistration> {
  const hostname = new URL(endpoint).hostname.toLowerCase().replace(/\.+$/, '');
  if (hostname === 'try.getaxonflow.com' || hostname === 'try-staging.getaxonflow.com') {
    throw new Error(
      `New Hosted accounts start at ${HOSTED_START_URL}: verify your email, activate a plan, and link an API client in the Portal. Configure its clientId and clientSecret in AxonFlow.`
    );
  }
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
