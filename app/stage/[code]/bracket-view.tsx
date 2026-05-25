"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaleStateGuard } from "@/lib/use-stale-state-guard";
import { getRoundsForPlayerCount, type RoundSpec } from "@/lib/rounds";
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

  // Safety net: refetch matches + player names on tab focus and every 10s
  // in case a realtime push was missed.
  useStaleStateGuard(async () => {
    const supabase = createClient();
    const [mRes, pRes] = await Promise.all([
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
    if (mRes.data) setMatches(mRes.data as Match[]);
    if (pRes.data) setParticipants(pRes.data as Participant[]);
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.name);
    return m;
  }, [participants]);

  const rounds = useMemo(
    () => getRoundsForPlayerCount(playerCount),
    [playerCount],
  );
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
        <p className="text-white/40 text-2xl">Bracket wird geladen…</p>
      </div>
    );
  }

  // 2-Player Sonderfall: nur das Finale, keine Halves nötig.
  if (rounds.length === 1) {
    const finalSpec = rounds[0];
    const finalMatch = matchesByRound.get(finalSpec.round)?.[0];
    return (
      <div className="flex flex-1 items-center justify-center duration-500 animate-in fade-in">
        <CenterColumn match={finalMatch} label={finalSpec.label} nameById={nameById} />
      </div>
    );
  }

  const earlierRounds = rounds.slice(0, -1);
  const finalSpec = rounds[rounds.length - 1];
  const finalMatch = matchesByRound.get(finalSpec.round)?.[0];

  return (
    <div className="flex flex-1 items-stretch justify-center gap-0 px-3 duration-500 animate-in fade-in">
      <HalfBracket
        rounds={earlierRounds}
        matchesByRound={matchesByRound}
        nameById={nameById}
        side="left"
      />
      <CenterColumn match={finalMatch} label={finalSpec.label} nameById={nameById} />
      <HalfBracket
        rounds={earlierRounds}
        matchesByRound={matchesByRound}
        nameById={nameById}
        side="right"
      />
    </div>
  );
}

/**
 * Renders one side of the bracket — outermost round is on the outside, the
 * round closest to the final is right next to the center. Connectors flow
 * inward toward the center.
 */
