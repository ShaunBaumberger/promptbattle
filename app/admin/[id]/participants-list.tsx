"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { Participant } from "@/lib/types/database";

interface Props {
  tournamentId: string;
  initialParticipants: Participant[];
}

export function ParticipantsList({ tournamentId, initialParticipants }: Props) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-participants:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "participants",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          setParticipants((prev) => [...prev, payload.new as Participant]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "participants",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          const next = payload.new as Participant;
          setParticipants((prev) => prev.map((p) => (p.id === next.id ? next : p)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "participants",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          const old = payload.old as { id: string };
          setParticipants((prev) => prev.filter((p) => p.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const players = participants.filter((p) => p.is_player);
  const viewers = participants.filter((p) => !p.is_player);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Teilnehmer</h2>
        <p className="text-muted-foreground text-sm">
          {participants.length} insgesamt · {players.length} Spieler · {viewers.length} Zuschauer
        </p>
      </div>

      {participants.length === 0 ? (
        <p className="text-muted-foreground text-sm">Noch niemand beigetreten.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="truncate">{p.name}</span>
              {p.is_player && (
                <Badge variant="default" className="ml-2">
                  Spieler
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
