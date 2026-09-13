/**
 * Decision provenance a v11.0.0 platform reports on governed responses.
 */

/** A checksum validator that acted before the policy engine decided. */
export interface LegacyValidatorAction {
  /** Validator that acted, e.g. `indonesia_pii` or `india_pii`. */
  validator: string;
  /** What it did: `blocked` or `masked`. */
  action: string;
}

/**
 * One policy a decision matched, as `policy_identities` names it.
 *
 * Entries follow `evaluated_policies` in the same order. `name` is the policy's own
 * display name and is absent when it declares none; the platform never presents an
 * identifier as a name. `source` says whose the policy is (`shipped`, `organization`
 * or `pack`), and `version` is the published version of an organization's or an
 * installed pack's policy.
 */
export interface PolicyIdentity {
  id: string;
  name?: string;
  source?: string;
  version?: number;
}
