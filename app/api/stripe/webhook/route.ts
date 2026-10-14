import type Stripe from "stripe";
import { getStripe, fulfillCheckoutSession } from "@/lib/stripe";

/**
 * Stripe webhook — the async leg of fulfillment. The success-redirect
 * already fulfills for users who return to the app; this endpoint covers
 * everyone else (tab closed after paying, TWINT app-switch, async
 * payment methods that confirm after redirect).
 *
 * Setup: Stripe Dashboard → Developers → Webhooks → Add endpoint
 *   https://<your-domain>/api/stripe/webhook
 * with events `checkout.session.completed` and
 * `checkout.session.async_payment_succeeded`, then put the signing
 * secret in STRIPE_WEBHOOK_SECRET. Optional but recommended for
 * production — without it, only redirect-fulfillment runs.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("webhook not configured", { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  // Signature verification needs the raw body — read as text, never JSON.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    // Idempotent — safe even though the redirect path may already have
    // fulfilled this session.
    await fulfillCheckoutSession(session.id);
  }

  return new Response("ok", { status: 200 });
}
