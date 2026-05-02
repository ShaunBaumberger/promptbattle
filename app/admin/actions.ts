"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateJoinCode } from "@/lib/join-code";

export type CreateTournamentState = { error?: string };

export async function createTournamentAction(
  _prev: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  const name = String(formData.get("name") ?? "").trim();
  const rawMode = String(formData.get("mode") ?? "");
  const roundTime = Number(formData.get("round_time_seconds")) || 60;

  if (!name) return { error: "Bitte einen Namen für das Turnier angeben." };

  // `mode` is either "test" (debug session, 2 players, skip default ON)
  // or a numeric string for the real bracket size.
  let isTestMode = false;
  let playerCount: number;
  if (rawMode === "test") {
    isTestMode = true;
    playerCount = 2;
  } else {
    playerCount = Number(rawMode);
    if (![2, 4, 8, 16, 32].includes(playerCount)) {
      return { error: "Bitte einen gültigen Modus auswählen." };
    }
  }

  const supabase = createServiceRoleClient();

  let code = generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("tournaments")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    code = generateJoinCode();
  }

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      code,
      name,
      player_count: playerCount,
      round_time_seconds: roundTime,
      is_test_mode: isTestMode,
      // Skip Gemini by default only in test mode — real tournaments generate.
      skip_image_generation: isTestMode,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: `Turnier konnte nicht erstellt werden: ${error?.message ?? "unbekannter Fehler"}` };
  }

  redirect(`/admin/${data.id}`);
}
