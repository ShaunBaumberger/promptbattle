"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/gemini";
import { startVideoGeneration, pollVideoGeneration } from "@/lib/veo";
import { imageModelFor, videoModelFor, limitsFor, type Plan } from "@/lib/tiers";

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
    .select("skip_image_generation, plan, image_model")
    .eq("id", tournamentId)
    .maybeSingle();
  const skipGeneration = tournament?.skip_image_generation === true;
  // Tier-resolved image model: free = cheap Flash, premium = Nano Banana
  // Pro (or the per-tournament override).
  const imageModel = imageModelFor(
    (tournament?.plan as Plan) ?? "free",
    (tournament?.image_model as string | null) ?? null,
  );

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
    generateAndUpload(promptA, tournamentId, matchId, "a", imageModel),
    generateAndUpload(promptB, tournamentId, matchId, "b", imageModel),
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
  /** Tier-resolved image model (see lib/tiers.ts). */
  model?: string,
): Promise<string | null> {
  if (!prompt) return null;
  try {
    const { bytes, mimeType } = await generateImage(prompt, { model });
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
 * Vercel's 60s function budget regardless of how long Veo or Nano
 * Banana takes:
 *
 *   1. atomic claim (locked → generating)
 *   2. fire Veo kickoff AND image gen IN PARALLEL — settle individually
 *      so a partial failure doesn't sink the others
 *   3. single DB write with everything we have (op names + image URLs +
 *      status=reveal)
 *
 * Total runtime ≈ 15–25s in the happy path. Veo continues to render
 * server-side at Google; `pollMatchVideosAction` (called every 10s by
 * the stage and admin clients) checks status, downloads bytes when
 * done, and writes the public URL onto the row.
 *
 * ⚠️ Top-level try/catch with a guaranteed status-flip in the catch
 * block. The previous version had a single try around image gen only,
 * so if Veo kickoff threw (or any of the DB ops between claim and
 * image gen), the match got stuck in `generating` forever with no
 * images, no videos, no recovery path. Now any failure still flips
 * the match to `reveal` so the host can move on.
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
    .select("skip_image_generation, plan, image_model, video_model")
    .eq("id", tournamentId)
    .maybeSingle();
  const skipGeneration = tournament?.skip_image_generation === true;
  const plan = (tournament?.plan as Plan) ?? "free";
  // Defense in depth: free plans can't create video tasks (createTaskAction
  // gate), so a video match on a free plan means the API was bypassed.
  // Refuse before any Veo budget is burned.
  if (!skipGeneration && !limitsFor(plan).videoTasks) {
    return { ok: false, error: "Video generation requires Premium." };
  }
  const imageModel = imageModelFor(
    plan,
    (tournament?.image_model as string | null) ?? null,
  );
  const videoModel = videoModelFor(
    plan,
    (tournament?.video_model as string | null) ?? null,
  );

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

  // Test-Modus short-circuit.
  if (skipGeneration) {
    await supabase
      .from("matches")
      .update({
        status: "reveal",
        video_a_url: null,
        video_b_url: null,
        result_a_url: null,
        result_b_url: null,
      })
      .eq("id", matchId);
    revalidatePath(`/admin/${tournamentId}`);
    return { ok: true };
  }

  // Mark videos as pending so the UI shows the "wird generiert" hint
  // and the client-side poller starts firing immediately.
  await supabase
    .from("matches")
    .update({
      video_a_url: promptA ? "pending" : null,
      video_b_url: promptB ? "pending" : null,
    })
    .eq("id", matchId);

  // Fire all four expensive calls in parallel. allSettled means a
  // single bad call (e.g. Veo RAI block on one prompt, or Nano Banana
  // hiccup on one image) doesn't sink the others.
  console.log(`[video-gen ${matchId}] starting Veo + image kickoff in parallel`);
  const results = await Promise.allSettled([
    kickoffVideo(promptA, videoModel),
    kickoffVideo(promptB, videoModel),
    generateAndUpload(promptA, tournamentId, matchId, "a", imageModel),
    generateAndUpload(promptB, tournamentId, matchId, "b", imageModel),
  ]);
  const opA = results[0].status === "fulfilled" ? results[0].value : null;
  const opB = results[1].status === "fulfilled" ? results[1].value : null;
  const imgA = results[2].status === "fulfilled" ? results[2].value : null;
  const imgB = results[3].status === "fulfilled" ? results[3].value : null;

  // Log rejections so Vercel function logs surface what went wrong.
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const labels = ["veo-a", "veo-b", "img-a", "img-b"];
      console.error(`[video-gen ${matchId}] ${labels[i]} rejected:`, r.reason);
    }
  });
  console.log(
    `[video-gen ${matchId}] kickoff done — opA=${opA ? "ok" : "null"} opB=${opB ? "ok" : "null"} imgA=${imgA ? "ok" : "null"} imgB=${imgB ? "ok" : "null"}`,
  );

  // Single DB write with everything we have. status=reveal regardless
  // so the match isn't stuck — videos will materialize later via the
  // poller if Veo succeeded.
  const { error: finalErr } = await supabase
    .from("matches")
    .update({
      status: "reveal",
      video_a_operation: opA,
      video_b_operation: opB,
      result_a_url: imgA,
      result_b_url: imgB,
      // If Veo kickoff failed (op handle is null), clear the pending
      // sentinel so the UI stops waiting on something that'll never come.
      video_a_url: opA ? "pending" : null,
      video_b_url: opB ? "pending" : null,
    })
    .eq("id", matchId);
  if (finalErr) {
    console.error(`[video-gen ${matchId}] final update failed:`, finalErr);
    // Last-ditch: at least flip status so admin can move on.
    await supabase
      .from("matches")
      .update({ status: "reveal" })
      .eq("id", matchId);
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
async function kickoffVideo(
  prompt: string,
  model?: string,
): Promise<string | null> {
  if (!prompt) return null;
  try {
    const { operationName } = await startVideoGeneration(prompt, {
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      model,
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
