import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Participant, Task, Tournament } from "@/lib/types/database";
import { TaskManager } from "./task-manager";
import { ParticipantsList } from "./participants-list";
import { StartBracketForm } from "./start-bracket-form";
import { MatchControl } from "./match-control";
import { TournamentSettings } from "./tournament-settings";
import { DeleteTournamentDialog } from "./delete-tournament-dialog";
import { copyTournamentAction } from "./actions";
import type { PlayerCount, Round } from "@/lib/types/database";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { requireUser } from "@/lib/supabase/auth";
import {
  limitsFor,
  estimateTournamentCostCents,
  centsToUsd,
  FREE_GAMES_PER_WINDOW,
  quotaWindowStartIso,
  type Plan,
} from "@/lib/tiers";
import {
  stripeConfigured,
  premiumPriceDisplay,
  fulfillCheckoutSession,
} from "@/lib/stripe";
import { UpgradeCard } from "./upgrade-card";

// Image generation can take ~15-25s; allow headroom for the server action.
export const maxDuration = 60;

export default async function TournamentAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upgrade?: string; session_id?: string }>;
}) {
  const { id } = await params;
  const { upgrade, session_id: checkoutSessionId } = await searchParams;

  const user = await requireUser();
  const supabase = createServiceRoleClient();
  const { locale, dict } = await getServerDictionary();

  // Returning from Stripe Checkout: verify + fulfill BEFORE fetching the
  // tournament so this render already shows the premium state. Idempotent
  // (the webhook may have fulfilled first) and forgery-proof (the session
  // is verified against the Stripe API; the upgraded tournament comes
  // from the session's own metadata).
  if (upgrade === "success" && checkoutSessionId) {
    await fulfillCheckoutSession(checkoutSessionId);
  }

  const [{ data: tournament }, { data: tasks }, { data: participants }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("tournament_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", id)
      .order("joined_at", { ascending: true }),
  ]);

  // Multi-tenant guard: only the owner may open a tournament's admin page.
  if (!tournament || tournament.owner_id !== user.id) notFound();

  const tasksByRound: Record<Round, number> = { R32: 0, R16: 0, QF: 0, SF: 0, FINAL: 0 };
  for (const t of (tasks ?? []) as Task[]) {
    tasksByRound[t.round] = (tasksByRound[t.round] ?? 0) + 1;
  }

  const plan = (tournament.plan as Plan) ?? "free";
  const skipGeneration =
    tournament.skip_image_generation === true || tournament.is_test_mode === true;

  // Pre-flight info for the start form: free games remaining in the
  // rolling 30-day window + a worst-case cost estimate for this bracket.
  // Caps only ever block BEFORE start — never mid-game.
  let freeGamesLeft: number | null = null;
  if (plan === "free" && !tournament.is_test_mode) {
    const { count } = await supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("plan", "free")
      .eq("is_test_mode", false)
      .gte("started_at", quotaWindowStartIso());
    freeGamesLeft = Math.max(0, FREE_GAMES_PER_WINDOW - (count ?? 0));
  }
  // Estimate: N-1 matches, 2 images each; video-kind tasks add 2 clips.
  // Task→match assignment happens at start, so approximate with each
  // round's tasks in creation order (same pools the bracket draws from).
  const matchTaskKinds = ((tasks ?? []) as Task[]).map((t) => t.kind);
  const estCostUsd = centsToUsd(
    estimateTournamentCostCents({
      plan,
      imageModelOverride: (tournament.image_model as string | null) ?? null,
      matchTaskKinds: matchTaskKinds.slice(
        0,
        Math.max(0, (tournament.player_count as number) - 1),
      ),
      skipGeneration,
    }),
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
          ← {dict.admin.back}
        </Link>
        <div className="flex items-center gap-2">
          {plan === "premium" && (
            <Badge className="border-amber-500/50 bg-amber-500/15 text-amber-600">
              ✨ {dict.admin.premiumBadge}
            </Badge>
          )}
          <Badge variant="secondary">
            {dict.admin.tStatus[tournament.status as Tournament["status"]]}
          </Badge>
        </div>
      </div>

      {upgrade === "success" && plan === "premium" && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          ✅ {dict.admin.upgradeSuccess}
        </div>
      )}
      {upgrade === "cancelled" && (
        <div className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          {dict.admin.upgradeCancelled}
        </div>
      )}

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
        <p className="text-muted-foreground text-sm">
          {dict.admin.joinCodeLabel}{" "}
          <span className="bg-muted rounded px-2 py-0.5 font-mono">{tournament.code}</span>
          {" · "}
          {interpolate(dict.admin.playersN, { count: tournament.player_count })}
          {" · "}
          {interpolate(dict.admin.perRound, { n: tournament.round_time_seconds })}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href={`/stage/${tournament.code}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {dict.admin.openStage}
          </a>
        </div>
      </header>

      <section>
        <TournamentSettings
          tournamentId={tournament.id}
          initialPlayerCount={tournament.player_count as PlayerCount}
          initialRoundTime={tournament.round_time_seconds}
          initialRoundTimeOverrides={
            (tournament.round_time_overrides as Partial<Record<Round, number>>) ??
            {}
          }
          initialSkipGeneration={tournament.skip_image_generation === true}
          status={tournament.status as Tournament["status"]}
          maxPlayers={limitsFor(plan).maxPlayers}
        />
      </section>

      {/* Pay-per-event upgrade — only while free, in setup, not a test
          tournament, and Stripe is configured. Upgrading is locked once
          the bracket starts (models/limits must not change mid-game). */}
      {plan === "free" &&
        tournament.status === "setup" &&
        !tournament.is_test_mode &&
        stripeConfigured() && (
          <section>
            <UpgradeCard
              tournamentId={tournament.id}
              priceDisplay={premiumPriceDisplay(locale)}
            />
          </section>
        )}

      <section>
        <ParticipantsList
          tournamentId={tournament.id}
          initialParticipants={(participants ?? []) as Participant[]}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{dict.admin.tasksHeading}</h2>
        <TaskManager
          tournamentId={tournament.id}
          playerCount={tournament.player_count as PlayerCount}
          tasks={(tasks ?? []) as Task[]}
          videoAllowed={limitsFor(plan).videoTasks}
        />
      </section>

      {tournament.status === "setup" && (
        <section>
          <StartBracketForm
            tournamentId={tournament.id}
            playerCount={tournament.player_count as PlayerCount}
            initialParticipantCount={(participants ?? []).length}
            initialTasksByRound={tasksByRound}
            freeGamesLeft={freeGamesLeft}
            estCostUsd={skipGeneration ? null : estCostUsd}
          />
        </section>
      )}

      {tournament.status === "live" && (
        <section>
          <MatchControl
            tournamentId={tournament.id}
            initialCurrentMatchId={tournament.current_match_id}
            roundTimeSeconds={tournament.round_time_seconds}
            playerCount={tournament.player_count as PlayerCount}
            initialSkipGeneration={tournament.skip_image_generation === true}
            isTestMode={tournament.is_test_mode === true}
          />
        </section>
      )}

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">{dict.admin.duplicate}</h2>
        <p className="text-muted-foreground text-sm">{dict.admin.duplicateHint}</p>
        <form action={copyTournamentAction.bind(null, tournament.id)}>
          <Button type="submit" variant="outline" size="sm">
            {dict.admin.copyTournament}
          </Button>
        </form>
      </section>

      <section className="border-destructive/50 space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">{dict.admin.dangerZone}</h2>
        <p className="text-muted-foreground text-sm">{dict.admin.dangerHint}</p>
        <DeleteTournamentDialog
          tournamentId={tournament.id}
          tournamentName={tournament.name}
        />
      </section>
    </main>
  );
}
