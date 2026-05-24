"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/gemini";
import { generateVideo } from "@/lib/veo";

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

// ---------- Video-task generation -----------------------------------------

/**
 * Generate Veo videos for a video-task match — with Nano Banana image
 * backups generated in parallel. Drives the full locked → generating →
 * reveal lifecycle:
 *   1. atomic claim (status: locked → generating)
 *   2. kick off image + video generation in parallel
 *   3. as soon as images land (~15s), UPDATE result URLs + flip to
 *      `reveal` so the audience sees something quickly
 *   4. continue waiting for videos; UPDATE video URLs when they arrive
 *
 * Why both: Veo can take 60–120s and Vercel Hobby caps functions at
 * 60s. The image backup means even if the function gets killed before
 * videos land, the audience still has something to vote on; admin can
 * use the manual winner-pick. If videos do finish in time, the admin's
 * "Video abspielen" buttons enable and they get the full show.
 *
 * Atomic claim guarantees only one caller actually runs the API calls
 * even if multiple clients fan out triggers. Per-asset failures are
 * isolated.
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

  // Check if test-mode wants to skip image generation (the toggle still
  // applies to the backup images — videos are always real because there's
  // no equivalent debug shortcut for Veo).
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

  // Mark videos as pending so the UI knows generation is in flight
  // (admin's "Video abspielen" buttons stay hidden until real URLs land).
  await supabase
    .from("matches")
    .update({
      video_a_url: promptA ? "pending" : null,
      video_b_url: promptB ? "pending" : null,
    })
    .eq("id", matchId);

  // Start both pipelines in parallel.
  const imageJob: Promise<[string | null, string | null]> = skipBackupImages
    ? Promise.resolve([null, null])
    : Promise.all([
        generateAndUpload(promptA, tournamentId, matchId, "a"),
        generateAndUpload(promptB, tournamentId, matchId, "b"),
      ]);
  const videoJob = Promise.all([
    generateAndUploadVideo(promptA, tournamentId, matchId, "a"),
    generateAndUploadVideo(promptB, tournamentId, matchId, "b"),
  ]);

  // Phase 1: images land first (~15s for Nano Banana Pro). As soon as
  // they do, flip to reveal so the audience has something to look at
  // even if videos take their full time. Image errors are non-fatal —
  // we still flip to reveal so the flow doesn't get stuck.
  try {
    const [imgA, imgB] = await imageJob;
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
  revalidatePath(`/admin/${tournamentId}`);

  // Phase 2: wait for videos. If Vercel kills the function before this
  // resolves, the row stays at video_*_url='pending'. Images are
  // already up, so the audience can still vote — admin uses the
  // manual winner pick.
  const [videoA, videoB] = await videoJob;
  await supabase
    .from("matches")
    .update({ video_a_url: videoA, video_b_url: videoB })
    .eq("id", matchId);

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

async function generateAndUploadVideo(
  prompt: string,
  tournamentId: string,
  matchId: string,
  slot: "a" | "b",
): Promise<string | null> {
  if (!prompt) return null;
  try {
    const { bytes, mimeType } = await generateVideo(prompt, {
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
    });
    const ext = mimeType === "video/webm" ? "webm" : "mp4";
    const path = `tournaments/${tournamentId}/results/${matchId}/${slot}-${nanoid(6)}.${ext}`;

    const supabase = createServiceRoleClient();
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (uploadErr) {
      console.error(`video upload failed for ${slot}:`, uploadErr);
      return null;
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error(`video generation failed for ${slot}:`, err);
    return null;
  }
}
