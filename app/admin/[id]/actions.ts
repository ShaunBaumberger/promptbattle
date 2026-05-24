"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { shuffle } from "@/lib/bracket";
import { getRoundsForPlayerCount } from "@/lib/rounds";
import { generateJoinCode } from "@/lib/join-code";
import type { PlayerCount, Round } from "@/lib/types/database";

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

  if (!VALID_ROUNDS.includes(round)) return { error: "Ungültige Runde." };

  if (kind === "text") {
    const text = String(formData.get("text_prompt") ?? "").trim();
    if (!text) return { error: "Bitte einen Text-Prompt eingeben." };
    if (text.length > MAX_TEXT_LENGTH) {
      return { error: `Text ist zu lang (max. ${MAX_TEXT_LENGTH} Zeichen).` };
    }

    const supabase = createServiceRoleClient();
    const { error: insertErr } = await supabase.from("tasks").insert({
      tournament_id: tournamentId,
      text_prompt: text,
      internal_label: internalLabel,
      round,
    });
    if (insertErr) {
      return { error: `Task konnte nicht gespeichert werden: ${insertErr.message}` };
    }
    revalidatePath(`/admin/${tournamentId}`);
    return {};
  }

  // Image task
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Bitte ein Bild auswählen." };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Nur JPG, PNG oder WEBP erlaubt." };
  }
  if (file.size > MAX_BYTES) return { error: "Bild ist zu groß (max. 5 MB)." };

  const supabase = createServiceRoleClient();

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `tournaments/${tournamentId}/tasks/${nanoid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) return { error: `Upload fehlgeschlagen: ${uploadErr.message}` };

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const { error: insertErr } = await supabase.from("tasks").insert({
    tournament_id: tournamentId,
    reference_image_url: pub.publicUrl,
    internal_label: internalLabel,
    round,
  });

  if (insertErr) {
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return { error: `Task konnte nicht gespeichert werden: ${insertErr.message}` };
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
    return { ok: false, error: "Rundenzeit muss zwischen 10 und 600 Sekunden liegen." };
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
  if (!["R32", "R16", "QF", "SF", "FINAL"].includes(round)) {
    return { ok: false, error: "Ungültige Runde." };
  }
  if (
    seconds !== null &&
    (!Number.isFinite(seconds) || seconds < 10 || seconds > 600)
  ) {
    return { ok: false, error: "Rundenzeit muss zwischen 10 und 600 Sekunden liegen." };
  }
  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("round_time_overrides")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { ok: false, error: "Turnier nicht gefunden." };

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
  if (![2, 4, 8, 16, 32].includes(newPlayerCount)) {
    return { ok: false, error: "Spieleranzahl muss 2, 4, 8, 16 oder 32 sein." };
  }
  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { ok: false, error: "Turnier nicht gefunden." };
  if (tournament.status !== "setup") {
    return {
      ok: false,
      error: "Spieleranzahl kann nur vor dem Turnier-Start geändert werden.",
    };
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

  const { data: source } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source) return;

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
      // Defaults: status='setup', current_match_id=null
    })
    .select("id")
    .single();
  if (createErr || !created) return;

  // Deep-copy tasks. Image binaries get re-uploaded to a new storage path so
  // the new tournament owns its assets independently.
  const { data: sourceTasks } = await supabase
    .from("tasks")
    .select("round, internal_label, reference_image_url, text_prompt")
    .eq("tournament_id", sourceId);

  const newTaskRows: Array<{
    tournament_id: string;
    round: Round;
    internal_label: string | null;
    reference_image_url: string | null;
    text_prompt: string | null;
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

    newTaskRows.push({
      tournament_id: created.id,
      round: t.round as Round,
      internal_label: (t.internal_label as string | null) ?? null,
      reference_image_url: referenceImageUrl,
      text_prompt: (t.text_prompt as string | null) ?? null,
    });
  }

  if (newTaskRows.length) {
    await supabase.from("tasks").insert(newTaskRows);
  }

  redirect(`/admin/${created.id}`);
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

export type StartBracketState = { error?: string; ok?: boolean };

export async function startBracketAction(
  tournamentId: string,
  _prev: StartBracketState,
  _formData: FormData,
): Promise<StartBracketState> {
  const supabase = createServiceRoleClient();

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, status, player_count")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr || !tournament) return { error: "Turnier nicht gefunden." };
  if (tournament.status !== "setup") {
    return { error: "Turnier wurde bereits gestartet." };
  }

  const playerCount = tournament.player_count as PlayerCount;
  const rounds = getRoundsForPlayerCount(playerCount);

  const [{ data: participants }, { data: tasks }] = await Promise.all([
    supabase.from("participants").select("id").eq("tournament_id", tournamentId),
    supabase.from("tasks").select("id, round").eq("tournament_id", tournamentId),
  ]);

  if (!participants || participants.length < playerCount) {
    return {
      error: `Nicht genug Teilnehmer: ${participants?.length ?? 0} von ${playerCount} benötigt.`,
    };
  }

  const tasksByRound = new Map<Round, string[]>();
  for (const t of tasks ?? []) {
    const arr = tasksByRound.get(t.round as Round) ?? [];
    arr.push(t.id);
    tasksByRound.set(t.round as Round, arr);
  }

  for (const spec of rounds) {
    const have = tasksByRound.get(spec.round)?.length ?? 0;
    if (have < spec.matches) {
      return {
        error: `Nicht genug Tasks für ${spec.label}: ${have} von ${spec.matches} benötigt.`,
      };
    }
  }

  const selectedIds = shuffle(participants.map((p) => p.id)).slice(0, playerCount);

  const { error: updateErr } = await supabase
    .from("participants")
    .update({ is_player: true })
    .in("id", selectedIds);

  if (updateErr) return { error: `Spieler konnten nicht markiert werden: ${updateErr.message}` };

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
    return { error: `Matches konnten nicht erstellt werden: ${insertErr.message}` };
  }

  // Track use_count so the no-repeat rotation rule has accurate baseline data.
  const usedTaskIds = matchRows.map((m) => m.task_id);
  await Promise.all(
    Array.from(new Set(usedTaskIds)).map((id) =>
      incrementTaskUseCount(supabase, id, usedTaskIds.filter((x) => x === id).length),
    ),
  );

  const { error: statusErr } = await supabase
    .from("tournaments")
    .update({ status: "live" })
    .eq("id", tournamentId);

  if (statusErr) return { error: `Status-Update fehlgeschlagen: ${statusErr.message}` };

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
