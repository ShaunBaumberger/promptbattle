"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import type { PlayerCount, Round } from "@/lib/types/database";
import { startBracketAction, type StartBracketState } from "./actions";

interface Props {
  tournamentId: string;
  playerCount: PlayerCount;
  initialParticipantCount: number;
  initialTasksByRound: Record<Round, number>;
}

const initial: StartBracketState = {};

export function StartBracketForm({
  tournamentId,
  playerCount,
  initialParticipantCount,
  initialTasksByRound,
}: Props) {
  const rounds = getRoundsForPlayerCount(playerCount);
  const [participantCount, setParticipantCount] = useState(initialParticipantCount);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-start:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "participants",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => setParticipantCount((c) => c + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "participants",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => setParticipantCount((c) => Math.max(0, c - 1)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const boundAction = startBracketAction.bind(null, tournamentId);
  const [state, formAction, pending] = useActionState(boundAction, initial);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) toast.success("Tournament gestartet!");
  }, [state]);

  const enoughPlayers = participantCount >= playerCount;
  const tasksOk = rounds.every(
    (r) => (initialTasksByRound[r.round] ?? 0) >= r.matches,
  );
  const ready = enoughPlayers && tasksOk;

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Tournament starten</h2>
        <p className="text-muted-foreground text-sm">
          Wählt zufällig {playerCount} Spieler aus den Teilnehmern und erstellt den Bracket.
          Nicht ausgewählte Personen werden zu Zuschauern.
        </p>
      </div>

      <ul className="space-y-1 text-sm">
        <li className={enoughPlayers ? "text-foreground" : "text-muted-foreground"}>
          {enoughPlayers ? "✓" : "•"} Teilnehmer: {participantCount} / {playerCount}
        </li>
        {rounds.map((r) => {
          const have = initialTasksByRound[r.round] ?? 0;
          const ok = have >= r.matches;
          return (
            <li
              key={r.round}
              className={ok ? "text-foreground" : "text-muted-foreground"}
            >
              {ok ? "✓" : "•"} {r.label}: {have} / {r.matches} Tasks
            </li>
          );
        })}
      </ul>

      <form action={formAction}>
        <Button type="submit" disabled={!ready || pending}>
          {pending ? "Wird gestartet…" : "Spieler auswählen & starten"}
        </Button>
      </form>
    </div>
  );
}
