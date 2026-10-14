"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";
import { generateJoinCode } from "@/lib/join-code";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { limitsFor, type Plan } from "@/lib/tiers";

export type CreateTournamentState = { error?: string };

export async function createTournamentAction(
  _prev: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  const user = await getUser();
  if (!user) return { error: "Not signed in." };
  const { dict } = await getServerDictionary();

  const name = String(formData.get("name") ?? "").trim();
  const rawVenue = String(formData.get("venue") ?? "onsite");
  const venue = rawVenue === "online" ? "online" : "onsite";

  if (!name) return { error: dict.join.errNameRequired };

  // The create form is intentionally minimal: name + venue. Everything
  // else (player count, round times, test/live mode) is configured in
  // the tournament's settings afterwards. Defaults below; every
  // tournament starts on the free plan — the host's own AI key on the
  // tournament page unlocks the rest.
  const plan: Plan = "free";
  const playerCount = Math.min(8, limitsFor(plan).maxPlayers);
  const roundTime = 60;
  const isTestMode = false;

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
      owner_id: user.id,
      plan,
      venue,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: interpolate(dict.admin.err.taskSaveFailed, {
        msg: error?.message ?? "unknown error",
      }),
    };
  }

  redirect(`/admin/${data.id}`);
}
