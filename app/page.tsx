import { createServiceRoleClient } from "@/lib/supabase/server";
import { JoinFlow } from "./join/join-flow";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const trimmed = code?.trim().toUpperCase();

  if (!trimmed) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Prompt Battle</h1>
        <p className="text-muted-foreground max-w-md">
          Scanne den QR-Code auf der Bühne, um beizutreten.
        </p>
      </main>
    );
  }

  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, code, name, status")
    .eq("code", trimmed)
    .maybeSingle();

  if (!tournament) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Code nicht gefunden</h1>
        <p className="text-muted-foreground">
          Der Code <span className="font-mono">{trimmed}</span> gehört zu keinem aktiven Tournament.
        </p>
      </main>
    );
  }

  if (tournament.status === "finished") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Tournament beendet</h1>
        <p className="text-muted-foreground">{tournament.name} ist bereits vorbei.</p>
      </main>
    );
  }

  return <JoinFlow tournamentName={tournament.name} tournamentCode={tournament.code} />;
}
