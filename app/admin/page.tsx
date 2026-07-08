import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { logoutAction } from "./login/actions";
import { CreateTournamentForm } from "./create-tournament-form";
import { copyTournamentAction } from "./[id]/actions";
import { DeleteTournamentDialog } from "./[id]/delete-tournament-dialog";
import type { Tournament } from "@/lib/types/database";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";

export const metadata = { title: "Admin · Prompt Battle" };

// Tournament list must reflect real-time DB state — without this, Next.js
// caches the snapshot at build time and shows ghost rows for tournaments
// that have since been deleted.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = await requireUser();
  const supabase = createServiceRoleClient();
  const { locale, dict } = await getServerDictionary();
  // Multi-tenant: a host only sees the tournaments they own.
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .eq("owner_id", user.id)
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
            <div
              key={t.id}
              className="hover:bg-muted/50 flex items-center gap-3 rounded-md border p-4 transition"
            >
              <Link href={`/admin/${t.id}`} className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{t.name}</span>
                  <Badge variant="secondary">
                    {dict.admin.tStatus[t.status as Tournament["status"]]}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {dict.admin.code} <span className="font-mono">{t.code}</span> ·{" "}
                  {interpolate(dict.admin.playersN, { count: t.player_count })}
                </p>
              </Link>
              <span className="text-muted-foreground hidden text-xs sm:block">
                {new Date(t.created_at).toLocaleString(locale)}
              </span>
              {/* Quick actions — outside the Link so they don't navigate.
                  Copy redirects to the new tournament (with a toast);
                  delete opens the same confirmation dialog as the
                  tournament page's danger zone. */}
              <div className="flex shrink-0 items-center">
                <form action={copyTournamentAction.bind(null, t.id)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    aria-label={dict.admin.copyTournament}
                    title={dict.admin.copyTournament}
                  >
                    <Copy className="size-4" />
                  </Button>
                </form>
                <DeleteTournamentDialog
                  tournamentId={t.id}
                  tournamentName={t.name}
                  compact
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
