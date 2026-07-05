"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, interpolate } from "@/lib/i18n/context";
import {
  createCheckoutSessionAction,
  type BillingActionState,
} from "./billing-actions";

const initial: BillingActionState = {};

/**
 * Pay-per-event upgrade box. Shown only while the tournament is free,
 * in setup, and Stripe is configured. The button posts to a server
 * action that creates a Stripe Checkout Session and redirects — no
 * client-side Stripe SDK needed (the checkout page is Stripe-hosted,
 * with cards always available and TWINT & wallets per dashboard config).
 */
export function UpgradeCard({
  tournamentId,
  priceDisplay,
}: {
  tournamentId: string;
  /** Localized price string, e.g. "CHF 9.00" — computed server-side. */
  priceDisplay: string;
}) {
  const { dict } = useI18n();
  const bound = createCheckoutSessionAction.bind(null, tournamentId);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <div className="space-y-3 rounded-md border border-amber-400/50 bg-amber-400/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-amber-500" aria-hidden />
        <h2 className="text-base font-semibold">{dict.admin.upgradeTitle}</h2>
      </div>
      <p className="text-muted-foreground text-sm">{dict.admin.upgradeDesc}</p>
      <p className="text-muted-foreground text-xs">
        {dict.admin.paymentMethodsNote}
      </p>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      <form action={formAction}>
        <Button type="submit" disabled={pending}>
          {pending
            ? dict.admin.upgradeRedirecting
            : interpolate(dict.admin.upgradeButton, { price: priceDisplay })}
        </Button>
      </form>
    </div>
  );
}
