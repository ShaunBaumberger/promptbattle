"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  getStripe,
  stripeConfigured,
  premiumPriceCents,
  premiumCurrency,
} from "@/lib/stripe";

export type BillingActionState = { error?: string };

/**
 * Absolute origin for Stripe redirect URLs. Behind Vercel the request's
 * forwarded headers carry the real host (works for promptbattle.io, the
 * .vercel.app fallback, and localhost alike) — no hardcoded domain.
 */
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Start a Stripe Checkout for upgrading one tournament to premium
 * (pay-per-event). Only the owner, only before the bracket starts —
 * upgrading mid-game would change models/limits under a live bracket.
 */
export async function createCheckoutSessionAction(
  tournamentId: string,
  _prev: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const { dict } = await getServerDictionary();
  if (!stripeConfigured()) {
    return { error: interpolate(dict.admin.err.paymentInit, { msg: "Stripe not configured" }) };
  }

  const user = await getUser();
  if (!user) return { error: dict.admin.err.tournamentNotFound };

  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, plan, owner_id, is_test_mode")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.owner_id !== user.id) {
    return { error: dict.admin.err.tournamentNotFound };
  }
  if (tournament.plan === "premium") {
    return { error: dict.admin.err.alreadyPremium };
  }
  if (tournament.status !== "setup" || tournament.is_test_mode) {
    return { error: dict.admin.err.upgradeSetupOnly };
  }

  const base = await getBaseUrl();
  let checkoutUrl: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      // No payment_method_types → Stripe's automatic payment methods:
      // cards (Visa/Mastercard) always; TWINT / Apple Pay / Google Pay
      // as enabled in the Stripe Dashboard.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: premiumCurrency(),
            unit_amount: premiumPriceCents(),
            product_data: {
              name: `Prompt Battle Premium — ${tournament.name}`,
            },
          },
        },
      ],
      metadata: { tournament_id: tournament.id },
      customer_email: user.email ?? undefined,
      success_url: `${base}/admin/${tournament.id}?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/admin/${tournament.id}?upgrade=cancelled`,
    });
    checkoutUrl = session.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return { error: interpolate(dict.admin.err.paymentInit, { msg }) };
  }

  if (!checkoutUrl) {
    return { error: interpolate(dict.admin.err.paymentInit, { msg: "no checkout URL" }) };
  }
  redirect(checkoutUrl);
}
