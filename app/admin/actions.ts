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
  const rawMode = String(formData.get("mode") ?? "");
  const roundTime = Number(formData.get("round_time_seconds")) || 60;
  const rawVenue = String(formData.get("venue") ?? "onsite");
  const venue = rawVenue === "online" ? "online" : "onsite";

  if (!name) return { error: dict.join.errNameRequired };

  // Every tournament starts on the free plan; premium (paid per event)
  // arrives with the Stripe build. The gate below is plan-aware so it
  // needs no rewiring once premium is purchasable.
  const plan: Plan = "free";

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
      return { error: dict.admin.err.invalidChoice };
    }
    // Tier gate — enforced server-side so a hand-crafted POST can't
    // bypass the disabled options in the create form.
    if (playerCount > limitsFor(plan).maxPlayers) {
      return { error: dict.admin.err.playersNeedPremium };
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
