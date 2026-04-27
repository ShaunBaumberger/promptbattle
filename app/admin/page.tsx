import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logoutAction } from "./login/actions";
import { CreateTournamentForm } from "./create-tournament-form";
import type { Tournament } from "@/lib/types/database";

export const metadata = { title: "Admin · Prompt Battle" };

const STATUS_LABELS: Record<Tournament["status"], string> = {
  setup: "In Vorbereitung",
  live: "Läuft",
  finished: "Beendet",
};

export default async function AdminDashboardPage() {
  const supabase = createServiceRoleClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost">
            Abmelden
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Neues Tournament erstellen</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTournamentForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bestehende Tournaments</h2>
        {!tournaments?.length && (
          <p className="text-muted-foreground text-sm">Noch keine Tournaments vorhanden.</p>
        )}
        <div className="grid gap-3">
          {tournaments?.map((t) => (
            <Link
              key={t.id}
              href={`/admin/${t.id}`}
              className="hover:bg-muted/50 flex items-center justify-between rounded-md border p-4 transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="secondary">{STATUS_LABELS[t.status as Tournament["status"]]}</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  Code: <span className="font-mono">{t.code}</span> · {t.player_count} Spieler
                </p>
              </div>
              <span className="text-muted-foreground text-xs">
                {new Date(t.created_at).toLocaleString("de-DE")}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
