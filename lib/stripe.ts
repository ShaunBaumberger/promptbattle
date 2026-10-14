import "server-only";

import Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Stripe pay-per-event integration.
 *
 * One tournament = one one-time payment. We use Stripe-hosted Checkout so
 * PCI scope stays with Stripe and payment methods come from the Stripe
 * Dashboard's "automatic payment methods": Visa/Mastercard (and other
 * cards) are always on; TWINT — essential for the Swiss launch market —
 * plus Apple Pay / Google Pay light up as soon as they're enabled in the
 * dashboard, with no code change (we deliberately do NOT pass
 * payment_method_types, which would hard-fail on methods not yet
 * activated for the account).
 *
 * Fulfillment is idempotent and double-covered:
 *   1. success redirect → the tournament admin page verifies the session
 *      server-side (fulfillCheckoutSession) before rendering, and
 *   2. the /api/stripe/webhook endpoint (optional but recommended)
 *      handles checkout.session.completed — catches users who paid but
 *      never returned (closed tab, TWINT app switch, async methods).
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  cached = new Stripe(key);
  return cached;
}

/** True when Stripe is configured — gates the whole upgrade UI. */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Price of one premium upgrade, in minor units (rappen/cents). */
export function premiumPriceCents(): number {
  const n = Number(process.env.PREMIUM_PRICE_CENTS ?? 900);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 900;
}

/** ISO currency for the premium price. CHF for the Swiss launch. */
export function premiumCurrency(): string {
  return (process.env.PREMIUM_CURRENCY ?? "chf").toLowerCase();
}

/** Locale-aware display string, e.g. "CHF 9.00". */
export function premiumPriceDisplay(locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: premiumCurrency().toUpperCase(),
    }).format(premiumPriceCents() / 100);
  } catch {
    return `${premiumCurrency().toUpperCase()} ${(premiumPriceCents() / 100).toFixed(2)}`;
  }
}

/**
 * Verify a Checkout Session against the Stripe API and, if paid, flip the
 * tournament it references to premium. Safe to call any number of times
 * from any path (redirect, webhook, retries):
 *   * the session is retrieved server-side from Stripe — the caller-
 *     supplied id can't forge a payment, and the tournament to upgrade
 *     comes from the session's OWN metadata, not from the caller;
 *   * the update is guarded on plan='free', so replays no-op.
 */
export async function fulfillCheckoutSession(
  sessionId: string,
): Promise<{ ok: boolean; tournamentId?: string }> {
  if (!sessionId || !stripeConfigured()) return { ok: false };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch {
    return { ok: false };
  }

  if (session.payment_status !== "paid") return { ok: false };
  const tournamentId = session.metadata?.tournament_id;
  if (!tournamentId) return { ok: false };

  const supabase = createServiceRoleClient();
  await supabase
    .from("tournaments")
    .update({
      plan: "premium",
      premium_session_id: sessionId,
      premium_paid_at: new Date().toISOString(),
    })
    .eq("id", tournamentId)
    .eq("plan", "free");

  return { ok: true, tournamentId };
}
