"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export type UpdatePromptResult = { ok: boolean; error?: string };

const MAX_PROMPT_LENGTH = 1000;

/**
 * Player-side throttled writeback of the current prompt draft.
 *
 * Server-authoritative checks:
 *  - participant must own one of the two slots on the match
 *  - match must be `live`
 *  - end_time must not have passed
 *
 * Updates either prompt_a or prompt_b based on which slot the participant holds.
 */
export async function updatePromptAction(
  matchId: string,
  participantId: string,
  prompt: string,
): Promise<UpdatePromptResult> {
  if (typeof prompt !== "string") return { ok: false, error: "Ungültiger Prompt." };
  const trimmed = prompt.slice(0, MAX_PROMPT_LENGTH);

  const supabase = createServiceRoleClient();

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id, status, end_time, player_a_id, player_b_id")
    .eq("id", matchId)
    .maybeSingle();

  if (matchErr || !match) return { ok: false, error: "Match nicht gefunden." };
  if (match.status !== "live") return { ok: false, error: "Match ist nicht live." };
  if (match.end_time && new Date(match.end_time) < new Date()) {
    return { ok: false, error: "Zeit abgelaufen." };
  }

  let column: "prompt_a" | "prompt_b" | null = null;
  if (match.player_a_id === participantId) column = "prompt_a";
  else if (match.player_b_id === participantId) column = "prompt_b";
  if (!column) return { ok: false, error: "Du gehörst nicht zu diesem Match." };

  const { error: updateErr } = await supabase
    .from("matches")
    .update({ [column]: trimmed })
    .eq("id", matchId)
    .eq("status", "live");

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true };
}
