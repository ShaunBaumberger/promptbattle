import type { PlayerCount, TaskKind } from "@/lib/types/database";
import { modelCostCents, normalizeModelRef } from "@/lib/ai/models";

/**
 * Tier system — the single source of truth for what each plan may do and
 * what generation costs the platform. Everything that gates a feature or
 * estimates spend imports from here so free-tier limits can't drift apart
 * across the create form, the server actions, and the generation pipeline.
 *
 * Business model (decided 2026-07):
 *   free    → platform-funded. Hard-capped features so one game costs the
 *             platform ~US$0.55: ≤8 players, image/text tasks only (no
 *             video), cheap image model.
 *   premium → paid per event (Stripe, flat fee). Big brackets, video
 *             tasks, premium image model.
 *
 * BYO keys (tournament_secrets.byo_keys) unlock premium features at zero
 * platform cost and allow ANY model of the providers the host has keys
 * for. Models are addressed by refs like "openai:sora-2" — see
 * lib/ai/models.ts.
 */

export type Plan = "free" | "premium";

export interface TierLimits {
  /** Largest allowed bracket. */
  maxPlayers: PlayerCount;
  /** May the host create video tasks (Veo)? */
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
    // ~$0.039/image — keeps a full free 8-player game around $0.55.
    imageModel: "google:gemini-2.5-flash-image",
    videoModel: "google:veo-3.0-fast-generate-001", // unreachable on free (videoTasks: false)
  },
  premium: {
    maxPlayers: 32,
    videoTasks: true,
    // Nano Banana Pro + Veo 3 Fast. Env overrides kept for self-hosters
    // (bare Google ids or full refs like "openai:gpt-image-1").
    imageModel: normalizeModelRef(
      process.env.GEMINI_IMAGE_MODEL?.trim() || "google:gemini-3-pro-image-preview",
    ),
    videoModel: normalizeModelRef(
      process.env.VEO_MODEL?.trim() || "google:veo-3.0-fast-generate-001",
    ),
  },
};

export function limitsFor(plan: Plan): TierLimits {
  return TIER_LIMITS[plan] ?? TIER_LIMITS.free;
}

/**
 * The plan whose limits actually apply. A tournament running on its own
 * AI keys (BYO) gets premium features regardless of what was paid —
 * generation costs land on the key owner's provider account, so there is
 * nothing for the platform to protect.
 */
export function effectivePlan(plan: Plan, byoKey: boolean): Plan {
  return byoKey ? "premium" : plan;
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
// estimate shown to the host, the global platform backstop, and the paid
// plan's per-tournament ceiling. Not billing. Per-model prices live in
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
 * Paid plan: the most generation one flat-price tournament may cost the
 * platform (US cents). Keeps every paid event profitable — e.g. video in
 * every match of a 32-player bracket would cost ~$58 against a CHF 9 fee.
 * Enforced before start (never mid-game); hosts can trim video tasks or
 * bring their own key to go beyond it.
 */
export const PREMIUM_MAX_COST_CENTS = Number(
  process.env.PREMIUM_MAX_COST_CENTS ?? 800,
);

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
