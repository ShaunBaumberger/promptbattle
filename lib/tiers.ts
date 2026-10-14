import type { PlayerCount, TaskKind } from "@/lib/types/database";
import { modelCostCents, normalizeModelRef } from "@/lib/ai/models";

/**
 * Tier system — the single source of truth for what each plan may do and
 * what generation costs the platform. Everything that gates a feature or
 * estimates spend imports from here so free-tier limits can't drift apart
 * across the create form, the server actions, and the generation pipeline.
 *
 * Two ways to play (decided 2026-10 — the paid per-event plan was
 * dropped for now; promptbattle.io is free and takes donations):
 *   free    → platform-funded. Hard-capped features so one game costs the
 *             platform ~US$0.55: ≤8 players, image/text tasks only (no
 *             video), cheap image model.
 *   premium → the full feature set: big brackets, video tasks, any model.
 *             Only reachable with the host's own AI keys (BYO,
 *             tournament_secrets.byo_keys), so it costs the platform
 *             nothing. Models are addressed by refs like
 *             "openai:gpt-image-2.5-flare" — see lib/ai/models.ts.
 */

export type Plan = "free" | "premium";

export interface TierLimits {
  /** Largest allowed bracket. */
  maxPlayers: PlayerCount;
  /** May the host create video tasks? */
  videoTasks: boolean;
  /** Default image model ref when tournaments.image_model is null. */
  imageModel: string;
  /** Default video model ref when tournaments.video_model is null. */
  videoModel: string;
}

export const TIER_LIMITS: Record<Plan, TierLimits> = {
  free: {
    maxPlayers: 8,
    videoTasks: false,
    // Nano Banana 2.1: Google's current default image model, ~$0.034 per
    // 1K image — keeps a full free 8-player game around $0.50.
    imageModel: "google:gemini-nano-banana-2.1",
    videoModel: "google:gemini-omni-1.1-flash", // unreachable on free (videoTasks: false)
  },
  premium: {
    maxPlayers: 32,
    videoTasks: true,
    // Nano Banana Pro + Gemini Omni Flash. Env overrides kept for
    // self-hosters (bare Google ids or full refs like
    // "openai:gpt-image-2.5-flare"); retired ids map to their successors.
    imageModel: normalizeModelRef(
      process.env.GEMINI_IMAGE_MODEL?.trim() || "google:gemini-3-pro-image",
    ),
    videoModel: normalizeModelRef(
      process.env.VEO_MODEL?.trim() || "google:gemini-omni-1.1-flash",
    ),
  },
};

export function limitsFor(plan: Plan): TierLimits {
  return TIER_LIMITS[plan] ?? TIER_LIMITS.free;
}

/**
 * The plan whose limits actually apply. Only a tournament running on its
 * own AI keys (BYO) gets premium features — generation costs land on the
 * key owner's provider account, so there is nothing for the platform to
 * protect. The stored `plan` is ignored: every platform-funded game is a
 * free game, whatever an older row says.
 */
export function effectivePlan(_plan: Plan, byoKey: boolean): Plan {
  return byoKey ? "premium" : "free";
}

/** Player-count options a plan may pick (create form + server validation). */
export function allowedPlayerCounts(plan: Plan): PlayerCount[] {
  const all: PlayerCount[] = [2, 4, 8, 16, 32];
  return all.filter((n) => n <= limitsFor(plan).maxPlayers);
}

/**
 * Resolve the image/video model ref for a tournament. Free plans always
 * run the tier default (the cost cap depends on it); otherwise an explicit
 * per-tournament choice wins.
 */
export function imageModelFor(plan: Plan, override: string | null): string {
  if (plan === "free") return limitsFor("free").imageModel;
  return normalizeModelRef(override?.trim() || limitsFor(plan).imageModel);
}
export function videoModelFor(plan: Plan, override: string | null): string {
  if (plan === "free") return limitsFor("free").videoModel;
  return normalizeModelRef(override?.trim() || limitsFor(plan).videoModel);
}

// ---------------------------------------------------------------------
// Cost estimation (US cents). Rough by design — used for the pre-flight
// estimate shown to the host and the global platform backstop. Not
// billing. Per-model prices live in
// the catalog (lib/ai/models.ts).
// ---------------------------------------------------------------------

/**
 * Worst-case generation cost of one bracket, in cents. Every match
 * produces 2 result images; video-task matches additionally produce
 * 2 clips (images stay as the reveal backup).
 */
export function estimateTournamentCostCents(opts: {
  plan: Plan;
  imageModelOverride: string | null;
  videoModelOverride?: string | null;
  /** kind of the task assigned to each match in the bracket */
  matchTaskKinds: (TaskKind | null)[];
  /** test mode / skip-generation → nothing is generated */
  skipGeneration: boolean;
}): number {
  if (opts.skipGeneration) return 0;
  const imgCents = modelCostCents(
    imageModelFor(opts.plan, opts.imageModelOverride),
    "image",
  );
  const vidCents = modelCostCents(
    videoModelFor(opts.plan, opts.videoModelOverride ?? null),
    "video",
  );
  let total = 0;
  for (const kind of opts.matchTaskKinds) {
    total += 2 * imgCents;
    if (kind === "video") total += 2 * vidCents;
  }
  return total;
}

/**
 * Generations per match on the platform's key: the first, plus one retry
 * after "Restart match". The retry is added to the global budget; beyond
 * it a restart is refused, so restarts can't mint free images.
 */
export const MAX_PLATFORM_GENERATIONS = 2;

/** Format cents as a display string like "0.55" (USD). */
export function centsToUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------
// Free-tier quota: N free game *starts* per rolling 30 days per account.
// Counted on tournaments.started_at (set when the bracket goes live) so
// creating/abandoning drafts never burns quota, and a started game can
// always finish — caps are enforced BEFORE start, never mid-game.
// ---------------------------------------------------------------------

export const FREE_GAMES_PER_WINDOW = Number(
  process.env.FREE_GAMES_PER_MONTH ?? 5,
);
export const QUOTA_WINDOW_DAYS = 30;

export function quotaWindowStartIso(now = new Date()): string {
  return new Date(
    now.getTime() - QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}
