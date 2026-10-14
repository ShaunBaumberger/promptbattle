"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTournamentAction, type CreateTournamentState } from "./actions";
import { useI18n } from "@/lib/i18n/context";

const initial: CreateTournamentState = {};

export function CreateTournamentForm() {
  const { dict } = useI18n();
  const [state, formAction, pending] = useActionState(createTournamentAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{dict.admin.tournamentName}</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder={dict.admin.tournamentNamePlaceholder}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="venue">{dict.admin.venue}</Label>
        <select
          id="venue"
          name="venue"
          required
          defaultValue="onsite"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="onsite">{dict.admin.venueOnsite}</option>
          <option value="online">{dict.admin.venueOnline}</option>
        </select>
        <p className="text-muted-foreground text-xs">{dict.admin.venueHint}</p>
      </div>

      {/* Player count, round times, and test/live mode are all configured
          in the tournament's settings after creation — the form stays
          minimal (defaults: 8 players, 60s rounds, free plan). */}
      <p className="text-muted-foreground text-xs">{dict.admin.planFreeInfo}</p>
      <p className="text-muted-foreground text-xs">{dict.admin.bigEventsHint}</p>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? dict.admin.creating : dict.admin.createButton}
      </Button>
    </form>
  );
}
