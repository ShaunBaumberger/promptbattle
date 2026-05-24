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
    .select("id, status, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Match nicht gefunden." };
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

// ---------- Final-round video generation ----------------------------------

/**
 * Kick off Veo video generation for both players of a FINAL match. Runs in
 * parallel and updates `video_a_url` / `video_b_url` on the match row as
 * each video finishes. Images (Nano Banana) are generated separately by
 * `generateMatchImagesAction` and act as the always-available backup.
 *
 * Atomic guard: only the first caller actually runs the API calls. We claim
 * by setting `video_a_url` to a sentinel placeholder before kicking off —
 * subsequent callers see it set and bail with `{ ok: true, skipped: true }`.
 *
 * Empty prompts are skipped (no API call), and per-video failures are
 * isolated: if one fails the other still gets uploaded.
 */
export async function generateFinalVideosAction(
  matchId: string,
): Promise<GenerationResult> {
  const supabase = createServiceRoleClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, round, prompt_a, prompt_b, video_a_url, video_b_url, tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return { ok: false, error: "Match nicht gefunden." };
  if (match.round !== "FINAL") {
    return { ok: false, error: "Videos werden nur im Finale generiert." };
  }
  // Idempotency guard: if either video URL is already set, skip (another
  // caller is generating or already finished).
  if (match.video_a_url || match.video_b_url) {
    return { ok: true, skipped: true };
  }

  const tournamentId = match.tournament_id;
  const promptA = (match.prompt_a ?? "").trim();
  const promptB = (match.prompt_b ?? "").trim();

  // Sentinel claim so concurrent callers bail. Real URL or null replaces it.
  await supabase
    .from("matches")
    .update({
      video_a_url: promptA ? "pending" : null,
      video_b_url: promptB ? "pending" : null,
    })
    .eq("id", matchId)
    .is("video_a_url", null);

  const [videoA, videoB] = await Promise.all([
    generateAndUploadVideo(promptA, tournamentId, matchId, "a"),
    generateAndUploadVideo(promptB, tournamentId, matchId, "b"),
  ]);

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
