import "server-only";

/**
 * Who runs this deployment — shown on the imprint, privacy policy and
 * terms. Required by Swiss (UWG Art. 3 lit. s) and EU law for a
 * commercial site; self-hosters set their own values.
 */
export interface Operator {
  name: string;
  address: string;
  email: string;
  /** false while any value is still a placeholder */
  configured: boolean;
}

export function getOperator(): Operator {
  const name = process.env.LEGAL_NAME?.trim();
  const address = process.env.LEGAL_ADDRESS?.trim();
  const email = process.env.LEGAL_EMAIL?.trim();
  return {
    name: name || "[Name]",
    address: address || "[Address]",
    email: email || "[Email]",
    configured: Boolean(name && address && email),
  };
}

/** Date the legal texts were last revised (ISO). */
export const LEGAL_UPDATED = "2026-10-14";

export type LegalLang = "de" | "en";
