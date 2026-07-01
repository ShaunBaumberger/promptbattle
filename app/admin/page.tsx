import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logoutAction } from "./login/actions";
import { CreateTournamentForm } from "./create-tournament-form";
import type { Tournament } from "@/lib/types/database";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";

export const metadata = { title: "Admin · Prompt Battle" };

// Tournament list must reflect real-time DB state — without this, Next.js
// caches the snapshot at build time and shows ghost rows for tournaments
// that have since been deleted.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = createServiceRoleClient();
  const { locale, dict } = await getServerDictionary();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{dict.admin.title}</h1>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost">
            {dict.admin.logout}
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{dict.admin.createTournament}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTournamentForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{dict.admin.existingTournaments}</h2>
        {!tournaments?.length && (
          <p className="text-muted-foreground text-sm">{dict.admin.noTournaments}</p>
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
                  <Badge variant="secondary">
                    {dict.admin.tStatus[t.status as Tournament["status"]]}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {dict.admin.code} <span className="font-mono">{t.code}</span> ·{" "}
                  {interpolate(dict.admin.playersN, { count: t.player_count })}
                </p>
              </div>
              <span className="text-muted-foreground text-xs">
                {new Date(t.created_at).toLocaleString(locale)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
