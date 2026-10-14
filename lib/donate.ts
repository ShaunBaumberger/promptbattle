import "server-only";

/**
 * Donations. promptbattle.io is free; hosts who enjoyed it can chip in.
 *
 * Every donate button links to our own /donate page, which forwards to
 * the hosted donation page in DONATE_URL (e.g. a Ko-fi page). Keeping the
 * provider behind one env var means the public link (promptbattle.io/donate)
 * never changes when the provider does. Unset hides every donate button —
 * the default for self-hosted instances.
 */
export function donateUrl(): string | null {
  const raw = process.env.DONATE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function donationsEnabled(): boolean {
  return donateUrl() !== null;
}

const PROVIDER_NAMES: Record<string, string> = {
  "ko-fi.com": "Ko-fi",
  "buymeacoffee.com": "Buy Me a Coffee",
  "github.com": "GitHub Sponsors",
  "paypal.com": "PayPal",
  "paypal.me": "PayPal",
  "liberapay.com": "Liberapay",
  "opencollective.com": "Open Collective",
};

/** Human name of the payment provider behind DONATE_URL, for the fine print. */
export function donateProviderName(): string | null {
  const url = donateUrl();
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\./, "");
  return PROVIDER_NAMES[host] ?? host;
}

/**
 * The payment service the donation platform pays out through (e.g. the
 * Stripe account connected to Ko-fi), from DONATE_PROCESSOR. It sees the
 * donor's payment details, so the privacy policy names it too.
 */
export function donatePaymentProcessor(): string | null {
  return process.env.DONATE_PROCESSOR?.trim() || null;
}

/** "Ko-fi" or "Ko-fi / Stripe" — who handles a donation, for the fine print. */
export function donateHandledBy(): string | null {
  const provider = donateProviderName();
  if (!provider) return null;
  const processor = donatePaymentProcessor();
  return processor ? `${provider} / ${processor}` : provider;
}
