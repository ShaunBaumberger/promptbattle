"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { ROUND_LABELS } from "@/lib/rounds";
import type {
  Match,
  MatchStatus,
  Participant,
  PlayerCount,
  Tournament,
} from "@/lib/types/database";
import {
  prepareNextMatchAction,
  startCurrentMatchAction,
  lockMatchAction,
  replayMatchAction,
  setMatchWinnerAction,
  setSkipGenerationAction,
  clearCurrentMatchAction,
  type MatchActionState,
} from "./match-actions";
import {
  startVotingAction,
  endVotingAction,
  getVoteCountAction,
} from "./voting-actions";
import { generateMatchImagesAction } from "./generation-actions";
import { RestartMatchDialog } from "./restart-match-dialog";

interface Props {
  tournamentId: string;
  initialCurrentMatchId: string | null;
  roundTimeSeconds: number;
  playerCount: PlayerCount;
  initialSkipGeneration: boolean;
  isTestMode: boolean;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: "Bereit",
  preparing: "In Vorbereitung",
  live: "Läuft",
  locked: "Zeit abgelaufen",
  generating: "Bilder werden generiert",
  reveal: "Reveal",
  voting: "Voting",
  done: "Abgeschlossen",
};

const initial: MatchActionState = {};

export function MatchControl({
  tournamentId,
  initialCurrentMatchId,
  roundTimeSeconds,
  playerCount: _playerCount,
  initialSkipGeneration,
  isTestMode,
}: Props) {
  const [skipGeneration, setSkipGeneration] = useState(initialSkipGeneration);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(
    initialCurrentMatchId,
  );
  const [match, setMatch] = useState<Match | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("participants")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("is_player", true);
      if (cancelled) return;
      setParticipants((data ?? []) as Participant[]);
      setLoaded(true);
    })();

    const channel = supabase
      .channel(`admin-match-control:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${tournamentId}`,
        },
        (payload) => {
          const next = payload.new as Tournament;
          setCurrentMatchId(next.current_match_id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const m = payload.new as Match;
            setMatch((prev) => (prev?.id === m.id ? m : prev));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  // Re-fetch the live match whenever current_match_id changes.
  useEffect(() => {
    if (!currentMatchId) {
      setMatch(null);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .eq("id", currentMatchId)
        .maybeSingle();
      if (cancelled) return;
      setMatch((data ?? null) as Match | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentMatchId]);

  const boundPrepare = prepareNextMatchAction.bind(null, tournamentId);
  const [prepareState, prepareAction, preparePending] = useActionState(
    boundPrepare,
    initial,
  );

  const boundStart = match
    ? startCurrentMatchAction.bind(null, match.id)
    : null;
  const [startState, startAction, startPending] = useActionState(
    boundStart ?? (async () => initial),
    initial,
  );

  const boundLock = match ? lockMatchAction.bind(null, match.id) : null;
  const [lockState, lockAction, lockPending] = useActionState(
    boundLock ?? (async () => initial),
    initial,
  );

  const boundReplay = match ? replayMatchAction.bind(null, match.id) : null;
  const [replayState, replayAction, replayPending] = useActionState(
    boundReplay ?? (async () => initial),
    initial,
  );

  const boundClearMatch = clearCurrentMatchAction.bind(null, tournamentId);
  const [clearState, clearAction, clearPending] = useActionState(
    boundClearMatch,
    initial,
  );

  useEffect(() => {
    if (prepareState.error) toast.error(prepareState.error);
    if (prepareState.ok) toast.success("Match vorbereitet.");
  }, [prepareState]);
  useEffect(() => {
    if (startState.error) toast.error(startState.error);
    if (startState.ok) toast.success("Match gestartet.");
  }, [startState]);
  useEffect(() => {
    if (lockState.error) toast.error(lockState.error);
    if (lockState.ok) toast.success("Match gesperrt.");
  }, [lockState]);
  useEffect(() => {
    if (replayState.error) toast.error(replayState.error);
    if (replayState.ok) toast.success("Match neu gestartet.");
  }, [replayState]);
  useEffect(() => {
    if (clearState.error) toast.error(clearState.error);
    if (clearState.ok) toast.success("Bracket angezeigt.");
  }, [clearState]);

  // Auto-fire generation when the match enters the locked state. Server-side
  // atomic guard ensures only one trigger wins if multiple clients fan out.
  // Key by start_time too, otherwise a replay/kill-switch with the same
  // match.id wouldn't re-fire generation.
  const generationFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!match || match.status !== "locked") return;
    const key = `${match.id}:${match.start_time ?? ""}`;
    if (generationFiredRef.current === key) return;
    generationFiredRef.current = key;
    generateMatchImagesAction(match.id).catch(() => {});
  }, [match]);

  const [winnerPending, startWinnerTransition] = useTransition();
  const pickWinner = (winnerId: string) => {
    if (!match) return;
    startWinnerTransition(async () => {
      const result = await setMatchWinnerAction(
        match.id,
        winnerId,
        {},
        new FormData(),
      );
      if (result.error) toast.error(result.error);
      if (result.ok) toast.success("Sieger gespeichert.");
    });
  };

  const boundStartVoting = match ? startVotingAction.bind(null, match.id) : null;
  const [startVotingState, startVotingFormAction, startVotingPending] = useActionState(
    boundStartVoting ?? (async () => initial),
    initial,
  );
  const boundEndVoting = match ? endVotingAction.bind(null, match.id) : null;
  const [endVotingState, endVotingFormAction, endVotingPending] = useActionState(
    boundEndVoting ?? (async () => initial),
    initial,
  );

  useEffect(() => {
    if (startVotingState.error) toast.error(startVotingState.error);
    if (startVotingState.ok) toast.success("Voting gestartet.");
  }, [startVotingState]);
  useEffect(() => {
    if (endVotingState.error) toast.error(endVotingState.error);
    if (endVotingState.ok) toast.success("Voting beendet.");
  }, [endVotingState]);

  // Poll the vote count while voting is open, so the admin sees activity
  // without leaking per-player breakdown to anyone (anon clients can't read votes).
  const [voteCount, setVoteCount] = useState(0);
  useEffect(() => {
    if (!match || match.status !== "voting") {
      setVoteCount(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const n = await getVoteCountAction(match.id).catch(() => 0);
      if (!cancelled) setVoteCount(n);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [match?.id, match?.status]);

  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  if (!loaded) {
    return (
      <div className="rounded-md border p-4">
        <p className="text-muted-foreground text-sm">Lade Match-Status…</p>
      </div>
    );
  }

  const toggleSkipGeneration = (next: boolean) => {
    setSkipGeneration(next); // optimistic
    setSkipGenerationAction(tournamentId, next).then((result) => {
      if (result.error) {
        toast.error(result.error);
        setSkipGeneration(!next); // rollback
      }
    });
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Match-Steuerung</h2>
        <p className="text-muted-foreground text-xs">
          Rundenzeit: {roundTimeSeconds}s
        </p>
      </div>

      {isTestMode && (
        <label className="bg-muted/40 flex cursor-pointer items-start gap-2 rounded-md border border-dashed p-3 text-sm">
          <input
            type="checkbox"
            checked={skipGeneration}
            onChange={(e) => toggleSkipGeneration(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Bildgenerierung überspringen (Test)</span>
            <br />
            <span className="text-muted-foreground text-xs">
              Spart API-Kosten beim Testen. Reveal hat dann keine Bilder.
            </span>
          </span>
        </label>
      )}

      {match ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {ROUND_LABELS[match.round]} – Match {match.bracket_position + 1}
            </p>
            <Badge variant="secondary">{STATUS_LABEL[match.status]}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <PlayerCell
              name={nameById.get(match.player_a_id ?? "") ?? "?"}
              prompt={match.prompt_a}
            />
            <PlayerCell
              name={nameById.get(match.player_b_id ?? "") ?? "?"}
              prompt={match.prompt_b}
            />
          </div>
          {match.status === "live" && (
            <CountdownLine endTime={match.end_time} />
          )}
          {match.status === "live" && (
            <div className="flex flex-wrap gap-2">
              <form action={lockAction}>
                <Button type="submit" variant="outline" size="sm" disabled={lockPending}>
                  {lockPending ? "Wird gesperrt…" : "Vorzeitig sperren"}
                </Button>
              </form>
              <RestartMatchDialog matchId={match.id} />
            </div>
          )}
          {(match.status === "locked" ||
            match.status === "generating" ||
            match.status === "reveal") && (
            <RestartMatchDialog matchId={match.id} />
          )}
          {match.status === "reveal" && (
            <form action={startVotingFormAction}>
              <Button type="submit" disabled={startVotingPending}>
                {startVotingPending ? "Wird gestartet…" : "Voting starten"}
              </Button>
            </form>
          )}
          {match.status === "voting" && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Voting läuft</p>
                <Badge variant="secondary">
                  {voteCount} {voteCount === 1 ? "Stimme" : "Stimmen"}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                Einzelstimmen werden absichtlich nicht angezeigt.
              </p>
              <form action={endVotingFormAction}>
                <Button type="submit" disabled={endVotingPending}>
                  {endVotingPending ? "Wird beendet…" : "Voting beenden"}
                </Button>
              </form>
            </div>
          )}
          {(match.status === "reveal" || match.status === "voting") &&
            match.player_a_id &&
            match.player_b_id && (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <p className="text-sm font-semibold">
                  Sieger manuell wählen{" "}
                  <span className="text-muted-foreground text-xs font-normal">
                    (überspringt das Voting)
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => pickWinner(match.player_a_id!)}
                    disabled={winnerPending}
                  >
                    {nameById.get(match.player_a_id) ?? "?"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => pickWinner(match.player_b_id!)}
                    disabled={winnerPending}
                  >
                    {nameById.get(match.player_b_id) ?? "?"}
                  </Button>
                </div>
              </div>
            )}
          {match.status === "done" && match.winner_id && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                Sieger:{" "}
                <span className="font-semibold">
                  {nameById.get(match.winner_id) ?? "?"}
                </span>
              </p>
              <form action={clearAction}>
                <Button type="submit" variant="outline" size="sm" disabled={clearPending}>
                  {clearPending ? "Wechselt…" : "Zurück zum Bracket"}
                </Button>
              </form>
            </div>
          )}
          {isTestMode && match.status !== "live" && (
            <form action={replayAction}>
              <Button type="submit" size="sm" variant="outline" disabled={replayPending}>
                {replayPending ? "Wird neu gestartet…" : "Match neu starten (Test)"}
              </Button>
            </form>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Kein Match aktiv.</p>
      )}

      {/* Two-step flow: prepare → start.
          Prepare button shows when no match is active (or current one is done).
          Start button shows when the current match is in `preparing`. */}
      {(!match || match.status === "done") && (
        <form action={prepareAction}>
          <Button type="submit" disabled={preparePending}>
            {preparePending ? "Wird vorbereitet…" : "Match vorbereiten"}
          </Button>
        </form>
      )}
      {match && match.status === "preparing" && (
        <form action={startAction}>
          <Button type="submit" disabled={startPending}>
            {startPending ? "Wird gestartet…" : "Match starten"}
          </Button>
        </form>
      )}
    </div>
  );
}

function PlayerCell({ name, prompt }: { name: string; prompt: string }) {
  return (
    <div className="bg-muted/40 space-y-1 rounded-md p-2">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground line-clamp-3 text-xs italic">
        {prompt ? `"${prompt}"` : "(noch nichts geschrieben)"}
      </p>
    </div>
  );
}

function CountdownLine({ endTime }: { endTime: string | null }) {
  const [remaining, setRemaining] = useState<number>(() => calcRemaining(endTime));
  useEffect(() => {
    setRemaining(calcRemaining(endTime));
    const i = setInterval(() => setRemaining(calcRemaining(endTime)), 250);
    return () => clearInterval(i);
  }, [endTime]);

  return (
    <p className="text-sm">
      Verbleibend:{" "}
      <span className="font-mono font-semibold">{remaining.toFixed(1)}s</span>
    </p>
  );
}

function calcRemaining(endTime: string | null): number {
  if (!endTime) return 0;
  const end = new Date(endTime).getTime();
  const now = Date.now();
  return Math.max(0, (end - now) / 1000);
}
