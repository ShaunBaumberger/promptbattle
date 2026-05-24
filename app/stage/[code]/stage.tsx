"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useStaleStateGuard } from "@/lib/use-stale-state-guard";
import type { PlayerCount, TournamentStatus } from "@/lib/types/database";
import { BracketView } from "./bracket-view";
import { ChampionView } from "./champion-view";
import { MatchStage } from "./match-stage";
import { useStageAudio } from "./use-stage-audio";

interface Props {
  tournamentId: string;
  tournamentCode: string;
  tournamentName: string;
  initialStatus: TournamentStatus;
  initialParticipantCount: number;
  initialCurrentMatchId: string | null;
  playerCount: PlayerCount;
}

export function Stage({
  tournamentId,
  tournamentCode,
  tournamentName,
  initialStatus,
  initialParticipantCount,
  initialCurrentMatchId,
  playerCount,
}: Props) {
  const [status, setStatus] = useState<TournamentStatus>(initialStatus);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(
    initialCurrentMatchId,
  );
  const [currentVideoPlaying, setCurrentVideoPlaying] = useState<
    "A" | "B" | null
  >(null);
  const [participantCount, setParticipantCount] = useState(initialParticipantCount);
  const [joinUrl, setJoinUrl] = useState<string>("");
  const audio = useStageAudio();

  // Champion fanfare exactly once when the tournament first transitions to
  // `finished` (and the audio context is already unlocked).
  const championFiredRef = useRef(false);
  useEffect(() => {
    if (status === "finished" && !championFiredRef.current) {
      championFiredRef.current = true;
      audio.play("champion");
    }
    if (status !== "finished") championFiredRef.current = false;
  }, [status, audio]);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/?code=${tournamentCode}`);
  }, [tournamentCode]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`stage:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${tournamentId}`,
        },
        (payload) => {
          const next = payload.new as {
            status: TournamentStatus;
            current_match_id: string | null;
            current_video_playing: "A" | "B" | null;
          };
          setStatus(next.status);
          setCurrentMatchId(next.current_match_id);
          setCurrentVideoPlaying(next.current_video_playing ?? null);
        },
      )
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

  // Safety net: if realtime drops an event, this catches us up on tab
  // visibility change and every 10s while visible.
  useStaleStateGuard(async () => {
    const supabase = createClient();
    const [tRes, cRes] = await Promise.all([
      supabase
        .from("tournaments")
        .select("status, current_match_id, current_video_playing")
        .eq("id", tournamentId)
        .maybeSingle(),
      supabase
        .from("participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId),
    ]);
    if (tRes.data) {
      setStatus(tRes.data.status as TournamentStatus);
      setCurrentMatchId(tRes.data.current_match_id);
      setCurrentVideoPlaying(
        (tRes.data.current_video_playing as "A" | "B" | null) ?? null,
      );
    }
    if (typeof cRes.count === "number") setParticipantCount(cRes.count);
  });

  if (status === "setup") {
    return (
      <>
        <SetupView
          tournamentName={tournamentName}
          tournamentCode={tournamentCode}
          joinUrl={joinUrl}
          participantCount={participantCount}
          playerCount={playerCount}
        />
        {!audio.enabled && <AudioEnableGate onEnable={audio.enable} />}
      </>
    );
  }

  // Match view wins over the "finished" headline so the audience sees the
  // reveal animation (winner crown + vote bars) on the final match. Once the
  // admin clears current_match_id, the finished view takes over.
  if (currentMatchId) {
    return (
      <>
        <MatchStage
          matchId={currentMatchId}
          tournamentId={tournamentId}
          play={audio.play}
          videoPlaying={currentVideoPlaying}
        />
        {!audio.enabled && <AudioEnableGate onEnable={audio.enable} />}
      </>
    );
  }

  if (status === "finished") {
    return (
      <>
        <ChampionView tournamentId={tournamentId} tournamentName={tournamentName} />
        {!audio.enabled && <AudioEnableGate onEnable={audio.enable} />}
      </>
    );
  }

  return (
    <>
      <main className="flex flex-1 flex-col gap-10 p-12">
        <header className="space-y-2 text-center">
          <p className="text-white/40 text-base uppercase tracking-[0.4em]">
            Prompt Battle
          </p>
          <h1 className="text-white text-6xl font-semibold tracking-tight">
            {tournamentName}
          </h1>
        </header>
        <BracketView tournamentId={tournamentId} playerCount={playerCount} />
      </main>
      {!audio.enabled && <AudioEnableGate onEnable={audio.enable} />}
    </>
  );
}

/** Floating button shown while the audio context hasn't been unlocked yet. */
function AudioEnableGate({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="fixed right-4 bottom-4 z-50">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onEnable}
        className="gap-2 shadow-lg"
      >
        <Volume2 className="size-4" />
        Audio aktivieren
      </Button>
    </div>
  );
}

function SetupView({
  tournamentName,
  tournamentCode,
  joinUrl,
  participantCount,
  playerCount,
}: {
  tournamentName: string;
  tournamentCode: string;
  joinUrl: string;
  participantCount: number;
  playerCount: PlayerCount;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-14 p-12">
      <header className="space-y-3 text-center duration-700 animate-in fade-in slide-in-from-top-2">
        <p className="text-white/50 text-xl uppercase tracking-[0.4em]">
          Prompt Battle
        </p>
        <h1 className="text-white text-8xl font-semibold tracking-tight">
          {tournamentName}
        </h1>
      </header>

      <div className="flex flex-col items-center gap-7 duration-700 animate-in fade-in zoom-in-95">
        <div className="rounded-3xl border border-white/10 bg-white p-7 shadow-[0_0_80px_rgba(56,189,248,0.25)]">
          {joinUrl ? (
            <QRCodeSVG value={joinUrl} size={360} level="M" marginSize={0} />
          ) : (
            <div className="bg-muted h-[360px] w-[360px] animate-pulse rounded-2xl" />
          )}
        </div>
        <div className="space-y-2 text-center">
          <p className="text-white/70 text-2xl">
            Scanne den Code oder gehe auf{" "}
            <span className="text-white font-mono font-semibold">
              {joinUrl.replace(/^https?:\/\//, "") || "…"}
            </span>
          </p>
          <p className="text-white text-5xl font-semibold tracking-[0.2em]">
            <span className="font-mono">{tournamentCode}</span>
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 px-10 py-6 text-center backdrop-blur duration-700 animate-in fade-in slide-in-from-bottom-2">
        <p className="text-white text-7xl font-semibold tabular-nums">
          {participantCount}
        </p>
        <p className="text-white/60 mt-1 text-xl">
          {participantCount === 1 ? "Person beigetreten" : "Personen beigetreten"}{" "}
          · {playerCount} Spieler:innen werden ausgewählt
        </p>
      </div>
    </main>
  );
}
