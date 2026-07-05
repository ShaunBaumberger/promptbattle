import type { PlayerCount, TaskKind } from "@/lib/types/database";

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
 *   premium → paid per event (Stripe build pending). Big brackets, video
 *             tasks, premium image model.
 *
 * BYO-key (tournament_secrets.byo_gemini_key_encrypted) will later unlock
 * premium features at zero platform cost; the plumbing lands with the
 * Stripe build.
 */

export type Plan = "free" | "premium";

export interface TierLimits {
  /** Largest allowed bracket. */
  maxPlayers: PlayerCount;
  /** May the host create video tasks (Veo)? */
  videoTasks: boolean;
  /** Default image model when tournaments.image_model is null. */
  imageModel: string;
  /** Default video model when tournaments.video_model is null. */
  videoModel: string;
}

export const TIER_LIMITS: Record<Plan, TierLimits> = {
  free: {
    maxPlayers: 8,
    videoTasks: false,
    // ~$0.039/image — keeps a full free 8-player game around $0.55.
    imageModel: "gemini-2.5-flash-image",
    videoModel: "veo-3.0-fast-generate-001", // unreachable on free (videoTasks: false)
  },
  premium: {
    maxPlayers: 32,
    videoTasks: true,
    // Nano Banana Pro — env override kept for self-hosters.
    imageModel:
      process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3-pro-image-preview",
    videoModel: process.env.VEO_MODEL?.trim() || "veo-3.0-fast-generate-001",
  },
};

export function limitsFor(plan: Plan): TierLimits {
  return TIER_LIMITS[plan] ?? TIER_LIMITS.free;
}

/**
 * The plan whose limits actually apply. A tournament running on its own
 * Gemini key (BYO) gets premium features regardless of what was paid —
 * generation costs land on the key owner's Google account, so there is
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
 * Resolve the image/video model for a tournament: explicit per-tournament
 * override wins, otherwise the tier default.
 */
export function imageModelFor(plan: Plan, override: string | null): string {
  return override?.trim() || limitsFor(plan).imageModel;
}
export function videoModelFor(plan: Plan, override: string | null): string {
  return override?.trim() || limitsFor(plan).videoModel;
}

// ---------------------------------------------------------------------
// Cost estimation (US cents). Rough by design — used for the pre-flight
// estimate shown to the host and the global platform backstop, not for
// billing. Prices: Flash Image ~$0.039, Nano Banana Pro 1K ~$0.134,
// Veo 3 Fast 720p $0.10/s × 8s = $0.80/clip.
// ---------------------------------------------------------------------

const IMAGE_COST_CENTS: Record<string, number> = {
  "gemini-2.5-flash-image": 4,
  "gemini-3-pro-image-preview": 14,
};
const DEFAULT_IMAGE_COST_CENTS = 14; // unknown model → assume premium price
const VIDEO_COST_CENTS = 80;

export function imageCostCents(model: string): number {
  return IMAGE_COST_CENTS[model] ?? DEFAULT_IMAGE_COST_CENTS;
}

/**
 * Worst-case generation cost of one bracket, in cents. Every match
 * produces 2 result images; video-task matches additionally produce
 * 2 Veo clips (images stay as the reveal backup).
 */
export function estimateTournamentCostCents(opts: {
  plan: Plan;
  imageModelOverride: string | null;
  /** kind of the task assigned to each match in the bracket */
  matchTaskKinds: (TaskKind | null)[];
  /** test mode / skip-generation → nothing is generated */
  skipGeneration: boolean;
}): number {
  if (opts.skipGeneration) return 0;
  const imgCents = imageCostCents(imageModelFor(opts.plan, opts.imageModelOverride));
  let total = 0;
  for (const kind of opts.matchTaskKinds) {
    total += 2 * imgCents;
    if (kind === "video") total += 2 * VIDEO_COST_CENTS;
  }
  return total;
}

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
