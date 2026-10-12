import "server-only";

import type { GeneratedMedia } from "./types";

/**
 * OpenAI provider — GPT Image, via plain HTTPS:
 *   POST /v1/images/generations        → data[0].b64_json (or .url)
 * Images only: OpenAI retired Sora and the Videos API on 2026-09-24.
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
  // price (the default "auto" can pick "high" or above, 4×+ the price).
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

/** Cheapest authenticated call — used to validate a BYO key on save. */
export async function openaiValidateKey(apiKey: string): Promise<boolean> {
  const res = await fetch(`${BASE}/models`, { headers: headers(apiKey) });
  return res.ok;
}
