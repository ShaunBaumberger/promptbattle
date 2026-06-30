"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";

export type JoinState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "ok"; participantId: string; tournamentCode: string };

export async function joinTournamentAction(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  // Errors are localized to the player's chosen language (cookie-driven).
  const { dict } = await getServerDictionary();

  if (!code) return { status: "error", error: dict.join.errCodeMissing };
  if (!name) return { status: "error", error: dict.join.errNameRequired };
  if (name.length > 40) return { status: "error", error: dict.join.errNameTooLong };

  const supabase = createServiceRoleClient();

  const { data: tournament, error: lookupErr } = await supabase
    .from("tournaments")
    .select("id, code, status")
    .eq("code", code)
    .maybeSingle();

  if (lookupErr) {
    return { status: "error", error: dict.join.errLoadFailed };
  }
  if (!tournament) {
    return { status: "error", error: dict.join.errInvalidCode };
  }
  if (tournament.status === "finished") {
    return { status: "error", error: dict.join.errFinished };
  }

  const { data: participant, error: insertErr } = await supabase
    .from("participants")
    .insert({ tournament_id: tournament.id, name })
    .select("id")
    .single();

  if (insertErr || !participant) {
    return {
      status: "error",
      error: interpolate(dict.join.errFailed, {
        msg: insertErr?.message ?? "unknown error",
      }),
    };
  }

  return { status: "ok", participantId: participant.id, tournamentCode: tournament.code };
}
