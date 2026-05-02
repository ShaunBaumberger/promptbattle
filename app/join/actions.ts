"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

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

  if (!code) return { status: "error", error: "Code fehlt." };
  if (!name) return { status: "error", error: "Bitte einen Namen angeben." };
  if (name.length > 40) return { status: "error", error: "Name ist zu lang (max. 40 Zeichen)." };

  const supabase = createServiceRoleClient();

  const { data: tournament, error: lookupErr } = await supabase
    .from("tournaments")
    .select("id, code, status")
    .eq("code", code)
    .maybeSingle();

  if (lookupErr) {
    return { status: "error", error: "Turnier konnte nicht geladen werden." };
  }
  if (!tournament) {
    return { status: "error", error: "Ungültiger Code." };
  }
  if (tournament.status === "finished") {
    return { status: "error", error: "Dieses Turnier ist bereits beendet." };
  }

  const { data: participant, error: insertErr } = await supabase
    .from("participants")
    .insert({ tournament_id: tournament.id, name })
    .select("id")
    .single();

  if (insertErr || !participant) {
    return {
      status: "error",
      error: `Beitritt fehlgeschlagen: ${insertErr?.message ?? "unbekannter Fehler"}`,
    };
  }

  return { status: "ok", participantId: participant.id, tournamentCode: tournament.code };
}
