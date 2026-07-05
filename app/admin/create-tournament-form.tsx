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
        <Label htmlFor="mode">{dict.admin.mode}</Label>
        <select
          id="mode"
          name="mode"
          required
          defaultValue="8"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="2">{dict.admin.modeOpt2}</option>
          <option value="4">{dict.admin.modeOpt4}</option>
          <option value="8">{dict.admin.modeOpt8}</option>
          {/* 16/32 are premium brackets — visible so hosts see what's
              coming, disabled until the Stripe build ships. The server
              enforces the same gate. */}
          <option value="16" disabled>
            {dict.admin.modeOpt16} {dict.admin.premiumTag}
          </option>
          <option value="32" disabled>
            {dict.admin.modeOpt32} {dict.admin.premiumTag}
          </option>
          <option value="test">{dict.admin.modeOptTest}</option>
        </select>
        <p className="text-muted-foreground text-xs">{dict.admin.planFreeInfo}</p>
        <p className="text-muted-foreground text-xs">{dict.admin.upgradeHint}</p>
        <p className="text-muted-foreground text-xs">{dict.admin.testModeHint}</p>
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="round_time_seconds">{dict.admin.roundTimeSeconds}</Label>
        <Input
          id="round_time_seconds"
          name="round_time_seconds"
          type="number"
          min={10}
          max={600}
          defaultValue={60}
        />
      </div>

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
