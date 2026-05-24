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
 * Generate Veo videos for both players of a video-task match. Drives the
 * full locked → generating → reveal lifecycle (no separate image step,
 * no backup images — that's the agreed contract for kind='video').
 *
 * Atomic claim on the status transition: only the first caller actually
 * runs the API calls. Subsequent fan-outs from other clients bail with
 * `{ ok: true, skipped: true }`.
 *
 * Per-video failures are isolated: if one fails the other still uploads;
 * the match still advances to `reveal` so the UI doesn't get stuck.
 *
 * Vercel caveat: each Veo render takes ~30–90s. Two parallel runs share
 * the function's 60s budget on Hobby; if either exceeds, the action gets
 * killed and the sentinel "pending" URL stays on the row. Recovery: admin
 * can clear video_a_url / video_b_url in Supabase and the client trigger
 * will re-fire on the next stale-state poll.
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

  // Mark URLs as pending so the audience knows generation is in flight
  // (admin's "Video abspielen" buttons stay hidden until real URLs land).
  await supabase
    .from("matches")
    .update({
      video_a_url: promptA ? "pending" : null,
      video_b_url: promptB ? "pending" : null,
    })
    .eq("id", matchId);

  const [videoA, videoB] = await Promise.all([
    generateAndUploadVideo(promptA, tournamentId, matchId, "a"),
    generateAndUploadVideo(promptB, tournamentId, matchId, "b"),
  ]);

  await supabase
    .from("matches")
    .update({
      video_a_url: videoA,
      video_b_url: videoB,
      status: "reveal",
    })
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
