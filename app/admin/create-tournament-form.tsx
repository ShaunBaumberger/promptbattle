"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTournamentAction, type CreateTournamentState } from "./actions";

const initial: CreateTournamentState = {};

export function CreateTournamentForm() {
  const [state, formAction, pending] = useActionState(createTournamentAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Turnier-Name</Label>
        <Input id="name" name="name" required placeholder="z. B. Prompt Battle 2026" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mode">Modus</Label>
        <select
          id="mode"
          name="mode"
          required
          defaultValue="8"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="2">2 Spieler (nur Finale)</option>
          <option value="4">4 Spieler (Halbfinale → Finale)</option>
          <option value="8">8 Spieler (Viertelfinale → Finale)</option>
          <option value="16">16 Spieler (Achtelfinale → Finale)</option>
          <option value="32">32 Spieler (Sechzehntelfinale → Finale)</option>
          <option value="test">Test-Modus (Debug · 2 Spieler)</option>
        </select>
        <p className="text-muted-foreground text-xs">
          Test-Modus: Match-Wiederholung, Bildgenerierung-Skip, kein
          automatisches Turnier-Ende.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="round_time_seconds">Rundenzeit (Sekunden)</Label>
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
        {pending ? "Wird erstellt…" : "Turnier erstellen"}
      </Button>
    </form>
  );
}
