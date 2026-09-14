/**
 * Typed policy authoring: the v11 successor to the legacy policy routes.
 *
 * A v11 platform authors policy as a typed document: validated, published as a
 * signed artifact pinned by its digest, and promoted to active. Six routes under
 * `/api/v1/typed-policies` do that, and the agent proxies all six with this
 * client's credentials. The organization and the author are the ones the
 * client's credentials resolve to: the agent stamps both, and neither can be
 * named in a request.
 *
 * These are the wire shapes. `document` and `fixtures` stay plain objects, as
 * the spec defines them: the document is the authoring model itself rather than
 * a mirror of it, so a field the policy vocabulary gains passes through
 * unchanged rather than being dropped by a client-side model.
 */

/** The route prefix of the six typed-policy authoring routes the agent proxies. */
export const TYPED_POLICIES_PATH = '/api/v1/typed-policies';

/** What this edition may spend (the spec's `EditionConstructReport`). */
export interface EditionConstructReport {
  /** `community`, `evaluation` or `enterprise`. */
  edition?: string;
  obligation_families: string[];
  attribute_namespaces: string[];
  group_scope?: boolean;
  separation_of_duties?: boolean;
  tier_established?: boolean;
  /** Constructs withheld for want of an edition ruling, not by one. */
  reserved: string[];
}

/** One declared save-time or publication result (the spec's `AuthoringFinding`). */
export interface AuthoringFinding {
  code: string;
  /** `reject` or `warn`. */
  severity: string;
  policy_id?: string;
  /** The declared, code-level sentence. */
  summary?: string;
  /** What was wrong, naming the offending value. */
  detail?: string;
}

/** A candidate document and its fixtures (the spec's `TypedAuthoringDocumentRequest`). */
export interface TypedAuthoringDocumentRequest {
  /** An `authoring.axonflow.com/v1` document, sent as the object it is. */
  document: Record<string, unknown>;
  fixtures?: Array<Record<string, unknown>>;
}

/** What this deployment may author. */
export interface TypedAuthoringEdition {
  success: boolean;
  /** The configured authoring vocabulary. */
  catalog?: string;
  /** The digest that names the authoring vocabulary. */
  catalog_digest?: string;
  /** The version of the action registry in that vocabulary. */
  registry_version?: number;
  /** True when the vocabulary is a test-world fixture, not a deployment's. */
  catalog_fixture?: boolean;
  /** The one authority root this surface publishes under. */
  root?: string;
  /** Customer-authored documents admitted per organization; -1 is unlimited. */
  max_documents?: number;
  constructs?: EditionConstructReport;
  /** `process`, `database` or `unavailable`. */
  persistence?: string;
  signing_key_custody?: string;
}

/** Every finding for a candidate document. `success` is false when any is a rejection. */
export interface TypedPolicyValidation {
  success: boolean;
  findings: AuthoringFinding[];
}

/**
 * The organization template's controls a document omits. Activating a document
 * that omits them removes them for the organization. `of` is how many controls
 * the template carries, and `omitted` names each one the document leaves out.
 */
export interface TemplateOmissionReport {
  omitted: string[];
  of?: number;
  message?: string;
}

/**
 * A published artifact. Activation names `digest`, never the version.
 *
 * `template_omissions` reports the organization template's controls the
 * document omits, and is absent when it omits none; `template_omissions_unavailable`
 * says why that report could not be produced, when it could not.
 */
export interface TypedPolicyPublication {
  success: boolean;
  digest: string;
  version?: number;
  findings: AuthoringFinding[];
  template_omissions?: TemplateOmissionReport;
  template_omissions_unavailable?: string;
}

/**
 * The audited activation record. `template_omissions` and
 * `template_omissions_unavailable` are the report for the activated document, as
 * on {@link TypedPolicyPublication}, beside the record rather than inside it.
 */
export interface TypedPolicyActivation {
  success: boolean;
  activation: Record<string, unknown>;
  template_omissions?: TemplateOmissionReport;
  template_omissions_unavailable?: string;
}

/**
 * The document in force. `source` is the exact text that was signed, so a
 * caller can verify it; `document` is the same text parsed.
 */
export interface ActiveTypedPolicy {
  source: string;
  document: Record<string, unknown>;
}

/** One shipped control, with what happens when it cannot be evaluated. */
export interface TypedPolicySystemControl {
  id: string;
  name?: string;
  authority?: string;
  /** `enforcement`, `gating_risk` or `advisory`. */
  assurance?: string;
  /** False when the platform omits it. */
  mandatory: boolean;
  description?: string;
  obligations: Array<Record<string, unknown>>;
}

/** The platform's own controls: the system root activated beneath every organization. */
export interface TypedPolicySystemCorpus {
  root?: string;
  version?: number;
  /** The digest an enforcing engine anchors to. */
  digest?: string;
  authority?: string;
  controls: TypedPolicySystemControl[];
  assurance_counts: Record<string, number>;
  document: Record<string, unknown>;
}
