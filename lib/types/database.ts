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

export interface Task {
  id: string;
  tournament_id: string;
  /** Set for image-based tasks; null for text tasks. */
  reference_image_url: string | null;
  /** Set for text-based tasks; null for image tasks. */
  text_prompt: string | null;
  internal_label: string | null;
  round: Round;
  created_at: string;
}

export type TaskKind = "image" | "text";

export function taskKind(t: Pick<Task, "reference_image_url" | "text_prompt">): TaskKind {
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
  prompt_a: string;
  prompt_b: string;
  result_a_url: string | null;
  result_b_url: string | null;
  /** Veo-generated video URL for player A; only populated on FINAL matches. */
  video_a_url: string | null;
  /** Veo-generated video URL for player B; only populated on FINAL matches. */
  video_b_url: string | null;
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