function HalfBracket({
  rounds,
  matchesByRound,
  nameById,
  side,
}: {
  rounds: RoundSpec[];
  matchesByRound: Map<Round, Match[]>;
  nameById: Map<string, string>;
  side: "left" | "right";
}) {
  // Left side: outermost first (leftmost), innermost last (rightmost, near center).
  // Right side: innermost first (leftmost, near center), outermost last (rightmost).
  const ordered = side === "left" ? rounds : [...rounds].reverse();

  return (
    <>
      {ordered.map((spec, idx) => {
        const allMatches = matchesByRound.get(spec.round) ?? [];
        const halfMatches = sliceForSide(allMatches, spec.matches, side);
        const halfCount = spec.matches / 2;

        // For the last round entry on either side (innermost, closest to
        // center), the connector runs from this round into the FINAL match.
        const isInnermost = idx === ordered.length - 1;
        const connectorFromCount = isInnermost ? halfCount : halfCount;

        const column = (
          <div key={`col-${spec.round}`} className="flex min-w-[140px] flex-1 flex-col">
            {/* Invisible spacer mirrors the visible FINALE label height
                in CenterColumn so match cards across all half-bracket
                columns line up vertically with the FINAL card. Round
                labels themselves are intentionally hidden — the bracket
                topology is self-explanatory and labels overlap badly on
                larger brackets (R16+). */}
            <div className="invisible py-5 text-3xl">.</div>
            <div className="flex flex-1 flex-col justify-around gap-3 py-2">
              {Array.from({ length: halfCount }).map((_, i) => (
                <MatchCard key={i} match={halfMatches[i]} nameById={nameById} />
              ))}
            </div>
          </div>
        );
        const connector = (
          <div key={`conn-${spec.round}-${side}`} className="flex flex-col">
            {/* Spacer mirrors the round column's header so connectors align with match area */}
            <div className="invisible py-5 text-3xl">.</div>
            <div className="flex-1 py-2">
              <ConnectorSVG fromCount={connectorFromCount} side={side} />
            </div>
          </div>
        );

        // LEFT: column → connector. RIGHT: connector → column (mirrored).
        return (
          <Fragment key={spec.round}>
            {side === "left" ? (
              <>
                {column}
                {connector}
              </>
            ) : (
              <>
                {connector}
                {column}
              </>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Take the half of matches that belong to this side of the bracket. */
function sliceForSide(matches: Match[], total: number, side: "left" | "right"): Match[] {
  const half = total / 2;
  if (side === "left") return matches.slice(0, half);
  return matches.slice(half);
}

/**
 * Center column with the trophy and the FINAL match card.
 * Vertically centered so connectors meeting at y=50% land on the card.
 */
function CenterColumn({
  match,
  label,
  nameById,
}: {
  match: Match | undefined;
  label: string;
  nameById: Map<string, string>;
}) {
  // FINALE is the only visible round label — the half-bracket columns
  // use invisible spacers of identical height so the FINAL card aligns
  // with the centre line where the SF connectors meet (y=50% of the
  // match area).
  return (
    <div className="flex min-w-[220px] flex-1 flex-col">
      <h3 className="text-amber-300 py-5 text-center text-3xl font-semibold uppercase tracking-[0.25em]">
        {label}
      </h3>
      <div className="flex flex-1 flex-col items-center px-2 py-2">
        <div className="flex flex-1 items-end pb-6">
          <span className="text-8xl drop-shadow-[0_0_30px_rgba(251,191,36,0.4)]">
            🏆
          </span>
        </div>
        <MatchCard match={match} nameById={nameById} highlight />
        <div className="flex-1" />
      </div>
    </div>
  );
}

function ConnectorSVG({
  fromCount,
  side,
}: {
  fromCount: number;
  side: "left" | "right";
}) {
  if (fromCount < 1) return null;
  const segments: string[] = [];

  // Source matches sit on the OUTSIDE of this side of the bracket; the
  // destination round sits on the INSIDE (toward center).
  //   left side : source = x=0, destination = x=100
  //   right side: source = x=100, destination = x=0
  const srcX = side === "left" ? 0 : 100;
  const dstX = side === "left" ? 100 : 0;

  if (fromCount === 1) {
    // 1 source → 1 destination: straight horizontal line at vertical midpoint.
    segments.push(`M ${srcX} 50 H ${dstX}`);
  } else {
    const pairs = fromCount / 2;
    for (let p = 0; p < pairs; p++) {
      const a = 2 * p;
      const b = 2 * p + 1;
      const yA = ((a + 0.5) / fromCount) * 100;
      const yB = ((b + 0.5) / fromCount) * 100;
      const yMid = (yA + yB) / 2;
      // Top source: out, in to mid X, down/up to mid Y, then on to destination.
      segments.push(`M ${srcX} ${yA} H 50 V ${yMid} H ${dstX}`);
      // Bottom source: out, in to mid X, then up/down to meet the vertical at yMid.
      segments.push(`M ${srcX} ${yB} H 50 V ${yMid}`);
    }
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-full w-8"
      fill="none"
    >
      <path
        d={segments.join(" ")}
        className="stroke-white/20"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MatchCard({
  match,
  nameById,
  highlight = false,
}: {
  match: Match | undefined;
  nameById: Map<string, string>;
  highlight?: boolean;
}) {
  if (!match) {
    return (
      <div
        className={`flex w-full flex-col gap-1.5 rounded-xl border border-dashed p-2.5 ${
          highlight
            ? "border-amber-400/30 bg-amber-400/5"
            : "border-white/10 bg-white/[0.02]"
        }`}
      >
        <Slot label="—" state="empty" highlight={highlight} />
        <Slot label="—" state="empty" highlight={highlight} />
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
      className={`flex w-full flex-col gap-1.5 rounded-xl border p-2.5 backdrop-blur transition-all ${
        isLive
          ? "border-sky-400/60 bg-sky-400/10 shadow-[0_0_30px_rgba(56,189,248,0.3)] ring-2 ring-sky-400/40"
          : highlight
            ? "border-amber-400/40 bg-amber-400/[0.06] shadow-[0_0_25px_rgba(251,191,36,0.2)]"
            : "border-white/10 bg-white/5"
      }`}
    >
      <Slot
        label={aName}
        state={aWins ? "winner" : decided ? "loser" : match.player_a_id ? "set" : "empty"}
        highlight={highlight}
      />
      <Slot
        label={bName}
        state={bWins ? "winner" : decided ? "loser" : match.player_b_id ? "set" : "empty"}
        highlight={highlight}
      />
    </div>
  );
}

/**
 * Slot text scales with whether this is the FINAL card (highlighted) or a
 * regular half-bracket card. FINAL cards have generous space so we
 * dial the text up; regular cards live in narrow columns and need to
 * fit two long German names on one line per slot.
 */
function Slot({
  label,
  state,
  highlight = false,
}: {
  label: string;
  state: "set" | "winner" | "loser" | "empty";
  highlight?: boolean;
}) {
  const cls =
    state === "winner"
      ? "text-white font-semibold"
      : state === "loser"
        ? "text-white/30 line-through"
        : state === "empty"
          ? "text-white/30"
          : "text-white/85";
  const sizeCls = highlight ? "text-2xl" : "text-base";
  return (
    <div className={`flex items-center gap-1.5 truncate ${sizeCls} ${cls}`}>
      {state === "winner" && <span>🏆</span>}
      <span className="truncate">{label}</span>
    </div>
  );
}
