import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Stage } from "./stage";
import type { PlayerCount } from "@/lib/types/database";

// Image generation can take ~15-25s; allow headroom for the server action.
export const maxDuration = 60;

export default async function StagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = code.toUpperCase();

  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, code, name, status, player_count, current_match_id")
    .eq("code", normalized)
    .maybeSingle();

  if (!tournament) redirect("/");

  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournament.id);

  return (
    <Stage
      tournamentId={tournament.id}
      tournamentCode={tournament.code}
      tournamentName={tournament.name}
      initialStatus={tournament.status}
      initialParticipantCount={count ?? 0}
      initialCurrentMatchId={tournament.current_match_id}
      playerCount={tournament.player_count as PlayerCount}
    />
  );
}
