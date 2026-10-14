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
  effectivePlan,
  estimateTournamentCostCents,
  centsToUsd,
  FREE_GAMES_PER_WINDOW,
  quotaWindowStartIso,
  imageModelFor,
  videoModelFor,
  type Plan,
} from "@/lib/tiers";
import { encryptionConfigured } from "@/lib/crypto";
import { getByoProviders } from "@/lib/byo-key";
import { platformProviders } from "@/lib/ai";
import { ByoKeyCard } from "./byo-key-card";
import { ModelSettingsCard } from "./model-settings-card";
import { FlashToast } from "@/components/flash-toast";
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
  searchParams: Promise<{ upgrade?: string; session_id?: string; copied?: string }>;
}) {
  const { id } = await params;
  const { upgrade, session_id: checkoutSessionId, copied } = await searchParams;

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

  const byoKeySet = tournament.byo_key === true;
  // BYO key ⇒ premium features; every prop below derives from this.
  const plan = effectivePlan((tournament.plan as Plan) ?? "free", byoKeySet);
  const skipGeneration =
    tournament.skip_image_generation === true || tournament.is_test_mode === true;
  const byoProviders = byoKeySet ? await getByoProviders(tournament.id) : [];
  const imageOverride = (tournament.image_model as string | null) ?? null;
  const videoOverride = (tournament.video_model as string | null) ?? null;
  const imageRef = imageModelFor(plan, imageOverride);
  const videoRef = videoModelFor(plan, videoOverride);
  const modelMode = byoKeySet ? "byo" : plan === "free" ? "free" : "platform";

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
      .eq("byo_key", false) // mirror the enforcement query exactly
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
      imageModelOverride: imageOverride,
      videoModelOverride: videoOverride,
      matchTaskKinds: matchTaskKinds.slice(
        0,
        Math.max(0, (tournament.player_count as number) - 1),
      ),
      skipGeneration,
    }),
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6">
      {copied === "1" && <FlashToast message={dict.admin.copied} />}
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
          ← {dict.admin.back}
        </Link>
        <div className="flex items-center gap-2">
          {byoKeySet && (
            <Badge className="border-pb-green/50 bg-pb-green/15 text-pb-green">
              🔑 {dict.admin.byoBadge}
            </Badge>
          )}
          {tournament.plan === "premium" && (
            <Badge className="border-pb-magenta/50 bg-pb-magenta/15 text-pb-magenta">
              ✨ {dict.admin.premiumBadge}
            </Badge>
          )}
          <Badge variant="secondary">
            {dict.admin.tStatus[tournament.status as Tournament["status"]]}
          </Badge>
        </div>
      </div>

      {upgrade === "success" && plan === "premium" && (
        <div className="rounded-xl border border-pb-green/40 bg-pb-green/10 p-3 text-sm text-pb-green">
          ✅ {dict.admin.upgradeSuccess}
        </div>
      )}
      {upgrade === "cancelled" && (
        <div className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          {dict.admin.upgradeCancelled}
        </div>
      )}

      <header className="space-y-2">
        <h1 className="font-display text-3xl font-black tracking-tight break-words">{tournament.name}</h1>
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
          initialName={tournament.name}
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
          the bracket starts (models/limits must not change mid-game).
          Hidden when a BYO key is set (premium is already unlocked). */}
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

      {/* BYO keys — the third path: premium features on the host's own
          AI provider keys, zero platform cost. Setup-only for the same
          "nothing changes mid-game" reason as the upgrade. */}
      {tournament.status === "setup" &&
        !tournament.is_test_mode &&
        encryptionConfigured() && (
          <section>
            <ByoKeyCard tournamentId={tournament.id} storedProviders={byoProviders} />
          </section>
        )}

      {tournament.status === "setup" && !tournament.is_test_mode && (
        <section>
          <ModelSettingsCard
            // Remount when the server changes the models (e.g. a new key).
            key={`${modelMode}|${imageRef}|${videoRef}|${byoProviders.join(",")}`}
            tournamentId={tournament.id}
            mode={modelMode}
            imageRef={imageRef}
            videoRef={videoRef}
            providers={modelMode === "byo" ? byoProviders : platformProviders()}
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
        <h2 className="font-display text-xl font-bold">{dict.admin.tasksHeading}</h2>
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

      <section className="bg-card space-y-3 rounded-2xl border p-5">
        <h2 className="font-display text-base font-bold">{dict.admin.duplicate}</h2>
        <p className="text-muted-foreground text-sm">{dict.admin.duplicateHint}</p>
        <form action={copyTournamentAction.bind(null, tournament.id)}>
          <Button type="submit" variant="outline" size="sm">
            {dict.admin.copyTournament}
          </Button>
        </form>
      </section>

      <section className="bg-card border-destructive/50 space-y-3 rounded-2xl border p-5">
        <h2 className="font-display text-base font-bold">{dict.admin.dangerZone}</h2>
        <p className="text-muted-foreground text-sm">{dict.admin.dangerHint}</p>
        <DeleteTournamentDialog
          tournamentId={tournament.id}
          tournamentName={tournament.name}
        />
      </section>
    </main>
  );
}
