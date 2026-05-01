"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Match, Participant } from "@/lib/types/database";

interface Props {
  tournamentId: string;
  tournamentName: string;
}

/**
 * Tournament-finished celebration: champion's name + their winning image,
 * trophy, runner-up tag. Fetches the FINAL match (status='done') and
 * resolves the winner participant.
 */
export function ChampionView({ tournamentId, tournamentName }: Props) {
  const [final, setFinal] = useState<Match | null>(null);
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
          .eq("round", "FINAL")
          .eq("status", "done")
          .maybeSingle(),
        supabase
          .from("participants")
          .select("*")
          .eq("tournament_id", tournamentId)
          .eq("is_player", true),
      ]);
      if (cancelled) return;
      setFinal((m.data ?? null) as Match | null);
      setParticipants((p.data ?? []) as Participant[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  if (!loaded) {
    return (
      <main className="bg-background flex flex-1 items-center justify-center p-12">
        <p className="text-muted-foreground text-2xl">Lade Champion…</p>
      </main>
    );
  }

  if (!final || !final.winner_id) {
    return (
      <main className="bg-background flex flex-1 items-center justify-center p-12 text-center">
        <h1 className="text-6xl font-bold tracking-tight">{tournamentName} – Vorbei!</h1>
      </main>
    );
  }

  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const championName = nameById.get(final.winner_id) ?? "?";
  const runnerUpId =
    final.winner_id === final.player_a_id ? final.player_b_id : final.player_a_id;
  const runnerUpName = runnerUpId ? nameById.get(runnerUpId) ?? "?" : null;
  const championImage =
    final.winner_id === final.player_a_id ? final.result_a_url : final.result_b_url;

  return (
    <main className="bg-background relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden p-12 text-center">
      <ConfettiBackdrop />

      <div className="z-10 flex flex-col items-center gap-4 duration-700 animate-in fade-in slide-in-from-bottom-4">
        <p className="text-muted-foreground text-2xl uppercase tracking-[0.4em]">
          {tournamentName}
        </p>
        <p className="text-amber-500 text-3xl font-bold uppercase tracking-[0.4em] drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]">
          Champion
        </p>
      </div>

      <div className="z-10 flex flex-col items-center gap-2 delay-200 duration-700 animate-in fade-in zoom-in-95 fill-mode-both">
        <span className="text-9xl drop-shadow-[0_0_30px_rgba(251,191,36,0.6)]">🏆</span>
        <h1 className="text-foreground text-8xl font-bold tracking-tight">
          {championName}
        </h1>
      </div>

      {championImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={championImage}
          alt={`Sieger:innen-Bild von ${championName}`}
          className="z-10 max-h-[40vh] w-auto rounded-lg border-4 border-amber-400 object-contain shadow-[0_0_80px_rgba(251,191,36,0.5)] delay-500 duration-1000 animate-in fade-in zoom-in-95 fill-mode-both"
        />
      ) : null}

      {runnerUpName && (
        <p className="text-muted-foreground z-10 text-xl delay-700 duration-700 animate-in fade-in fill-mode-both">
          Vize-Champion: <span className="font-semibold">{runnerUpName}</span>
        </p>
      )}
    </main>
  );
}

/**
 * Pure-CSS confetti — 24 small squares falling from the top with random
 * delays/colors. Each animates independently via inline style. No JS
 * timers, no asset bundle.
 */
function ConfettiBackdrop() {
  const pieces = Array.from({ length: 32 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = (i * 37) % 100; // pseudo-random spread
        const delay = ((i * 173) % 4000) / 1000; // 0..4s
        const duration = 4 + ((i * 91) % 4000) / 1000; // 4..8s
        const colors = [
          "#fbbf24",
          "#f59e0b",
          "#ef4444",
          "#3b82f6",
          "#10b981",
          "#a855f7",
        ];
        const color = colors[i % colors.length];
        const size = 8 + (i % 3) * 4; // 8..16px
        return (
          <span
            key={i}
            className="absolute top-[-20px] block animate-confetti-fall rounded-sm"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size * 1.6}px`,
              background: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  );
}
