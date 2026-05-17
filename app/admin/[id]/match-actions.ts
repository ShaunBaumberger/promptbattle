"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getNextSlot, shuffle } from "@/lib/bracket";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import type { PlayerCount, Round } from "@/lib/types/database";

export type MatchActionState = { error?: string; ok?: boolean };

const ROUND_PRIORITY: Round[] = ["R32", "R16", "QF", "SF", "FINAL"];

/**
 * Step 1 of the match flow: pick the next pending match (earliest round,
 * lowest bracket_position) where both players are assigned and move it to
 * `preparing`. Stage shows the players' positions (left/right) so they can
 * take their seats; task and timer are NOT revealed yet.
 *
 * Once positioned, the admin clicks "Match starten" (startCurrentMatchAction)
 * which reveals the task on /stage and on the players' phones simultaneously.
 */
export async function prepareNextMatchAction(
  tournamentId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, status, current_match_id, player_count")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (tournament.status !== "live") return { error: "Turnier läuft nicht." };

  // Block if another match is currently in flight (anything except done).
  if (tournament.current_match_id) {
    const { data: current } = await supabase
      .from("matches")
      .select("status")
      .eq("id", tournament.current_match_id)
      .maybeSingle();
    if (current && current.status !== "done") {
      return { error: "Aktuelles Match ist noch nicht abgeschlossen." };
    }
  }

  const playerCount = tournament.player_count as PlayerCount;
  const orderedRounds = getRoundsForPlayerCount(playerCount).map((r) => r.round);

  const { data: pending } = await supabase
    .from("matches")
    .select("id, round, bracket_position, player_a_id, player_b_id, task_id")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .not("player_a_id", "is", null)
    .not("player_b_id", "is", null)
    .order("bracket_position", { ascending: true });

  if (!pending || pending.length === 0) {
    return { error: "Kein startbares Match gefunden." };
  }

  const sorted = [...pending].sort((a, b) => {
    const ra = orderedRounds.indexOf(a.round as Round);
    const rb = orderedRounds.indexOf(b.round as Round);
    if (ra !== rb) return ra - rb;
    return a.bracket_position - b.bracket_position;
  });
  const next = sorted[0];
  if (!next.task_id) return { error: "Match hat keine Task zugewiesen." };

  // Atomic guard: only flip pending → preparing if it's still pending.
  const { error: matchErr, data: claimed } = await supabase
    .from("matches")
    .update({ status: "preparing" })
    .eq("id", next.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (matchErr) {
    return { error: `Match-Vorbereitung fehlgeschlagen: ${matchErr.message}` };
  }
  if (!claimed) return { error: "Match wurde bereits vorbereitet." };

  const { error: tErr } = await supabase
    .from("tournaments")
    .update({ current_match_id: next.id })
    .eq("id", tournamentId);
  if (tErr) return { error: `Turnier-Update fehlgeschlagen: ${tErr.message}` };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Step 2 of the match flow: reveal the task and start the timer. Requires
 * the match to be in `preparing` state (set by prepareNextMatchAction).
 * Players' phones flip from the "Mach dich bereit" view to the typing UI
 * the moment this lands.
 */
export async function startCurrentMatchAction(
  matchId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, task_id, tournament_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Match nicht gefunden." };
  if (match.status !== "preparing") {
    return { error: "Match wurde noch nicht vorbereitet." };
  }
  if (!match.task_id) return { error: "Match hat keine Task zugewiesen." };

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("round_time_seconds")
    .eq("id", match.tournament_id)
    .maybeSingle();
  if (!tournament) return { error: "Turnier nicht gefunden." };

  const { data: task } = await supabase
    .from("tasks")
    .select("reference_image_url, text_prompt")
    .eq("id", match.task_id)
    .maybeSingle();
  if (!task) return { error: "Task nicht gefunden." };

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + tournament.round_time_seconds * 1000);

  const { error } = await supabase
    .from("matches")
    .update({
      status: "live",
      task_reference_url: task.reference_image_url,
      task_text: task.text_prompt,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      prompt_a: "",
      prompt_b: "",
    })
    .eq("id", matchId)
    .eq("status", "preparing");
  if (error) return { error: `Match-Start fehlgeschlagen: ${error.message}` };

  revalidatePath(`/admin/${match.tournament_id}`);
  return { ok: true };
}

/**
 * Clear the tournament's `current_match_id` pointer so the stage falls back
 * to the bracket view between matches. Allowed only when the current match
 * is `done` — would be destructive mid-match.
 */
export async function clearCurrentMatchAction(
  tournamentId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, current_match_id")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (!tournament.current_match_id) return { ok: true };

  const { data: match } = await supabase
    .from("matches")
    .select("status")
    .eq("id", tournament.current_match_id)
    .maybeSingle();

  if (match && match.status !== "done") {
    return { error: "Aktuelles Match ist noch nicht abgeschlossen." };
  }

  const { error } = await supabase
    .from("tournaments")
    .update({ current_match_id: null })
    .eq("id", tournamentId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Test-mode toggle: skip Gemini image generation. Allowed only in dedicated
 * test-mode tournaments so a real event can't accidentally turn this on.
 */
export async function setSkipGenerationAction(
  tournamentId: string,
  skip: boolean,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("is_test_mode")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (!tournament.is_test_mode) {
    return { error: "Nur im Test-Modus verfügbar." };
  }
  const { error } = await supabase
    .from("tournaments")
    .update({ skip_image_generation: skip })
    .eq("id", tournamentId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Test-mode: reset a match to a fresh state and start it again. Wipes prompts,
 * results, winner, timestamps; picks a (possibly different) random task from
 * the same round; sets the timer; flips to `live`. Use this in 2-player mode
 * to rerun the FINAL match repeatedly without rebuilding the tournament.
 *
 * Refuses to run if the tournament is not 2-player to prevent accidentally
 * wiping a real match during a live event.
 */
export async function replayMatchAction(
  matchId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, tournament_id, round, player_a_id, player_b_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Match nicht gefunden." };

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, status, is_test_mode, round_time_seconds")
    .eq("id", match.tournament_id)
    .maybeSingle();

  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (!tournament.is_test_mode) {
    return { error: "Match-Wiederholung ist nur im Test-Modus erlaubt." };
  }
  if (tournament.status !== "live") {
    return { error: "Turnier läuft nicht." };
  }
  if (!match.player_a_id || !match.player_b_id) {
    return { error: "Spieler fehlen für dieses Match." };
  }

  // No-repeat rotation: pick from the least-used tasks in this round so a task
  // is only re-used after every other task in the round has been used at
  // least as often.
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, reference_image_url, text_prompt, use_count")
    .eq("tournament_id", tournament.id)
    .eq("round", match.round);

  if (!tasks || tasks.length === 0) {
    return { error: "Keine Tasks für diese Runde gefunden." };
  }
  const minUse = Math.min(...tasks.map((t) => (t.use_count as number | null) ?? 0));
  const candidates = tasks.filter(
    (t) => ((t.use_count as number | null) ?? 0) === minUse,
  );
  const pick = shuffle(candidates)[0];

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + tournament.round_time_seconds * 1000);

  const { error: matchErr } = await supabase
    .from("matches")
    .update({
      status: "live",
      task_id: pick.id,
      task_reference_url: pick.reference_image_url,
      task_text: pick.text_prompt,
      prompt_a: "",
      prompt_b: "",
      result_a_url: null,
      result_b_url: null,
      winner_id: null,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    })
    .eq("id", matchId);

  if (matchErr) return { error: `Reset fehlgeschlagen: ${matchErr.message}` };

  // Track the new task assignment for the rotation rule.
  await supabase
    .from("tasks")
    .update({ use_count: ((pick as { use_count?: number }).use_count ?? 0) + 1 })
    .eq("id", pick.id);

  // Re-point the tournament at this match (in case it had been cleared).
  const { error: tErr } = await supabase
    .from("tournaments")
    .update({ current_match_id: matchId })
    .eq("id", tournament.id);

  if (tErr) return { error: `Turnier-Update fehlgeschlagen: ${tErr.message}` };

  revalidatePath(`/admin/${tournament.id}`);
  return { ok: true };
}

/**
 * Pick a winner for a match in `reveal` or `voting` state. Sets winner_id,
 * flips status to `done`, advances the winner into the next bracket slot via
 * `getNextSlot`. If the match is the final, marks the tournament `finished`.
 */
export async function setMatchWinnerAction(
  matchId: string,
  winnerId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, tournament_id, round, bracket_position, player_a_id, player_b_id, status")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Match nicht gefunden." };
  if (match.status !== "reveal" && match.status !== "voting") {
    return { error: "Sieger kann nur nach dem Reveal gewählt werden." };
  }
  if (winnerId !== match.player_a_id && winnerId !== match.player_b_id) {
    return { error: "Ungültiger Sieger." };
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, player_count, is_test_mode")
    .eq("id", match.tournament_id)
    .maybeSingle();

  if (!tournament) return { error: "Turnier nicht gefunden." };

  // Capture current vote tally so the stage's reveal animation has data even
  // when the admin overrides voting manually (e.g. on a tie or shortcut).
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

  const { error: matchErr } = await supabase
    .from("matches")
    .update({
      winner_id: winnerId,
      status: "done",
      votes_a: votesA,
      votes_b: votesB,
    })
    .eq("id", matchId);

  if (matchErr) return { error: `Sieger konnte nicht gespeichert werden: ${matchErr.message}` };

  const playerCount = tournament.player_count as PlayerCount;
  const next = getNextSlot(match.round as Round, match.bracket_position, playerCount);

  if (next) {
    const slotColumn = next.slot === "A" ? "player_a_id" : "player_b_id";
    const { error: advanceErr } = await supabase
      .from("matches")
      .update({ [slotColumn]: winnerId })
      .eq("tournament_id", tournament.id)
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
      .eq("id", tournament.id);
    if (tErr) return { error: `Turnier-Abschluss fehlgeschlagen: ${tErr.message}` };
  }

  revalidatePath(`/admin/${match.tournament_id}`);
  return { ok: true };
}

/**
 * Kill-switch: abort the current match (any post-pending state) and restart
 * it from scratch with the same players AND the same task. Use when a player
 * had a technical issue mid-match and you need to redo it cleanly.
 *
 * Resets prompts, results, winner; sets a fresh timer; status back to `live`.
 * Does NOT bump the task's use_count (this is a redo, not a new assignment).
 */
export async function restartLiveMatchAction(
  matchId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, tournament_id, status, player_a_id, player_b_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Match nicht gefunden." };
  if (
    match.status !== "live" &&
    match.status !== "locked" &&
    match.status !== "generating" &&
    match.status !== "reveal"
  ) {
    return {
      error: "Match kann nur während eines aktiven Matches neu gestartet werden.",
    };
  }
  if (!match.player_a_id || !match.player_b_id) {
    return { error: "Spieler fehlen für dieses Match." };
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, round_time_seconds")
    .eq("id", match.tournament_id)
    .maybeSingle();

  if (!tournament) return { error: "Turnier nicht gefunden." };

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + tournament.round_time_seconds * 1000);

  const { error: matchErr } = await supabase
    .from("matches")
    .update({
      status: "live",
      prompt_a: "",
      prompt_b: "",
      result_a_url: null,
      result_b_url: null,
      winner_id: null,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    })
    .eq("id", matchId);

  if (matchErr) return { error: `Restart fehlgeschlagen: ${matchErr.message}` };

  await supabase
    .from("tournaments")
    .update({ current_match_id: matchId })
    .eq("id", tournament.id);

  revalidatePath(`/admin/${tournament.id}`);
  return { ok: true };
}

/**
 * Lock a live match. Idempotent: succeeds whether the timer expired or the
 * admin pressed the button early. Server overrides the end_time when locked
 * early so the recorded timer matches reality.
 */
export async function lockMatchAction(
  matchId: string,
  _prev: MatchActionState,
  _formData: FormData,
): Promise<MatchActionState> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status, tournament_id, end_time")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { error: "Match nicht gefunden." };
  if (match.status === "locked" || match.status === "done") return { ok: true };
  if (match.status !== "live") return { error: "Match ist nicht live." };

  const now = new Date();
  const endTime = match.end_time ? new Date(match.end_time) : now;
  const recordedEnd = endTime < now ? endTime : now;

  const { error } = await supabase
    .from("matches")
    .update({ status: "locked", end_time: recordedEnd.toISOString() })
    .eq("id", matchId)
    .eq("status", "live");

  if (error) return { error: `Lock fehlgeschlagen: ${error.message}` };

  revalidatePath(`/admin/${match.tournament_id}`);
  return { ok: true };
}
