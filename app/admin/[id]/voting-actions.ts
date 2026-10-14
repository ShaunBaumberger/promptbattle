"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getNextSlot } from "@/lib/bracket";
import type { PlayerCount, Round } from "@/lib/types/database";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { notOwnerMessage, ownsMatch, ownsTournament } from "@/lib/supabase/ownership";

export type VotingActionState = { error?: string; ok?: boolean };

/**
 * Admin-driven signal for the FINAL-round video playback. Writes
 * `tournaments.current_video_playing` so the stage knows which video
 * to autoplay fullscreen. Pass `slot=null` (or call `clearVideoPlayingAction`)
 * to return the stage to the reveal layout.
 */
export async function playVideoAction(
  tournamentId: string,
  slot: "A" | "B",
): Promise<{ ok: boolean; error?: string }> {
  if (!(await ownsTournament(tournamentId))) return { ok: false, error: await notOwnerMessage() };
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ current_video_playing: slot })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

export async function clearVideoPlayingAction(
  tournamentId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await ownsTournament(tournamentId))) return { ok: false, error: await notOwnerMessage() };
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ current_video_playing: null })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/** Open the voting phase. Allowed only from `reveal`. */
export async function startVotingAction(
  matchId: string,
  _prev: VotingActionState,
  _formData: FormData,
): Promise<VotingActionState> {
  if (!(await ownsMatch(matchId))) return { error: await notOwnerMessage() };
  const supabase = createServiceRoleClient();
  const { dict } = await getServerDictionary();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: dict.admin.err.matchNotFound };
  if (match.status !== "reveal") {
    return { error: dict.admin.err.votingAfterReveal };
  }

  const { error } = await supabase
    .from("matches")
    .update({ status: "voting" })
    .eq("id", matchId)
    .eq("status", "reveal");

  if (error) {
    return { error: interpolate(dict.admin.err.votingStartFailed, { msg: error.message }) };
  }

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
  if (!(await ownsMatch(matchId))) return { error: await notOwnerMessage() };
  const supabase = createServiceRoleClient();
  const { dict } = await getServerDictionary();

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, status, player_a_id, player_b_id, tournament_id, round, bracket_position",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: dict.admin.err.matchNotFound };
  if (match.status !== "voting") return { error: dict.admin.err.votingNotActive };
  if (!match.player_a_id || !match.player_b_id) {
    return { error: dict.admin.err.playersMissing };
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
      error: votesA === 0 ? dict.admin.err.noVotesTie : dict.admin.err.tie,
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

  if (matchErr) {
    return { error: interpolate(dict.admin.err.winnerSaveFailed, { msg: matchErr.message }) };
  }

  // Bracket advance / tournament finish.
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("player_count, is_test_mode")
    .eq("id", match.tournament_id)
    .maybeSingle();
  if (!tournament) return { error: dict.admin.err.tournamentNotFound };

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
      return {
        error: interpolate(dict.admin.err.bracketAdvanceFailed, { msg: advanceErr.message }),
      };
    }
  } else if (!tournament.is_test_mode) {
    // Final match of a real tournament: mark tournament finished.
    // Test mode skips this so the admin can replay the same match.
    const { error: tErr } = await supabase
      .from("tournaments")
      .update({ status: "finished" })
      .eq("id", match.tournament_id);
    if (tErr) {
      return {
        error: interpolate(dict.admin.err.tournamentFinishFailed, { msg: tErr.message }),
      };
    }
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
  const { dict } = await getServerDictionary();
  if (choice !== "A" && choice !== "B") {
    return { ok: false, error: dict.admin.err.invalidChoice };
  }

  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, player_a_id, player_b_id, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { ok: false, error: dict.admin.err.matchNotFound };
  if (match.status !== "voting") return { ok: false, error: dict.admin.err.votingNotActive };
  if (
    participantId === match.player_a_id ||
    participantId === match.player_b_id
  ) {
    return { ok: false, error: dict.admin.err.playersCantVote };
  }

  const { data: participant } = await supabase
    .from("participants")
    .select("id, tournament_id")
    .eq("id", participantId)
    .maybeSingle();

  if (!participant || participant.tournament_id !== match.tournament_id) {
    return { ok: false, error: dict.admin.err.notParticipant };
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
