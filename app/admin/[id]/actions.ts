"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";
import { shuffle } from "@/lib/bracket";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import { generateJoinCode } from "@/lib/join-code";
import type { PlayerCount, Round, TaskKind } from "@/lib/types/database";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  limitsFor,
  effectivePlan,
  estimateTournamentCostCents,
  imageModelFor,
  videoModelFor,
  centsToUsd,
  PREMIUM_MAX_COST_CENTS,
  FREE_GAMES_PER_WINDOW,
  quotaWindowStartIso,
  type Plan,
} from "@/lib/tiers";
import { getByoProviders } from "@/lib/byo-key";
import { platformKey } from "@/lib/ai";
import { PROVIDER_LABELS, parseModelRef, type Provider } from "@/lib/ai/models";

const VALID_ROUNDS: readonly Round[] = ["R32", "R16", "QF", "SF", "FINAL"] as const;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const STORAGE_BUCKET = "images";

export type TaskActionState = { error?: string };

const MAX_TEXT_LENGTH = 500;

export async function createTaskAction(
  tournamentId: string,
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const round = String(formData.get("round") ?? "") as Round;
  const kind = String(formData.get("kind") ?? "image");
  const internalLabel = String(formData.get("internal_label") ?? "").trim() || null;
  const { dict } = await getServerDictionary();

  if (!VALID_ROUNDS.includes(round)) return { error: dict.admin.err.invalidRound };
  if (kind !== "image" && kind !== "text" && kind !== "video") {
    return { error: dict.admin.err.invalidTaskType };
  }

  // Tier gate: video tasks (Veo, ~$1.60/match) are premium-only. Checked
  // server-side against the tournament's plan so the disabled UI button
  // isn't the only line of defense.
  if (kind === "video") {
    const supabaseGate = createServiceRoleClient();
    const { data: t } = await supabaseGate
      .from("tournaments")
      .select("plan, byo_key")
      .eq("id", tournamentId)
      .maybeSingle();
    if (!t) return { error: dict.admin.err.tournamentNotFound };
    const ePlan = effectivePlan((t.plan as Plan) ?? "free", t.byo_key === true);
    if (!limitsFor(ePlan).videoTasks) {
      return { error: dict.admin.err.videoNeedsPremium };
    }
  }

  // Text and video tasks share the same input shape — a text prompt.
  // The discriminator is `kind`, which downstream generation branches on.
  if (kind === "text" || kind === "video") {
    const text = String(formData.get("text_prompt") ?? "").trim();
    if (!text) return { error: dict.admin.err.promptRequired };
    if (text.length > MAX_TEXT_LENGTH) {
      return {
        error: interpolate(dict.admin.err.textTooLong, { max: MAX_TEXT_LENGTH }),
      };
    }

    const supabase = createServiceRoleClient();
    const { error: insertErr } = await supabase.from("tasks").insert({
      tournament_id: tournamentId,
      text_prompt: text,
      kind,
      internal_label: internalLabel,
      round,
    });
    if (insertErr) {
      return {
        error: interpolate(dict.admin.err.taskSaveFailed, { msg: insertErr.message }),
      };
    }
    revalidatePath(`/admin/${tournamentId}`);
    return {};
  }

  // Image task
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: dict.admin.err.imageRequired };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: dict.admin.err.imageFormatError };
  }
  if (file.size > MAX_BYTES) return { error: dict.admin.err.imageTooLarge };

  const supabase = createServiceRoleClient();

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `tournaments/${tournamentId}/tasks/${nanoid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    return { error: interpolate(dict.admin.err.uploadFailed, { msg: uploadErr.message }) };
  }

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const { error: insertErr } = await supabase.from("tasks").insert({
    tournament_id: tournamentId,
    reference_image_url: pub.publicUrl,
    kind: "image",
    internal_label: internalLabel,
    round,
  });

  if (insertErr) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return {
      error: interpolate(dict.admin.err.taskSaveFailed, { msg: insertErr.message }),
    };
  }

  revalidatePath(`/admin/${tournamentId}`);
  return {};
}

export async function deleteTaskAction(taskId: string, tournamentId: string) {
  const supabase = createServiceRoleClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("reference_image_url, tournament_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || task.tournament_id !== tournamentId) return;

  if (task.reference_image_url) {
    const path = extractStoragePath(task.reference_image_url);
    if (path) await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  }

  await supabase.from("tasks").delete().eq("id", taskId);

  revalidatePath(`/admin/${tournamentId}`);
}

/**
 * Change the per-round timer mid-tournament. Already-live matches keep their
 * original `end_time` (it's the wall-clock deadline) — the new value only
 * affects the next match started or restarted after this change.
 */
export async function updateRoundTimeAction(
  tournamentId: string,
  seconds: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(seconds) || seconds < 10 || seconds > 600) {
    const { dict } = await getServerDictionary();
    return { ok: false, error: dict.admin.roundTimeRangeError };
  }
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ round_time_seconds: Math.round(seconds) })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Set or clear a per-round timer override. Pass `seconds=null` to clear
 * the override (round falls back to tournament default). Validates range
 * 10–600s. Only the affected round entry is changed — others keep their
 * existing override (if any).
 */
export async function updateRoundTimeOverrideAction(
  tournamentId: string,
  round: Round,
  seconds: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const { dict } = await getServerDictionary();
  if (!["R32", "R16", "QF", "SF", "FINAL"].includes(round)) {
    return { ok: false, error: dict.admin.err.invalidRound };
  }
  if (
    seconds !== null &&
    (!Number.isFinite(seconds) || seconds < 10 || seconds > 600)
  ) {
    return { ok: false, error: dict.admin.roundTimeRangeError };
  }
  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("round_time_overrides")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { ok: false, error: dict.admin.err.tournamentNotFound };

  const overrides = {
    ...((tournament.round_time_overrides as Partial<Record<Round, number>>) ?? {}),
  };
  if (seconds === null) {
    delete overrides[round];
  } else {
    overrides[round] = Math.round(seconds);
  }
  const { error } = await supabase
    .from("tournaments")
    .update({ round_time_overrides: overrides })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Switch tournament size before the bracket has been generated. Allowed only
 * during `setup`; once the bracket is live the schedule is locked.
 */
export async function updatePlayerCountAction(
  tournamentId: string,
  newPlayerCount: number,
): Promise<{ ok: boolean; error?: string }> {
  const { dict } = await getServerDictionary();
  if (![2, 4, 8, 16, 32].includes(newPlayerCount)) {
    return { ok: false, error: dict.admin.err.playerCountInvalid };
  }
  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("status, plan, byo_key")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { ok: false, error: dict.admin.err.tournamentNotFound };
  if (tournament.status !== "setup") {
    return {
      ok: false,
      error: dict.admin.err.playerCountLockedError,
    };
  }
  // Tier gate: free plan caps the bracket size (BYO key lifts it).
  const pcPlan = effectivePlan(
    (tournament.plan as Plan) ?? "free",
    tournament.byo_key === true,
  );
  if (newPlayerCount > limitsFor(pcPlan).maxPlayers) {
    return { ok: false, error: dict.admin.err.playersNeedPremium };
  }
  // Just update player_count — skip_image_generation is now driven by the
  // separate is_test_mode flag (which is set at creation), not by size.
  const { error } = await supabase
    .from("tournaments")
    .update({ player_count: newPlayerCount })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Duplicate an existing tournament. Creates a fresh tournament row (new id +
 * code, status='setup') with the same name (suffixed with " (Kopie)"),
 * player count, round time, test-mode flag, and skip-generation flag, then
 * deep-copies all tasks. Image task files are re-uploaded to a new storage
 * path so deleting the original later doesn't yank the new tournament's images.
 *
 * After success, redirects to the new tournament's admin page.
 */
export async function copyTournamentAction(sourceId: string) {
  const supabase = createServiceRoleClient();

  // Multi-tenant guard: only the owner may duplicate their tournament.
  const user = await getUser();
  if (!user) return;

  const { data: source } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source || source.owner_id !== user.id) return;

  // Generate a unique join code (retry on the off-chance of a collision).
  let code = generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("tournaments")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    code = generateJoinCode();
  }

  const { data: created, error: createErr } = await supabase
    .from("tournaments")
    .insert({
      code,
      name: appendCopySuffix(source.name as string),
      player_count: source.player_count,
      round_time_seconds: source.round_time_seconds,
      is_test_mode: source.is_test_mode,
      skip_image_generation: source.skip_image_generation,
      owner_id: user.id,
      venue: source.venue ?? "onsite",
      // Premium is paid per event — a copy always starts back on 'free'
      // (and with started_at null, so it doesn't inherit quota usage).
      plan: "free",
      // Defaults: status='setup', current_match_id=null
    })
    .select("id")
    .single();
  if (createErr || !created) return;

  const copyPlanAllowsVideo = limitsFor("free").videoTasks;

  // Deep-copy tasks. Image binaries get re-uploaded to a new storage path so
  // the new tournament owns its assets independently.
  const { data: sourceTasks } = await supabase
    .from("tasks")
    .select("round, internal_label, reference_image_url, text_prompt, kind")
    .eq("tournament_id", sourceId);

  const newTaskRows: Array<{
    tournament_id: string;
    round: Round;
    internal_label: string | null;
    reference_image_url: string | null;
    text_prompt: string | null;
    kind: TaskKind;
  }> = [];

  for (const t of sourceTasks ?? []) {
    let referenceImageUrl: string | null = null;

    if (t.reference_image_url) {
      const sourcePath = extractStoragePath(t.reference_image_url);
      if (sourcePath) {
        const { data: blob } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(sourcePath);
        if (blob) {
          const ext = sourcePath.split(".").pop() || "png";
          const contentType = blob.type || "image/png";
          const newPath = `tournaments/${created.id}/tasks/${nanoid()}.${ext}`;
          const buffer = Buffer.from(await blob.arrayBuffer());
          const { error: uploadErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(newPath, buffer, { contentType, upsert: false });
          if (!uploadErr) {
            const { data: pub } = supabase.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(newPath);
            referenceImageUrl = pub.publicUrl;
          }
        }
      }
    }

    // Copies land on the free plan, which can't run video tasks — downgrade
    // them to text tasks (same text prompt, image output) so the copied
    // bracket stays startable without silently missing tasks.
    const sourceKind = ((t.kind as TaskKind | null) ?? "image") as TaskKind;
    const kind: TaskKind =
      sourceKind === "video" && !copyPlanAllowsVideo ? "text" : sourceKind;

    newTaskRows.push({
      tournament_id: created.id,
      round: t.round as Round,
      internal_label: (t.internal_label as string | null) ?? null,
      reference_image_url: referenceImageUrl,
      text_prompt: (t.text_prompt as string | null) ?? null,
      kind,
    });
  }

  if (newTaskRows.length) {
    await supabase.from("tasks").insert(newTaskRows);
  }

  // ?copied=1 → the destination page fires a success toast (FlashToast).
  redirect(`/admin/${created.id}?copied=1`);
}

function appendCopySuffix(name: string): string {
  // "Foo" → "Foo (Kopie)"; "Foo (Kopie)" → "Foo (Kopie 2)"; "Foo (Kopie 2)" → "Foo (Kopie 3)"
  const m = name.match(/^(.*) \(Kopie(?: (\d+))?\)$/);
  if (!m) return `${name} (Kopie)`;
  const base = m[1];
  const n = m[2] ? Number.parseInt(m[2], 10) + 1 : 2;
  return `${base} (Kopie ${n})`;
}

export async function deleteTournamentAction(tournamentId: string) {
  const supabase = createServiceRoleClient();

  // Multi-tenant guard: destructive — only the owner may delete.
  const user = await getUser();
  if (!user) redirect("/admin/login");
  const { data: t } = await supabase
    .from("tournaments")
    .select("owner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t || t.owner_id !== user.id) redirect("/admin");

  const { data: files } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(`tournaments/${tournamentId}/tasks`);

  if (files?.length) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(files.map((f) => `tournaments/${tournamentId}/tasks/${f.name}`));
  }

  await supabase.from("tournaments").delete().eq("id", tournamentId);

  redirect("/admin");
}

/**
 * Rename a tournament. Allowed at any point in the lifecycle — the name
 * is display-only (stage header, dashboard, checkout line item).
 */
export async function updateTournamentNameAction(
  tournamentId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const { dict } = await getServerDictionary();
  const user = await getUser();
  if (!user) return { ok: false, error: dict.admin.err.tournamentNotFound };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: dict.join.errNameRequired };
  if (trimmed.length > 100) return { ok: false, error: dict.join.errNameTooLong };

  const supabase = createServiceRoleClient();
  const { data: t } = await supabase
    .from("tournaments")
    .select("owner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t || t.owner_id !== user.id) {
    return { ok: false, error: dict.admin.err.tournamentNotFound };
  }

  const { error } = await supabase
    .from("tournaments")
    .update({ name: trimmed })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

export type StartBracketState = { error?: string; ok?: boolean };

export async function startBracketAction(
  tournamentId: string,
  _prev: StartBracketState,
  _formData: FormData,
): Promise<StartBracketState> {
  const supabase = createServiceRoleClient();
  const { dict } = await getServerDictionary();

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select(
      "id, status, player_count, plan, is_test_mode, skip_image_generation, image_model, video_model, owner_id, byo_key",
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr || !tournament) return { error: dict.admin.err.tournamentNotFound };
  if (tournament.status !== "setup") {
    return { error: dict.admin.err.tournamentAlreadyStarted };
  }

  const byo = tournament.byo_key === true;
  const plan = effectivePlan((tournament.plan as Plan) ?? "free", byo);
  const skipGeneration =
    tournament.skip_image_generation === true || tournament.is_test_mode === true;

  // ---- Cost-protection pre-flight -----------------------------------
  // All caps are enforced HERE, before anything is mutated. A tournament
  // that starts always finishes — no cap ever fires mid-game (that would
  // strand players in the final). Test mode / skip-generation costs
  // nothing; BYO tournaments bill their own key — both bypass the caps.
  if (plan === "free" && !skipGeneration) {
    // 1. Per-account quota: N free game starts per rolling 30 days.
    const { count: startsInWindow } = await supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", tournament.owner_id)
      .eq("plan", "free")
      .eq("byo_key", false) // BYO games cost the platform nothing
      .eq("is_test_mode", false)
      .gte("started_at", quotaWindowStartIso());
    if ((startsInWindow ?? 0) >= FREE_GAMES_PER_WINDOW) {
      return {
        error: interpolate(dict.admin.err.quotaExhausted, {
          max: FREE_GAMES_PER_WINDOW,
        }),
      };
    }

    // 2. Global backstop: platform-wide spend cap (~CHF 50). The window
    //    self-resets after 30 days; the kill switch blocks new free
    //    starts until then.
    const { data: usage } = await supabase
      .from("platform_usage")
      .select("cents_spent, window_start, hard_cap_cents, kill_switch")
      .eq("id", 1)
      .maybeSingle();
    if (usage) {
      const windowExpired =
        new Date(usage.window_start).getTime() <
        Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (windowExpired) {
        await supabase
          .from("platform_usage")
          .update({
            cents_spent: 0,
            window_start: new Date().toISOString(),
            kill_switch: false,
          })
          .eq("id", 1);
      } else if (usage.kill_switch || usage.cents_spent >= usage.hard_cap_cents) {
        if (!usage.kill_switch) {
          await supabase
            .from("platform_usage")
            .update({ kill_switch: true })
            .eq("id", 1);
        }
        return { error: dict.admin.err.budgetPaused };
      }
    }
  }
  // --------------------------------------------------------------------

  const playerCount = tournament.player_count as PlayerCount;
  const rounds = getRoundsForPlayerCount(playerCount);

  const [{ data: participants }, { data: tasks }] = await Promise.all([
    supabase.from("participants").select("id").eq("tournament_id", tournamentId),
    supabase
      .from("tasks")
      .select("id, round, kind")
      .eq("tournament_id", tournamentId),
  ]);

  if (!participants || participants.length < playerCount) {
    return {
      error: interpolate(dict.admin.err.notEnoughParticipants, {
        have: participants?.length ?? 0,
        need: playerCount,
      }),
    };
  }

  const tasksByRound = new Map<Round, string[]>();
  const taskKindById = new Map<string, TaskKind>();
  for (const t of tasks ?? []) {
    const arr = tasksByRound.get(t.round as Round) ?? [];
    arr.push(t.id);
    tasksByRound.set(t.round as Round, arr);
    taskKindById.set(t.id, (t.kind as TaskKind) ?? "image");
  }

  for (const spec of rounds) {
    const have = tasksByRound.get(spec.round)?.length ?? 0;
    if (have < spec.matches) {
      return {
        error: interpolate(dict.admin.err.notEnoughTasks, {
          label: dict.rounds[spec.round],
          have,
          need: spec.matches,
        }),
      };
    }
  }

  // ---- Model / key / cost pre-flight (still before ANY mutation) ----
  // Same principle as the quota: everything that could stop generation
  // is checked here, so a started bracket always runs to the end.
  if (!skipGeneration) {
    const imageRef = imageModelFor(plan, (tournament.image_model as string | null) ?? null);
    const videoRef = videoModelFor(plan, (tournament.video_model as string | null) ?? null);

    // Worst case per round: as many video matches as that round's task
    // pool can supply (tasks are drawn at random below).
    const worstKinds: TaskKind[] = [];
    let anyVideo = false;
    for (const spec of rounds) {
      const pool = tasksByRound.get(spec.round) ?? [];
      const videos = Math.min(
        pool.filter((id) => taskKindById.get(id) === "video").length,
        spec.matches,
      );
      if (videos > 0) anyVideo = true;
      for (let i = 0; i < spec.matches; i++) worstKinds.push(i < videos ? "video" : "image");
    }

    const providersUsed = new Set<Provider>([parseModelRef(imageRef).provider]);
    if (anyVideo) providersUsed.add(parseModelRef(videoRef).provider);

    if (byo) {
      // Own keys: every provider in use needs a stored key.
      const keyed = await getByoProviders(tournamentId);
      for (const p of providersUsed) {
        if (!keyed.includes(p)) {
          return {
            error: interpolate(dict.admin.err.providerKeyMissing, {
              provider: PROVIDER_LABELS[p],
            }),
          };
        }
      }
    } else {
      for (const p of providersUsed) {
        if (!platformKey(p)) {
          return {
            error: interpolate(dict.admin.err.platformProviderUnavailable, {
              provider: PROVIDER_LABELS[p],
            }),
          };
        }
      }
      // Paid plan: one flat fee covers a bounded generation cost.
      if (plan === "premium") {
        const worstCents = estimateTournamentCostCents({
          plan,
          imageModelOverride: (tournament.image_model as string | null) ?? null,
          videoModelOverride: (tournament.video_model as string | null) ?? null,
          matchTaskKinds: worstKinds,
          skipGeneration: false,
        });
        if (worstCents > PREMIUM_MAX_COST_CENTS) {
          return {
            error: interpolate(dict.admin.err.premiumBudgetExceeded, {
              usd: centsToUsd(worstCents),
              max: centsToUsd(PREMIUM_MAX_COST_CENTS),
            }),
          };
        }
      }
    }
  }
  // --------------------------------------------------------------------

  const selectedIds = shuffle(participants.map((p) => p.id)).slice(0, playerCount);

  const { error: updateErr } = await supabase
    .from("participants")
    .update({ is_player: true })
    .in("id", selectedIds);

  if (updateErr) {
    return {
      error: interpolate(dict.admin.err.playersMarkFailed, { msg: updateErr.message }),
    };
  }

  const matchRows: Array<{
    tournament_id: string;
    round: Round;
    bracket_position: number;
    player_a_id: string | null;
    player_b_id: string | null;
    task_id: string;
    status: "pending";
  }> = [];

  const firstRound = rounds[0];
  const pairings = chunkPairs(selectedIds);
  const firstRoundTasks = shuffle(tasksByRound.get(firstRound.round) ?? []);

  for (let i = 0; i < firstRound.matches; i++) {
    const [a, b] = pairings[i];
    matchRows.push({
      tournament_id: tournamentId,
      round: firstRound.round,
      bracket_position: i,
      player_a_id: a,
      player_b_id: b,
      task_id: firstRoundTasks[i],
      status: "pending",
    });
  }

  for (let r = 1; r < rounds.length; r++) {
    const spec = rounds[r];
    const taskPool = shuffle(tasksByRound.get(spec.round) ?? []);
    for (let i = 0; i < spec.matches; i++) {
      matchRows.push({
        tournament_id: tournamentId,
        round: spec.round,
        bracket_position: i,
        player_a_id: null,
        player_b_id: null,
        task_id: taskPool[i],
        status: "pending",
      });
    }
  }

  const { error: insertErr } = await supabase.from("matches").insert(matchRows);
  if (insertErr) {
    await supabase
      .from("participants")
      .update({ is_player: false })
      .in("id", selectedIds);
    return {
      error: interpolate(dict.admin.err.matchesCreateFailed, { msg: insertErr.message }),
    };
  }

  // Track use_count so the no-repeat rotation rule has accurate baseline data.
  const usedTaskIds = matchRows.map((m) => m.task_id);
  await Promise.all(
    Array.from(new Set(usedTaskIds)).map((id) =>
      incrementTaskUseCount(supabase, id, usedTaskIds.filter((x) => x === id).length),
    ),
  );

  // `started_at` marks this game against the free-tier quota window.
  const { error: statusErr } = await supabase
    .from("tournaments")
    .update({ status: "live", started_at: new Date().toISOString() })
    .eq("id", tournamentId);

  if (statusErr) {
    return {
      error: interpolate(dict.admin.err.statusUpdateFailed, { msg: statusErr.message }),
    };
  }

  // Record this tournament's worst-case generation cost against the
  // global backstop. Read-modify-write is fine at this scale; the cap is
  // a coarse safety net, not billing. BYO tournaments bill the owner's
  // own key — nothing to record.
  const estimatedCents = estimateTournamentCostCents({
    plan,
    imageModelOverride: (tournament.image_model as string | null) ?? null,
    videoModelOverride: (tournament.video_model as string | null) ?? null,
    matchTaskKinds: matchRows.map(
      (m) => taskKindById.get(m.task_id) ?? null,
    ),
    skipGeneration,
  });
  if (estimatedCents > 0 && !byo) {
    const { data: usageRow } = await supabase
      .from("platform_usage")
      .select("cents_spent")
      .eq("id", 1)
      .maybeSingle();
    if (usageRow) {
      await supabase
        .from("platform_usage")
        .update({ cents_spent: usageRow.cents_spent + estimatedCents })
        .eq("id", 1);
    }
  }

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

function chunkPairs<T>(arr: T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push([arr[i], arr[i + 1]]);
  }
  return pairs;
}

async function incrementTaskUseCount(
  supabase: ReturnType<typeof createServiceRoleClient>,
  taskId: string,
  by: number,
): Promise<void> {
  const { data } = await supabase
    .from("tasks")
    .select("use_count")
    .eq("id", taskId)
    .maybeSingle();
  const current = (data?.use_count as number | undefined) ?? 0;
  await supabase
    .from("tasks")
    .update({ use_count: current + by })
    .eq("id", taskId);
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}
