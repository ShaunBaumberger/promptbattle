"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
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
          };
          setStatus(next.status);
          setCurrentMatchId(next.current_match_id);
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
      <main className="bg-background flex flex-1 flex-col gap-8 p-12">
        <header className="text-center">
          <h1 className="text-5xl font-bold tracking-tight">{tournamentName}</h1>
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
    <main className="bg-background flex flex-1 flex-col items-center justify-center gap-12 p-12">
      <header className="space-y-2 text-center">
        <p className="text-muted-foreground text-xl uppercase tracking-widest">
          Prompt Battle
        </p>
        <h1 className="text-7xl font-bold tracking-tight">{tournamentName}</h1>
      </header>

      <div className="flex flex-col items-center gap-6">
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {joinUrl ? (
            <QRCodeSVG value={joinUrl} size={360} level="M" marginSize={0} />
          ) : (
            <div className="bg-muted h-[360px] w-[360px] animate-pulse rounded" />
          )}
        </div>
        <div className="space-y-1 text-center">
          <p className="text-2xl">
            Scanne den Code oder gehe auf{" "}
            <span className="font-mono font-semibold">
              {joinUrl.replace(/^https?:\/\//, "") || "…"}
            </span>
          </p>
          <p className="text-4xl font-bold tracking-widest">
            Code: <span className="font-mono">{tournamentCode}</span>
          </p>
        </div>
      </div>

      <div className="text-center">
        <p className="text-6xl font-bold">{participantCount}</p>
        <p className="text-muted-foreground text-2xl">
          {participantCount === 1 ? "Person beigetreten" : "Personen beigetreten"} –{" "}
          {playerCount} Spieler werden ausgewählt
        </p>
      </div>
    </main>
  );
}
