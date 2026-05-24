"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/gemini";
import { startVideoGeneration, pollVideoGeneration } from "@/lib/veo";

const STORAGE_BUCKET = "images";

export type GenerationResult = { ok: boolean; error?: string; skipped?: boolean };

/**
 * Generate result images for both players of a locked match. Atomic on the
 * status transition (`locked` → `generating`): only the first caller wins, so
 * any number of clients can fan out a trigger when they observe `locked` and
 * the work runs exactly once. Subsequent callers return `{ ok: true, skipped: true }`.
 *
 * Per-player generation is independent and resilient: if one prompt fails
 * after retries, the other still proceeds, and the match still transitions to
 * `reveal` so the audience sees what was produced. Empty prompts are skipped
 * (no API call) and recorded as null result URLs.
 */
export async function generateMatchImagesAction(
  matchId: string,
): Promise<GenerationResult> {
  const supabase = createServiceRoleClient();

  // Atomic status flip: only one caller succeeds. Pre-check to give callers a
  // friendly skipped result when a generation is already in flight or done.
  const { data: existing } = await supabase
    .from("matches")
    .select("id, status, task_kind, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Match nicht gefunden." };
  if (existing.task_kind === "video") {
    // Video tasks are handled by generateMatchVideosAction, which owns its
    // own locked → reveal lifecycle. Bail so we don't race the claim.
    return { ok: true, skipped: true };
  }
  if (existing.status !== "locked") {
    // Already generating, reveal, voting, or done — nothing for us to do.
    return { ok: true, skipped: true };
  }

  const tournamentId = existing.tournament_id;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("skip_image_generation")
    .eq("id", tournamentId)
    .maybeSingle();
  const skipGeneration = tournament?.skip_image_generation === true;

  const { error: claimErr, data: claimed } = await supabase
    .from("matches")
    .update({ status: "generating" })
    .eq("id", matchId)
    .eq("status", "locked")
    .select("id, prompt_a, prompt_b")
    .maybeSingle();

  if (claimErr) {
    return { ok: false, error: `Status-Update fehlgeschlagen: ${claimErr.message}` };
  }
  if (!claimed) {
    // Another caller raced us between the pre-check and the claim.
    return { ok: true, skipped: true };
  }

  revalidatePath(`/admin/${tournamentId}`);

  if (skipGeneration) {
    // Test-mode short-circuit: jump straight to reveal with no images.
    await supabase
      .from("matches")
      .update({ status: "reveal", result_a_url: null, result_b_url: null })
      .eq("id", matchId);
    revalidatePath(`/admin/${tournamentId}`);
    return { ok: true };
  }

  const promptA = (claimed.prompt_a ?? "").trim();
  const promptB = (claimed.prompt_b ?? "").trim();

  const [resultA, resultB] = await Promise.all([
    generateAndUpload(promptA, tournamentId, matchId, "a"),
    generateAndUpload(promptB, tournamentId, matchId, "b"),
  ]);

  await supabase
    .from("matches")
    .update({
      status: "reveal",
      result_a_url: resultA,
      result_b_url: resultB,
    })
    .eq("id", matchId);

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

async function generateAndUpload(
  prompt: string,
  tournamentId: string,
  matchId: string,
  slot: "a" | "b",
): Promise<string | null> {
  if (!prompt) return null;
  try {
    const { bytes, mimeType } = await generateImage(prompt);
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const path = `tournaments/${tournamentId}/results/${matchId}/${slot}-${nanoid(6)}.${ext}`;

    const supabase = createServiceRoleClient();
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (uploadErr) {
      console.error(`upload failed for ${slot}:`, uploadErr);
      return null;
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error(`generation failed for ${slot}:`, err);
    return null;
  }
}

// ---------- Video-task generation (polling architecture) ------------------

/**
 * Kick-off action for a video-task match. Designed to finish well inside
 * Vercel's 60s function budget regardless of how long Veo takes, by
 * decoupling render from download:
 *
 *   1. atomic claim (locked → generating)
 *   2. kick off both Veo jobs (returns operation handles instantly)
 *   3. kick off Nano Banana image backups in parallel
 *   4. store operation names on the match row so a separate poller
 *      can resume them
 *   5. await ONLY the images (~15s), set their URLs + flip to reveal
 *      so the audience sees something quickly
 *   6. return
 *
 * Total runtime ≈ 15–25s. Veo continues to render server-side at
 * Google; `pollMatchVideosAction` (called every 10s by the stage and
 * admin clients) checks status, downloads bytes when done, and writes
 * the public URL onto the row.
 *
 * If image backup is disabled in test mode, the action sets status =
 * reveal immediately so the flow still progresses.
 */
export async function generateMatchVideosAction(
  matchId: string,
): Promise<GenerationResult> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("matches")
    .select("id, status, task_kind, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Match nicht gefunden." };
  if (existing.task_kind !== "video") {
    return { ok: false, error: "Diese Task ist kein Video." };
  }
  if (existing.status !== "locked") {
    return { ok: true, skipped: true };
  }

  const tournamentId = existing.tournament_id;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("skip_image_generation")
    .eq("id", tournamentId)
    .maybeSingle();
  const skipBackupImages = tournament?.skip_image_generation === true;

  // Atomic status flip: only one caller succeeds.
  const { data: claimed, error: claimErr } = await supabase
    .from("matches")
    .update({ status: "generating" })
    .eq("id", matchId)
    .eq("status", "locked")
    .select("id, prompt_a, prompt_b")
    .maybeSingle();

  if (claimErr) {
    return { ok: false, error: `Status-Update fehlgeschlagen: ${claimErr.message}` };
  }
  if (!claimed) return { ok: true, skipped: true };

  revalidatePath(`/admin/${tournamentId}`);

  const promptA = (claimed.prompt_a ?? "").trim();
  const promptB = (claimed.prompt_b ?? "").trim();

  // Mark videos as pending so the UI shows the "wird generiert" hint.
  await supabase
    .from("matches")
    .update({
      video_a_url: promptA ? "pending" : null,
      video_b_url: promptB ? "pending" : null,
    })
    .eq("id", matchId);

  // Kick off Veo jobs (returns LRO names in ~2s each). Store the names
  // so pollMatchVideosAction can resume them across invocations.
  const [opA, opB] = await Promise.all([
    kickoffVideo(promptA),
    kickoffVideo(promptB),
  ]);
  await supabase
    .from("matches")
    .update({
      video_a_operation: opA,
      video_b_operation: opB,
    })
    .eq("id", matchId);

  // Image backup runs in parallel and we wait for it before flipping to
  // reveal so the audience has visuals immediately. Test mode skips.
  if (skipBackupImages) {
    await supabase
      .from("matches")
      .update({ status: "reveal" })
      .eq("id", matchId);
  } else {
    try {
      const [imgA, imgB] = await Promise.all([
        generateAndUpload(promptA, tournamentId, matchId, "a"),
        generateAndUpload(promptB, tournamentId, matchId, "b"),
      ]);
      await supabase
        .from("matches")
        .update({
          status: "reveal",
          result_a_url: imgA,
          result_b_url: imgB,
        })
        .eq("id", matchId);
    } catch (err) {
      console.error("image backup batch failed:", err);
      await supabase
        .from("matches")
        .update({ status: "reveal" })
        .eq("id", matchId);
    }
  }
  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Helper: start a single Veo job. Returns null for empty prompts so
 * the caller can record "no video for this slot" without an API call.
 * Catches startup errors so a failed kick-off for one slot doesn't
 * abort the other.
 */
async function kickoffVideo(prompt: string): Promise<string | null> {
  if (!prompt) return null;
  try {
    const { operationName } = await startVideoGeneration(prompt, {
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
    });
    return operationName;
  } catch (err) {
    console.error("Veo kickoff failed:", err);
    return null;
  }
}

/**
 * Polling action. Called by stage and admin clients every ~10s while a
 * video-task match has any video_a_url / video_b_url still at the
 * 'pending' sentinel.
 *
 * For each pending slot with a stored operation name: ask Veo once.
 *   * still rendering → no-op, caller polls again later
 *   * done            → download bytes, upload to Storage, write URL
 *   * error / no op   → write `null` so the UI stops showing "wird
 *                       generiert" and falls back to the backup image
 *
 * Each call is short (1–5s typical) so it always fits inside Vercel's
 * function budget. Atomic claim guard prevents two simultaneous
 * pollers from double-uploading the same Veo asset.
 */
export async function pollMatchVideosAction(
  matchId: string,
): Promise<{ ok: boolean; aPending: boolean; bPending: boolean }> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, task_kind, tournament_id, video_a_url, video_b_url, video_a_operation, video_b_operation",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match || match.task_kind !== "video") {
    return { ok: false, aPending: false, bPending: false };
  }

  await Promise.all([
    pollOneSlot(matchId, "a", match.video_a_url, match.video_a_operation),
    pollOneSlot(matchId, "b", match.video_b_url, match.video_b_operation),
  ]);

  // Re-read for the freshest pending state to return to the client.
  const { data: after } = await supabase
    .from("matches")
    .select("video_a_url, video_b_url")
    .eq("id", matchId)
    .maybeSingle();
  return {
    ok: true,
    aPending: after?.video_a_url === "pending",
    bPending: after?.video_b_url === "pending",
  };
}

