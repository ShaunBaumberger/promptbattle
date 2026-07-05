export type TournamentStatus = "setup" | "live" | "finished";

export type Round = "R32" | "R16" | "QF" | "SF" | "FINAL";

export type PlayerCount = 2 | 4 | 8 | 16 | 32;

export type MatchStatus =
  | "pending"
  | "preparing"
  | "live"
  | "locked"
  | "generating"
  | "reveal"
  | "voting"
  | "done";

export interface Tournament {
  id: string;
  code: string;
  name: string;
  player_count: PlayerCount;
  round_time_seconds: number;
  status: TournamentStatus;
  current_match_id: string | null;
  /** Supabase Auth user who owns this tournament (multi-tenant). */
  owner_id: string;
  /** Tier: 'free' (platform-funded, feature-gated) or 'premium' (paid). */
  plan: "free" | "premium";
  /** Per-tournament model overrides; null = tier default. */
  image_model: string | null;
  video_model: string | null;
  /** Set when the bracket goes live — powers the free-tier usage cap. */
  started_at: string | null;
  /** 'onsite' = one room + projector; 'online' = remote players who watch
   *  the stage view on their own devices. */
  venue: "onsite" | "online";
  /** True when a BYO Gemini key is stored (tournament_secrets) — unlocks
   *  premium features; generation bills the key owner, not the platform. */
  byo_key: boolean;
  /** Test-mode: skip Gemini image generation. Only effective in test mode. */
  skip_image_generation: boolean;
  /** True for the dedicated debug-tournament mode (always 2 players, exposes test controls). */
  is_test_mode: boolean;
  /** Admin-controlled signal: which FINAL-round video the stage should play fullscreen. */
  current_video_playing: "A" | "B" | null;
  /**
   * Per-round timer overrides in seconds. Missing entries fall back to
   * `round_time_seconds`. Lets the admin dial up later rounds (e.g.
   * `{ SF: 90, FINAL: 120 }`) without affecting earlier ones.
   */
  round_time_overrides: Partial<Record<Round, number>>;
  created_at: string;
}

export interface Participant {
  id: string;
  tournament_id: string;
  name: string;
  is_player: boolean;
  joined_at: string;
  last_seen_at: string;
}

export type TaskKind = "image" | "text" | "video";

export interface Task {
  id: string;
  tournament_id: string;
  /** Set for kind='image' tasks. Players see this image and recreate it. */
  reference_image_url: string | null;
  /** Set for kind='text' or kind='video' tasks. The task description. */
  text_prompt: string | null;
  /** Discriminator. Defines both input shape and generated output type. */
  kind: TaskKind;
  internal_label: string | null;
  round: Round;
  created_at: string;
}

/**
 * Back-compat helper. Prefer `task.kind` directly when you have a full
 * Task row; this fallback infers from the content fields when only the
 * partial shape is available (e.g. on a denormalized match row that
 * doesn't carry the column).
 */
export function taskKind(
  t: Pick<Task, "reference_image_url" | "text_prompt"> & { kind?: TaskKind },
): TaskKind {
  if (t.kind) return t.kind;
  return t.text_prompt != null ? "text" : "image";
}

export interface Match {
  id: string;
  tournament_id: string;
  round: Round;
  bracket_position: number;
  player_a_id: string | null;
  player_b_id: string | null;
  task_id: string | null;
  /** Denormalised image URL — only populated when match goes live. */
  task_reference_url: string | null;
  /** Denormalised text prompt — only populated when match goes live. */
  task_text: string | null;
  /** Denormalised task kind — populated at match-prep time so clients
   *  can branch (image vs text vs video) without joining `tasks`. */
  task_kind: TaskKind | null;
  prompt_a: string;
  prompt_b: string;
  result_a_url: string | null;
  result_b_url: string | null;
  /** Veo-generated video URL for player A; only populated for video tasks. */
  video_a_url: string | null;
  /** Veo-generated video URL for player B; only populated for video tasks. */
  video_b_url: string | null;
  /** Veo long-running operation name for A — polled by pollMatchVideosAction. */
  video_a_operation: string | null;
  /** Veo long-running operation name for B — polled by pollMatchVideosAction. */
  video_b_operation: string | null;
  winner_id: string | null;
  status: MatchStatus;
  start_time: string | null;
  end_time: string | null;
  /** Final tally for player A's votes; null until voting closes. */
  votes_a: number | null;
  /** Final tally for player B's votes; null until voting closes. */
  votes_b: number | null;
  created_at: string;
}

export interface Vote {
  id: string;
  match_id: string;
  voter_participant_id: string;
  choice: "A" | "B";
  created_at: string;
}
