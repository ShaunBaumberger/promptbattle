"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getNextSlot } from "@/lib/bracket";
import type { PlayerCount, Round } from "@/lib/types/database";

export type VotingActionState = { error?: string; ok?: boolean };

/** Open the voting phase. Allowed only from `reveal`. */
export async function startVotingAction(
  matchId: string,
  _prev: VotingActionState,
  _formData: FormData,
): Promise<VotingActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Match nicht gefunden." };
  if (match.status !== "reveal") {
    return { error: "Voting kann nur nach dem Reveal gestartet werden." };
  }

  const { error } = await supabase
    .from("matches")
    .update({ status: "voting" })
    .eq("id", matchId)
    .eq("status", "reveal");

  if (error) return { error: `Voting konnte nicht gestartet werden: ${error.message}` };

  revalidatePath(`/admin/${match.tournament_id}`);
  return { ok: true };
}

/**
 * Close voting, tally votes, set winner from the majority, save final counts,
 * advance bracket. Refuses on a tie — admin must resolve via setMatchWinner.
 */
export async function endVotingAction(
  matchId: string,
  _prev: VotingActionState,
  _formData: FormData,
): Promise<VotingActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, status, player_a_id, player_b_id, tournament_id, round, bracket_position",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Match nicht gefunden." };
  if (match.status !== "voting") return { error: "Voting ist nicht aktiv." };
  if (!match.player_a_id || !match.player_b_id) {
    return { error: "Spieler fehlen für dieses Match." };
  }

  const { data: votes } = await supabase
    .from("votes")
    .select("choice")
    .eq("match_id", matchId);

  let votesA = 0;
  let votesB = 0;
  for (const v of votes ?? []) {
    if (v.choice === "A") votesA++;
    else if (v.choice === "B") votesB++;
  }

  if (votesA === votesB) {
    // Tie: persist counts but don't auto-pick. Admin uses Sieger wählen.
    await supabase
      .from("matches")
      .update({ votes_a: votesA, votes_b: votesB })
      .eq("id", matchId);
    revalidatePath(`/admin/${match.tournament_id}`);
    return {
      error:
        votesA === 0
          ? "Keine Stimmen — bitte Sieger manuell wählen."
          : "Unentschieden — bitte Sieger manuell wählen.",
    };
  }

  const winnerId = votesA > votesB ? match.player_a_id : match.player_b_id;

  const { error: matchErr } = await supabase
    .from("matches")
    .update({
      status: "done",
      winner_id: winnerId,
      votes_a: votesA,
      votes_b: votesB,
    })
    .eq("id", matchId);

  if (matchErr) return { error: `Sieger konnte nicht gespeichert werden: ${matchErr.message}` };

  // Bracket advance / tournament finish.
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("player_count, is_test_mode")
    .eq("id", match.tournament_id)
    .maybeSingle();
  if (!tournament) return { error: "Turnier nicht gefunden." };

  const playerCount = tournament.player_count as PlayerCount;
  const next = getNextSlot(match.round as Round, match.bracket_position, playerCount);

  if (next) {
    const slotColumn = next.slot === "A" ? "player_a_id" : "player_b_id";
    const { error: advanceErr } = await supabase
      .from("matches")
      .update({ [slotColumn]: winnerId })
      .eq("tournament_id", match.tournament_id)
      .eq("round", next.round)
      .eq("bracket_position", next.position);
    if (advanceErr) {
      return { error: `Bracket-Vorschub fehlgeschlagen: ${advanceErr.message}` };
    }
  } else if (!tournament.is_test_mode) {
    // Final match of a real tournament: mark tournament finished.
    // Test mode skips this so the admin can replay the same match.
    const { error: tErr } = await supabase
      .from("tournaments")
      .update({ status: "finished" })
      .eq("id", match.tournament_id);
    if (tErr) return { error: `Turnier-Abschluss fehlgeschlagen: ${tErr.message}` };
  }

  revalidatePath(`/admin/${match.tournament_id}`);
  return { ok: true };
}

/** Read the current vote count for the admin's live counter. Returns total only. */
export async function getVoteCountAction(matchId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);
  return count ?? 0;
}

/**
 * Player-side: cast (or change) a vote for the given match. Validates that:
 *   - the match is currently in `voting`
 *   - the voter belongs to the same tournament
 *   - the voter is NOT one of the two competing players
 *
 * Idempotent on (match_id, voter_participant_id) so re-clicking changes the
 * vote until voting closes.
 */
export async function castVoteAction(
  matchId: string,
  participantId: string,
  choice: "A" | "B",
): Promise<{ ok: boolean; error?: string }> {
  if (choice !== "A" && choice !== "B") {
    return { ok: false, error: "Ungültige Auswahl." };
  }

  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, player_a_id, player_b_id, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { ok: false, error: "Match nicht gefunden." };
  if (match.status !== "voting") return { ok: false, error: "Voting ist nicht aktiv." };
  if (
    participantId === match.player_a_id ||
    participantId === match.player_b_id
  ) {
    return { ok: false, error: "Spieler dieses Matches dürfen nicht abstimmen." };
  }

  const { data: participant } = await supabase
    .from("participants")
    .select("id, tournament_id")
    .eq("id", participantId)
    .maybeSingle();

  if (!participant || participant.tournament_id !== match.tournament_id) {
    return { ok: false, error: "Du bist kein:e Teilnehmer:in dieses Turniers." };
  }

  const { error } = await supabase
    .from("votes")
    .upsert(
      {
        match_id: matchId,
        voter_participant_id: participantId,
        choice,
      },
      { onConflict: "match_id,voter_participant_id" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
