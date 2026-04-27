import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Lobby } from "./lobby";

// Image generation can take ~15-25s; allow headroom for the server action.
export const maxDuration = 60;

export default async function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = code.toUpperCase();

  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, code, name, status, current_match_id")
    .eq("code", normalized)
    .maybeSingle();

  if (!tournament) {
    redirect("/");
  }

  return (
    <Lobby
      tournamentId={tournament.id}
      tournamentCode={tournament.code}
      tournamentName={tournament.name}
      initialStatus={tournament.status}
      initialCurrentMatchId={tournament.current_match_id}
    />
  );
}
