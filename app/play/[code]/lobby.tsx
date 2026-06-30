"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { participantStorageKey } from "@/lib/participant-storage";
import { useStaleStateGuard } from "@/lib/use-stale-state-guard";
import { Badge } from "@/components/ui/badge";
import type {
  Match,
  Participant,
  TournamentStatus,
} from "@/lib/types/database";
import { MatchPlay } from "./match-play";
import { VotingView } from "./voting-view";
import { useI18n, interpolate } from "@/lib/i18n/context";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface Props {
  tournamentId: string;
  tournamentCode: string;
  tournamentName: string;
  initialStatus: TournamentStatus;
  initialCurrentMatchId: string | null;
}

export function Lobby({
  tournamentId,
  tournamentCode,
  tournamentName,
  initialStatus,
  initialCurrentMatchId,
}: Props) {
  const { dict } = useI18n();
  const router = useRouter();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [status, setStatus] = useState<TournamentStatus>(initialStatus);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(
    initialCurrentMatchId,
  );
  const [match, setMatch] = useState<Match | null>(null);
  const [opponentName, setOpponentName] = useState<string>("?");
  const [aName, setAName] = useState<string>("?");
  const [bName, setBName] = useState<string>("?");
  const [myActiveMatchCount, setMyActiveMatchCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(participantStorageKey(tournamentCode));
    if (!stored) {
      router.replace(`/?code=${tournamentCode}`);
      return;
    }
    setParticipantId(stored);
  }, [tournamentCode, router]);

  // Initial fetch for participant + subscriptions for participant + tournament.
  useEffect(() => {
    if (!participantId) return;
    const supabase = createClient();

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .eq("id", participantId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        window.localStorage.removeItem(participantStorageKey(tournamentCode));
        router.replace(`/?code=${tournamentCode}`);
        setLoadError(dict.lobby.sessionExpired);
        return;
      }
      setParticipant(data as Participant);
    })();

    const channel = supabase
      .channel(`lobby:${participantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `id=eq.${participantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            window.localStorage.removeItem(participantStorageKey(tournamentCode));
            router.replace(`/?code=${tournamentCode}`);
            return;
          }
          setParticipant(payload.new as Participant);
        },
      )
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
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [participantId, tournamentCode, tournamentId, router]);

  // Match fetch + subscription whenever current_match_id changes.
  useEffect(() => {
    if (!currentMatchId) {
      setMatch(null);
      setOpponentName("?");
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

    const channel = supabase
      .channel(`lobby-match:${currentMatchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${currentMatchId}`,
        },
        (payload) => setMatch(payload.new as Match),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentMatchId]);

  // Track how many non-done matches still feature this participant. Zero
  // means they've been eliminated (all their matches are done and they didn't
  // get advanced into a future round).
  useEffect(() => {
    if (!participantId) return;
    const supabase = createClient();
    let cancelled = false;
    const refresh = async () => {
      const { count } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId)
        .or(`player_a_id.eq.${participantId},player_b_id.eq.${participantId}`)
        .neq("status", "done");
      if (!cancelled) setMyActiveMatchCount(count ?? 0);
    };
    refresh();
    const channel = supabase
      .channel(`my-matches:${participantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [participantId, tournamentId]);

  // Look up both player names when match changes.
  useEffect(() => {
    if (!match) {
      setAName("?");
      setBName("?");
      setOpponentName("?");
      return;
    }
    const ids = [match.player_a_id, match.player_b_id].filter(
      (x): x is string => !!x,
    );
    if (ids.length === 0) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("participants")
        .select("id, name")
        .in("id", ids);
      if (cancelled) return;
      const byId = new Map((data ?? []).map((p) => [p.id, p.name]));
      const aN = match.player_a_id ? byId.get(match.player_a_id) ?? "?" : "?";
      const bN = match.player_b_id ? byId.get(match.player_b_id) ?? "?" : "?";
      setAName(aN);
      setBName(bN);
      setOpponentName(
        match.player_a_id === participantId
          ? bN
          : match.player_b_id === participantId
            ? aN
            : "?",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [match, participantId]);

  // Safety net: realtime sometimes misses events (phone sleep, WS drop,
  // background tab). On visibility-change and every 10s, re-pull the
  // truth from the DB so the screen converges even if a push was lost.
  useStaleStateGuard(async () => {
    if (!participantId) return;
    const supabase = createClient();
    const [pRes, tRes, mRes] = await Promise.all([
      supabase
        .from("participants")
        .select("*")
        .eq("id", participantId)
        .maybeSingle(),
      supabase
        .from("tournaments")
        .select("status, current_match_id")
        .eq("id", tournamentId)
        .maybeSingle(),
      currentMatchId
        ? supabase.from("matches").select("*").eq("id", currentMatchId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (pRes.data) setParticipant(pRes.data as Participant);
    if (tRes.data) {
      setStatus(tRes.data.status as TournamentStatus);
      setCurrentMatchId(tRes.data.current_match_id);
    }
    if (mRes.data) setMatch(mRes.data as Match);
  });

  if (loadError) {
    return <Center>{loadError}</Center>;
  }
  if (!participantId || !participant) {
    return <Center>{dict.common.loading}</Center>;
  }

  const isOneOfTheTwoPlayers =
    !!match &&
    (match.player_a_id === participantId || match.player_b_id === participantId);

  // Player in this match → MatchPlay (handles live / locked / generating /
  // reveal / voting / done internally and shows their own result page).
  const inMatch =
    participant.is_player &&
    isOneOfTheTwoPlayers &&
    match &&
    match.status !== "pending";

  if (inMatch && match) {
    return (
      <MatchPlay
        match={match}
        participantId={participantId}
        opponentName={opponentName}
      />
    );
  }

  // Voter: anyone in the tournament who isn't currently competing.
  const canVote =
    match && match.status === "voting" && !isOneOfTheTwoPlayers;
  if (canVote && match) {
    return (
      <VotingView
        match={match}
        participantId={participantId}
        aName={aName}
        bName={bName}
      />
    );
  }

  const eliminated =
    status === "live" &&
    participant.is_player &&
    myActiveMatchCount === 0;
  const message = renderMessage(dict, status, participant, eliminated);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center duration-500 animate-in fade-in">
      <div className="space-y-2">
        <p className="text-white/40 text-xs uppercase tracking-[0.3em]">
          {tournamentName}
        </p>
        <h1 className="text-white text-3xl font-semibold tracking-tight">
          {interpolate(dict.lobby.greeting, { name: participant.name })}
        </h1>
      </div>

      <div className="space-y-3">
        <span className="text-6xl" role="img" aria-hidden>
          {message.icon}
        </span>
        <p className="text-white text-2xl font-semibold tracking-tight">
          {message.badge}
        </p>
      </div>

      <p className="text-white/60 max-w-sm text-base leading-relaxed">
        {message.text}
      </p>

      {message.pulse && (
        <div className="flex items-center gap-2">
          <span className="bg-sky-400 inline-block h-2 w-2 animate-pulse rounded-full" />
          <span className="text-white/50 text-xs uppercase tracking-widest">
            {dict.lobby.stayInApp}
          </span>
        </div>
      )}
    </main>
  );
}

function renderMessage(
  dict: Dictionary,
  status: TournamentStatus,
  participant: Participant,
  eliminated: boolean,
): { icon: string; badge: string; text: string; pulse: boolean } {
  if (status === "finished") {
    return {
      icon: "🏁",
      badge: dict.lobby.finishedBadge,
      text: dict.lobby.finishedText,
      pulse: false,
    };
  }
  if (status === "setup") {
    return {
      icon: "⏳",
      badge: dict.lobby.waitingBadge,
      text: dict.lobby.waitingText,
      pulse: true,
    };
  }
  if (eliminated) {
    return {
      icon: "🫡",
      badge: dict.lobby.eliminatedBadge,
      text: dict.lobby.eliminatedText,
      pulse: true,
    };
  }
  if (participant.is_player) {
    return {
      icon: "🎮",
      badge: dict.lobby.playerBadge,
      text: dict.lobby.playerText,
      pulse: true,
    };
  }
  return {
    icon: "👀",
    badge: dict.lobby.viewerBadge,
    text: dict.lobby.viewerText,
    pulse: true,
  };
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <p className="text-muted-foreground text-sm">{children}</p>
    </main>
  );
}
