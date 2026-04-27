"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import type { Match, Participant, PlayerCount, Round } from "@/lib/types/database";

interface Props {
  tournamentId: string;
  playerCount: PlayerCount;
}

export function BracketView({ tournamentId, playerCount }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [m, p] = await Promise.all([
        supabase
          .from("matches")
          .select("*")
          .eq("tournament_id", tournamentId)
          .order("round", { ascending: true })
          .order("bracket_position", { ascending: true }),
        supabase
          .from("participants")
          .select("*")
          .eq("tournament_id", tournamentId)
          .eq("is_player", true),
      ]);
      if (cancelled) return;
      setMatches((m.data ?? []) as Match[]);
      setParticipants((p.data ?? []) as Participant[]);
      setLoaded(true);
    })();

    const channel = supabase
      .channel(`bracket:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          setMatches((prev) => {
            if (payload.eventType === "INSERT") return [...prev, payload.new as Match];
            if (payload.eventType === "UPDATE") {
              const next = payload.new as Match;
              return prev.map((m) => (m.id === next.id ? next : m));
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as { id: string };
              return prev.filter((m) => m.id !== old.id);
            }
            return prev;
          });
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
          setParticipants((prev) => {
            const exists = prev.some((p) => p.id === next.id);
            if (next.is_player) {
              return exists ? prev.map((p) => (p.id === next.id ? next : p)) : [...prev, next];
            }
            return prev.filter((p) => p.id !== next.id);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.name);
    return m;
  }, [participants]);

  const rounds = getRoundsForPlayerCount(playerCount);
  const matchesByRound = useMemo(() => {
    const m = new Map<Round, Match[]>();
    for (const match of matches) {
      const arr = m.get(match.round) ?? [];
      arr.push(match);
      m.set(match.round, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.bracket_position - b.bracket_position);
    return m;
  }, [matches]);

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-2xl">Bracket wird geladen…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-stretch justify-center gap-0 px-4">
      {rounds.map((spec, ri) => {
        const list = matchesByRound.get(spec.round) ?? [];
        return (
          <Fragment key={spec.round}>
            <div className="flex min-w-[180px] flex-1 flex-col">
              <h3 className="text-muted-foreground py-3 text-center text-base font-medium uppercase tracking-[0.2em]">
                {spec.label}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-3 py-2">
                {Array.from({ length: spec.matches }).map((_, i) => (
                  <MatchCard key={i} match={list[i]} nameById={nameById} />
                ))}
              </div>
            </div>
            {ri < rounds.length - 1 && (
              <div className="flex flex-col">
                {/* Spacer to align connectors with match area, not header */}
                <div className="invisible py-3 text-base">.</div>
                <div className="flex-1 py-2">
                  <ConnectorSVG fromCount={spec.matches} />
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function ConnectorSVG({ fromCount }: { fromCount: number }) {
  if (fromCount < 2) return null;
  const pairs = fromCount / 2;
  const segments: string[] = [];
  for (let p = 0; p < pairs; p++) {
    const a = 2 * p;
    const b = 2 * p + 1;
    const yA = ((a + 0.5) / fromCount) * 100;
    const yB = ((b + 0.5) / fromCount) * 100;
    const yMid = (yA + yB) / 2;
    // From source-match A right edge → halfway → down/up to mid → over to next round.
    segments.push(`M 0 ${yA} H 50 V ${yMid} H 100`);
    // From source-match B → meet the vertical at midpoint.
    segments.push(`M 0 ${yB} H 50`);
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-full w-12"
      fill="none"
    >
      <path
        d={segments.join(" ")}
        className="stroke-border"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MatchCard({
  match,
  nameById,
}: {
  match: Match | undefined;
  nameById: Map<string, string>;
}) {
  if (!match) {
    return (
      <div className="bg-muted/20 flex flex-col gap-1 rounded-md border border-dashed p-2">
        <Slot label="—" state="empty" />
        <Slot label="—" state="empty" />
      </div>
    );
  }

  const aName = match.player_a_id ? nameById.get(match.player_a_id) ?? "?" : "—";
  const bName = match.player_b_id ? nameById.get(match.player_b_id) ?? "?" : "—";
  const aWins = match.winner_id != null && match.winner_id === match.player_a_id;
  const bWins = match.winner_id != null && match.winner_id === match.player_b_id;
  const isLive =
    match.status !== "pending" && match.status !== "done" && match.status !== "reveal";
  const decided = match.winner_id != null;

  return (
    <div
      className={`bg-card flex flex-col gap-1 rounded-md border p-2 transition-shadow ${
        isLive
          ? "ring-foreground border-foreground shadow-lg ring-2"
          : "border-border"
      }`}
    >
      <Slot
        label={aName}
        state={aWins ? "winner" : decided ? "loser" : match.player_a_id ? "set" : "empty"}
      />
      <Slot
        label={bName}
        state={bWins ? "winner" : decided ? "loser" : match.player_b_id ? "set" : "empty"}
      />
    </div>
  );
}

function Slot({
  label,
  state,
}: {
  label: string;
  state: "set" | "winner" | "loser" | "empty";
}) {
  const cls =
    state === "winner"
      ? "text-foreground font-bold"
      : state === "loser"
        ? "text-muted-foreground/50 line-through"
        : state === "empty"
          ? "text-muted-foreground/60"
          : "text-foreground";
  return (
    <div className={`flex items-center gap-1 truncate text-base ${cls}`}>
      {state === "winner" && <span className="text-base">🏆</span>}
      <span className="truncate">{label}</span>
    </div>
  );
}
