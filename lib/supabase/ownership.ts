import "server-only";

import { getUser } from "./auth";
import { createServiceRoleClient } from "./server";
import { getServerDictionary } from "@/lib/i18n/server";

/**
 * Server actions are public HTTP endpoints — hiding a button in the UI
 * protects nothing. Every host action must verify the caller itself.
 */
export async function ownsTournament(tournamentId: string): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  const { data } = await createServiceRoleClient()
    .from("tournaments")
    .select("owner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  return !!data && data.owner_id === user.id;
}

export async function ownsMatch(matchId: string): Promise<boolean> {
  const { data } = await createServiceRoleClient()
    .from("matches")
    .select("tournament_id")
    .eq("id", matchId)
    .maybeSingle();
  return !!data && (await ownsTournament(data.tournament_id));
}

/** Deliberately the same message as a missing tournament: don't confirm IDs to strangers. */
export async function notOwnerMessage(): Promise<string> {
  const { dict } = await getServerDictionary();
  return dict.admin.err.tournamentNotFound;
}
