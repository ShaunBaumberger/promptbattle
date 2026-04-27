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
  const playerCount = Number(formData.get("player_count"));
  const roundTime = Number(formData.get("round_time_seconds")) || 60;

  if (!name) return { error: "Bitte einen Namen für das Tournament angeben." };
  if (![2, 4, 8, 16, 32].includes(playerCount)) {
    return { error: "Spieleranzahl muss 2, 4, 8, 16 oder 32 sein." };
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
      // Test-mode default: 2-player tournaments skip Gemini by default so test
      // sessions don't burn through API budget. Real tournaments (4+) generate.
      skip_image_generation: playerCount === 2,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: `Tournament konnte nicht erstellt werden: ${error?.message ?? "unbekannter Fehler"}` };
  }

  redirect(`/admin/${data.id}`);
}
