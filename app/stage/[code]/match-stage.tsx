"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROUND_LABELS } from "@/lib/rounds";
import type { Match, MatchStatus, Participant } from "@/lib/types/database";

import type { Cue } from "@/lib/stage-audio";

interface Props {
  matchId: string;
  tournamentId: string;
  play?: (cue: Cue) => void;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: "Bereit",
  live: "Battle läuft",
  locked: "Zeit abgelaufen",
  generating: "Bilder werden generiert…",
  reveal: "Reveal",
  voting: "Voting",
  done: "Abgeschlossen",
};

export function MatchStage({ matchId, tournamentId, play }: Props) {
  const [match, setMatch] = useState<Match | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [m, p] = await Promise.all([
        supabase.from("matches").select("*").eq("id", matchId).maybeSingle(),
        supabase
          .from("participants")
          .select("*")
          .eq("tournament_id", tournamentId)
          .eq("is_player", true),
      ]);
      if (cancelled) return;
      setMatch((m.data ?? null) as Match | null);
      setParticipants((p.data ?? []) as Participant[]);
    })();

    const channel = supabase
      .channel(`stage-match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => setMatch(payload.new as Match),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [matchId, tournamentId]);

  useEffect(() => {
    const tick = () => setRemaining(calcRemaining(match?.end_time ?? null));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [match?.end_time]);

  // ---- Audio cues -----------------------------------------------------
  // Fire each cue at most once per logical event. Status-based cues are
  // keyed by start_time so a kill-switch / replay re-fires them. The 10s
  // tick keys on start_time too.
  const firedCuesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!play || !match) return;
    const fireOnce = (key: string, cue: Cue) => {
      if (firedCuesRef.current.has(key)) return;
      firedCuesRef.current.add(key);
      play(cue);
    };
    const startKey = match.start_time ?? match.id;
    if (match.status === "live") {
      fireOnce(`start:${startKey}`, "matchStart");
    }
    if (match.status === "locked") {
      fireOnce(`lock:${startKey}`, "lockTimeUp");
    }
    if (match.status === "voting") {
      fireOnce(`voting:${match.id}`, "votingStart");
    }
  }, [match, play]);

  // 10-second warning beep — single pop right when the timer crosses 10.
  useEffect(() => {
    if (!play || !match || match.status !== "live") return;
    if (remaining > 10 || remaining <= 0) return;
    const key = `tick10:${match.start_time ?? match.id}`;
    if (firedCuesRef.current.has(key)) return;
    firedCuesRef.current.add(key);
    play("tenSecondTick");
  }, [match, remaining, play]);

  if (!match) {
    return (
      <main className="bg-background flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-2xl">Lade Match…</p>
      </main>
    );
  }

  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const aName = nameById.get(match.player_a_id ?? "") ?? "?";
  const bName = nameById.get(match.player_b_id ?? "") ?? "?";

  const showSeconds = Math.max(0, Math.ceil(remaining));
  const live = match.status === "live";
  const reveal =
    match.status === "reveal" ||
    match.status === "voting" ||
    match.status === "done";
  const winnerName =
    match.status === "done" && match.winner_id
      ? nameById.get(match.winner_id) ?? null
      : null;

  // Reveal animation phases (vote bars + winner crown):
  //   0 = bars at 0, no winner styling
  //   1 = both bars rise to min(votes_a, votes_b) — equal tension, no winner yet
  //   2 = the winner's bar continues past min toward its full count
  //   3 = winner is officially revealed (Champion banner + gold frame + dim loser)
  const showBars =
    match.status === "done" && match.votes_a != null && match.votes_b != null;
  const [revealPhase, setRevealPhase] = useState(0);
  useEffect(() => {
    if (match.status !== "done" || match.winner_id == null) {
      setRevealPhase(0);
      return;
    }
    if (!showBars) {
      // No vote data → reveal immediately so legacy / no-vote matches still
      // show the winner.
      setRevealPhase(3);
      return;
    }
    setRevealPhase(0);
    const t1 = window.setTimeout(() => setRevealPhase(1), 100);
    const t2 = window.setTimeout(() => setRevealPhase(2), 1700);
    const t3 = window.setTimeout(() => setRevealPhase(3), 3300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [match.id, match.status, match.winner_id, showBars]);
  const winnerRevealed = revealPhase >= 3 && winnerName != null;

  // Triumph cue when the winner is officially revealed.
  useEffect(() => {
    if (!play || !winnerRevealed || !match) return;
    const key = `winner:${match.id}:${match.winner_id}`;
    if (firedCuesRef.current.has(key)) return;
    firedCuesRef.current.add(key);
    play("winnerReveal");
  }, [winnerRevealed, match, play]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <p className="text-white/50 text-2xl uppercase tracking-[0.3em]">
          {ROUND_LABELS[match.round]} – Match {match.bracket_position + 1}
        </p>
        {live ? (
          <p
            className={`tabular-nums text-7xl font-semibold tracking-tight transition-colors ${
              showSeconds <= 10 ? "text-rose-400" : "text-white"
            }`}
          >
            {showSeconds}s
          </p>
        ) : match.status === "voting" ? (
          <div className="flex items-center gap-3 rounded-full border border-sky-400/40 bg-sky-400/10 px-5 py-2 backdrop-blur">
            <span className="bg-sky-400 inline-block h-3 w-3 animate-pulse rounded-full" />
            <p className="text-sky-100 text-2xl font-semibold uppercase tracking-widest">
              Voting läuft
            </p>
          </div>
        ) : !winnerName && match.status !== "done" ? (
          <p className="text-white/70 text-2xl">{STATUS_LABEL[match.status]}</p>
        ) : null}
      </header>

      {winnerRevealed && (
        <div className="flex flex-col items-center gap-2 pb-2 text-center duration-700 animate-in fade-in slide-in-from-bottom-2">
          <span className="text-amber-400/80 text-base uppercase tracking-[0.4em]">
            {match.round === "FINAL" ? "Champion" : "Gewinner:in"}
          </span>
          <p className="text-white flex items-center justify-center gap-4 text-6xl font-semibold tracking-tight drop-shadow-[0_0_30px_rgba(251,191,36,0.4)]">
            <span className="text-6xl">🏆</span>
            {winnerName}
          </p>
        </div>
      )}

      {reveal ? (
        <RevealView
          match={match}
          aName={aName}
          bName={bName}
          revealPhase={revealPhase}
          winnerRevealed={winnerRevealed}
        />
      ) : (
        <LiveView match={match} aName={aName} bName={bName} />
      )}
    </main>
  );
}

function LiveView({
  match,
  aName,
  bName,
}: {
  match: Match;
  aName: string;
  bName: string;
}) {
  const generating = match.status === "generating" || match.status === "locked";
  return (
    <div className="grid flex-1 grid-cols-[1fr_auto_1fr] gap-6">
      <PlayerColumn name={aName} prompt={match.prompt_a} side="left" />

      <div className="flex w-[28vw] flex-col items-center justify-start gap-4">
        <TaskDisplay match={match} variant="live" />
        {generating && (
          <p className="text-foreground animate-pulse text-2xl">
            Bilder werden generiert…
          </p>
        )}
      </div>

      <PlayerColumn name={bName} prompt={match.prompt_b} side="right" />
    </div>
  );
}

function TaskDisplay({
  match,
  variant,
}: {
  match: Match;
  variant: "live" | "reveal";
}) {
  const maxH = variant === "live" ? "max-h-[60vh]" : "max-h-[55vh]";
  if (match.task_text) {
    return (
      <>
        <p className="text-white/50 text-base uppercase tracking-[0.3em]">
          Generiere ein Bild von …
        </p>
        <div className="bg-white/5 flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 p-7 backdrop-blur">
          <p className="text-white w-full text-center text-3xl font-semibold leading-snug break-words [overflow-wrap:anywhere]">
            {match.task_text}
          </p>
        </div>
      </>
    );
  }
  if (match.task_reference_url) {
    return (
      <>
        <p className="text-white/50 text-base uppercase tracking-[0.3em]">
          {variant === "live" ? "Referenzbild" : "Referenz"}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={match.task_reference_url}
          alt="Referenzbild"
          className={`bg-white/5 ${maxH} w-auto rounded-2xl border border-white/10 object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]`}
        />
      </>
    );
  }
  return (
    <div
      className={`bg-white/5 ${maxH === "max-h-[60vh]" ? "h-[60vh]" : "h-[55vh]"} w-full animate-pulse rounded-2xl border border-white/10`}
    />
  );
}

function RevealView({
  match,
  aName,
  bName,
  revealPhase,
  winnerRevealed,
}: {
  match: Match;
  aName: string;
  bName: string;
  revealPhase: number;
  winnerRevealed: boolean;
}) {
  const decided = match.status === "done" && match.winner_id != null;
  const aIsWinner = decided && match.winner_id === match.player_a_id;
  const bIsWinner = decided && match.winner_id === match.player_b_id;

  const showBars =
    match.status === "done" && match.votes_a != null && match.votes_b != null;

  const a = match.votes_a ?? 0;
  const b = match.votes_b ?? 0;
  const min = Math.min(a, b);
  const max = Math.max(a, b, 1); // avoid div-by-zero
  // Phase 0: bars at 0
  // Phase 1: both rise to min (equal pace)
  // Phase 2+: only the winner's bar continues to its full count
  const aShown =
    revealPhase === 0 ? 0 : revealPhase >= 2 && a >= b ? a : Math.min(a, min);
  const bShown =
    revealPhase === 0 ? 0 : revealPhase >= 2 && b >= a ? b : Math.min(b, min);

  return (
    <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-stretch gap-6">
      <RevealColumn
        name={aName}
        resultUrl={match.result_a_url}
        side="left"
        isWinner={aIsWinner}
        isLoser={decided && !aIsWinner}
        winnerRevealed={winnerRevealed}
        showBar={showBars}
        votes={a}
        shownVotes={aShown}
        max={max}
      />

      <div className="flex w-[28vw] flex-col items-center justify-start gap-3">
        <TaskDisplay match={match} variant="reveal" />
      </div>

      <RevealColumn
        name={bName}
        resultUrl={match.result_b_url}
        side="right"
        isWinner={bIsWinner}
        isLoser={decided && !bIsWinner}
        winnerRevealed={winnerRevealed}
        showBar={showBars}
        votes={b}
        shownVotes={bShown}
        max={max}
      />
    </div>
  );
}

function RevealColumn({
  name,
  resultUrl,
  side,
  isWinner,
  isLoser,
  winnerRevealed,
  showBar,
  shownVotes,
  max,
}: {
  name: string;
  resultUrl: string | null;
  side: "left" | "right";
  /** This player won the match (decided server-side). */
  isWinner: boolean;
  /** This player lost the match. */
  isLoser: boolean;
  /** True only after the bar animation completes — gates the gold/dim styling. */
  winnerRevealed: boolean;
  showBar: boolean;
  votes: number;
  shownVotes: number;
  max: number;
}) {
  const heightPct = max > 0 ? (shownVotes / max) * 100 : 0;
  // Visual winner/loser styling waits for `winnerRevealed`. During phases
  // 0–2 both columns look neutral so the audience focuses on the bars.
  const showWinnerStyle = isWinner && winnerRevealed;
  const showLoserStyle = isLoser && winnerRevealed;
  return (
    <div
      className={`flex flex-col gap-3 transition-all duration-500 ${
        side === "left" ? "items-start text-left" : "items-end text-right"
      } ${showLoserStyle ? "opacity-40 grayscale-[40%]" : ""}`}
    >
      <div className="flex items-center gap-3">
        {showWinnerStyle && <span className="text-5xl">🏆</span>}
        <h2
          className={`text-4xl font-semibold tracking-tight ${
            showWinnerStyle ? "text-white" : "text-white/80"
          }`}
        >
          {name}
        </h2>
      </div>
      {resultUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resultUrl}
          alt={`Ergebnis von ${name}`}
          className={`bg-white/5 w-auto rounded-2xl object-contain transition-all duration-700 animate-in fade-in zoom-in-95 fill-mode-both ${
            showWinnerStyle
              ? "max-h-[55vh] border-2 border-amber-400 shadow-[0_0_80px_rgba(251,191,36,0.5)] ring-4 ring-amber-400"
              : "max-h-[45vh] border border-white/10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
          }`}
        />
      ) : (
        <div
          className={`bg-white/5 text-white/40 flex w-full items-center justify-center rounded-2xl border border-white/10 text-base italic backdrop-blur transition-all duration-500 ${
            showWinnerStyle ? "h-[45vh]" : "h-[35vh]"
          }`}
        >
          Keine Bildgenerierung
        </div>
      )}
      {showBar && (
        <div
          className={`flex w-full items-end gap-4 ${
            side === "left" ? "justify-start" : "justify-end"
          }`}
        >
          <div className="bg-white/10 relative h-24 w-16 overflow-hidden rounded-xl border border-white/10 backdrop-blur">
            <div
              className={`absolute right-0 bottom-0 left-0 transition-[height,background-color] duration-[1500ms] ease-out ${
                showWinnerStyle ? "bg-amber-400" : "bg-white/40"
              }`}
              style={{ height: `${heightPct}%` }}
            />
          </div>
          <p
            className={`tabular-nums text-4xl font-semibold transition-colors duration-500 ${
              showWinnerStyle ? "text-white" : "text-white/50"
            }`}
          >
            <AnimatedNumber value={shownVotes} duration={1500} />
          </p>
        </div>
      )}
    </div>
  );
}

function PlayerColumn({
  name,
  prompt,
  side,
}: {
  name: string;
  prompt: string;
  side: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-col gap-4 ${
        side === "left" ? "items-start text-left" : "items-end text-right"
      }`}
    >
      <h2 className="text-white text-5xl font-semibold tracking-tight">{name}</h2>
      <div className="bg-white/5 min-h-[20vh] w-full rounded-2xl border border-white/10 p-5 backdrop-blur">
        <p className="text-white whitespace-pre-wrap break-words text-2xl leading-snug">
          {prompt || <span className="text-white/30 italic">…</span>}
        </p>
      </div>
    </div>
  );
}

function calcRemaining(endTime: string | null): number {
  if (!endTime) return 0;
  const end = new Date(endTime).getTime();
  const now = Date.now();
  return Math.max(0, (end - now) / 1000);
}

/** Smoothly tweens a displayed integer toward `value` over `duration` ms. */
function AnimatedNumber({
  value,
  duration = 1500,
}: {
  value: number;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const target = value;
    if (start === target) {
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic, matches CSS bar
      setShown(start + (target - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{Math.round(shown)}</>;
}
