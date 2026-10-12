import "server-only";

import type { GeneratedMedia, VideoPollResult } from "./types";

/**
 * OpenAI provider — GPT Image (images) and Sora (video), via plain HTTPS.
 * Endpoint shapes follow the official openai-node SDK:
 *   POST /v1/images/generations        → data[0].b64_json (or .url)
 *   POST /v1/videos                    → { id, status }
 *   GET  /v1/videos/{id}               → status queued|in_progress|completed|failed
 *   GET  /v1/videos/{id}/content       → mp4 bytes
 */

const BASE = "https://api.openai.com/v1";

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function openaiGenerateImage(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<GeneratedMedia> {
  const body: Record<string, unknown> = { model, prompt, n: 1, size: "1024x1024" };
  // GPT Image models: pin quality so the platform cost matches the catalog
  // price (the default "auto" can pick "high", ~4× the price). Older DALL·E
  // models use different quality values, so leave them on their default.
  if (model.startsWith("gpt-image")) body.quality = "medium";

  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI image: ${await errorText(res)}`);

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = json.data?.[0];
  if (item?.b64_json) {
    return { bytes: Buffer.from(item.b64_json, "base64"), mimeType: "image/png" };
  }
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`OpenAI image download: HTTP ${img.status}`);
    return {
      bytes: Buffer.from(await img.arrayBuffer()),
      mimeType: img.headers.get("content-type") ?? "image/png",
    };
  }
  throw new Error("OpenAI image: response contained no image");
}

export async function openaiStartVideo(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const res = await fetch(`${BASE}/videos`, {
    method: "POST",
    headers: headers(apiKey),
    // 8 s landscape matches the Veo setup (stage is 16:9).
    body: JSON.stringify({ model, prompt, seconds: "8", size: "1280x720" }),
  });
  if (!res.ok) throw new Error(`OpenAI video: ${await errorText(res)}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("OpenAI video: no job id returned");
  return json.id;
}

export async function openaiPollVideo(
  videoId: string,
  apiKey: string,
): Promise<VideoPollResult> {
  const res = await fetch(`${BASE}/videos/${encodeURIComponent(videoId)}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`OpenAI video poll: ${await errorText(res)}`);
  const job = (await res.json()) as {
    status?: string;
    error?: { message?: string } | null;
  };

  if (job.status === "queued" || job.status === "in_progress") {
    return { status: "pending" };
  }
  if (job.status !== "completed") {
    return { status: "error", error: job.error?.message ?? `status ${job.status}` };
  }

  const content = await fetch(
    `${BASE}/videos/${encodeURIComponent(videoId)}/content`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!content.ok) {
    return { status: "error", error: `download failed HTTP ${content.status}` };
  }
  return {
    status: "done",
    bytes: Buffer.from(await content.arrayBuffer()),
    mimeType: content.headers.get("content-type") ?? "video/mp4",
  };
}

/** Cheapest authenticated call — used to validate a BYO key on save. */
export async function openaiValidateKey(apiKey: string): Promise<boolean> {
  const res = await fetch(`${BASE}/models`, { headers: headers(apiKey) });
  return res.ok;
}