/**
 * Poll one slot. No-op when the URL isn't 'pending' (already done or
 * never started) or when the operation handle is missing.
 */
async function pollOneSlot(
  matchId: string,
  slot: "a" | "b",
  currentUrl: string | null,
  operationName: string | null,
): Promise<void> {
  if (currentUrl !== "pending") return;
  if (!operationName) {
    // Kick-off failed earlier; resolve to null so UI stops waiting.
    await markVideoUrl(matchId, slot, null);
    return;
  }

  let result;
  try {
    result = await pollVideoGeneration(operationName);
  } catch (err) {
    console.error(`Veo poll failed for ${slot}:`, err);
    return; // transient — try again next tick
  }
  if (result.status === "pending") return;
  if (result.status === "error") {
    console.error(`Veo error for ${slot}:`, result.error);
    await markVideoUrl(matchId, slot, null);
    return;
  }

  // Done. Race guard: claim the slot by overwriting 'pending' →
  // 'uploading'. If 0 rows match, another poller already moved on.
  const supabase = createServiceRoleClient();
  const urlColumn = slot === "a" ? "video_a_url" : "video_b_url";
  const { data: claimed } = await supabase
    .from("matches")
    .update({ [urlColumn]: "uploading" })
    .eq("id", matchId)
    .eq(urlColumn, "pending")
    .select("tournament_id")
    .maybeSingle();
  if (!claimed) return;

  const tournamentId = claimed.tournament_id as string;
  try {
    const ext = result.mimeType === "video/webm" ? "webm" : "mp4";
    const path = `tournaments/${tournamentId}/results/${matchId}/${slot}-${nanoid(6)}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, result.bytes, { contentType: result.mimeType, upsert: false });
    if (uploadErr) throw uploadErr;
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    await markVideoUrl(matchId, slot, pub.publicUrl);
    revalidatePath(`/admin/${tournamentId}`);
  } catch (err) {
    console.error(`video upload failed for ${slot}:`, err);
    await markVideoUrl(matchId, slot, null);
  }
}

async function markVideoUrl(
  matchId: string,
  slot: "a" | "b",
  url: string | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const column = slot === "a" ? "video_a_url" : "video_b_url";
  await supabase.from("matches").update({ [column]: url }).eq("id", matchId);
}
