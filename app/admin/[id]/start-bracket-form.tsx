"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import type { PlayerCount, Round } from "@/lib/types/database";
import { startBracketAction, type StartBracketState } from "./actions";
import { useI18n, interpolate } from "@/lib/i18n/context";
import { FREE_GAMES_PER_WINDOW } from "@/lib/tiers";

interface Props {
  tournamentId: string;
  playerCount: PlayerCount;
  initialParticipantCount: number;
  initialTasksByRound: Record<Round, number>;
  /** Remaining free games in the rolling 30-day window; null = not capped
   *  (premium / test mode). Shown pre-flight so the cap never surprises a
   *  host mid-event. */
  freeGamesLeft: number | null;
  /** Worst-case generation cost estimate (USD string); null when nothing
   *  will be generated (test mode). */
  estCostUsd: string | null;
}

const initial: StartBracketState = {};

export function StartBracketForm({
  tournamentId,
  playerCount,
  initialParticipantCount,
  initialTasksByRound,
  freeGamesLeft,
  estCostUsd,
}: Props) {
  const { dict } = useI18n();
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
    if (state.ok) toast.success(dict.admin.tournamentStarted);
  }, [state, dict]);

  const enoughPlayers = participantCount >= playerCount;
  const tasksOk = rounds.every(
    (r) => (initialTasksByRound[r.round] ?? 0) >= r.matches,
  );
  const ready = enoughPlayers && tasksOk;

  return (
    <div className="bg-card space-y-4 rounded-2xl border p-5">
      <div className="space-y-1">
        <h2 className="font-display text-base font-bold">{dict.admin.startTournament}</h2>
        <p className="text-muted-foreground text-sm">
          {interpolate(dict.admin.startTournamentHint, { count: playerCount })}
        </p>
      </div>

      <ul className="space-y-1 text-sm">
        <li className={enoughPlayers ? "text-foreground" : "text-muted-foreground"}>
          {enoughPlayers ? "✓" : "•"}{" "}
          {interpolate(dict.admin.participantsProgress, {
            have: participantCount,
            need: playerCount,
          })}
        </li>
        {rounds.map((r) => {
          const have = initialTasksByRound[r.round] ?? 0;
          const ok = have >= r.matches;
          return (
            <li
              key={r.round}
              className={ok ? "text-foreground" : "text-muted-foreground"}
            >
              {ok ? "✓" : "•"} {dict.rounds[r.round]}:{" "}
              {interpolate(dict.admin.tasksProgress, { have, need: r.matches })}
            </li>
          );
        })}
      </ul>

      {/* Cost-protection pre-flight: quota + estimated cost are shown
          BEFORE the start button. Once started, a game always finishes —
          no cap ever interrupts a live bracket. */}
      {(freeGamesLeft !== null || estCostUsd !== null) && (
        <div className="bg-muted/40 space-y-1 rounded-md border border-dashed p-3 text-xs">
          {freeGamesLeft !== null && (
            <p className={freeGamesLeft === 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
              {interpolate(dict.admin.freeGamesLeft, {
                n: freeGamesLeft,
                max: FREE_GAMES_PER_WINDOW,
              })}
            </p>
          )}
          {estCostUsd !== null && (
            <p className="text-muted-foreground">
              {interpolate(dict.admin.estCost, { usd: estCostUsd })}
            </p>
          )}
        </div>
      )}

      <form action={formAction}>
        <Button
          type="submit"
          disabled={!ready || pending || freeGamesLeft === 0}
        >
          {pending ? dict.admin.startingBracket : dict.admin.selectAndStart}
        </Button>
      </form>
    </div>
  );
}
