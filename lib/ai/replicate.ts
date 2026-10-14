import "server-only";

import type { GeneratedMedia, VideoPollResult } from "./types";

/**
 * Replicate provider — one API key, thousands of models (FLUX, Kling,
 * Seedance, Veo, …). Endpoints per Replicate's OpenAPI spec:
 *   POST /v1/models/{owner}/{name}/predictions   official models
 *   POST /v1/predictions  { version }            community models
 *                                                (ref "owner/name:version")
 *   GET  /v1/predictions/{id}                    poll
 * Statuses: starting | processing | succeeded | failed | canceled | aborted.
 *
 * Input schemas differ per model; `prompt` is the near-universal field,
 * so it's the only one we send — model-specific options stay at the
 * model's defaults.
 */

const BASE = "https://api.replicate.com/v1";

interface Prediction {
  id: string;
  status: string;
  output?: unknown;
  error?: string | null;
}

function headers(apiKey: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function createPrediction(
  model: string,
  prompt: string,
  apiKey: string,
  waitSeconds?: number,
): Promise<Prediction> {
  const [slug, version] = model.split(":");
  const extra: Record<string, string> = waitSeconds
    ? { Prefer: `wait=${waitSeconds}` }
    : {};
  const url = version ? `${BASE}/predictions` : `${BASE}/models/${slug}/predictions`;
  const body = version ? { version, input: { prompt } } : { input: { prompt } };

  const res = await fetch(url, {
    method: "POST",
    headers: headers(apiKey, extra),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Replicate: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as Prediction;
}

async function getPrediction(id: string, apiKey: string): Promise<Prediction> {
  const res = await fetch(`${BASE}/predictions/${encodeURIComponent(id)}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Replicate poll: HTTP ${res.status}`);
  return (await res.json()) as Prediction;
}

/** Outputs are a URL, a list of URLs, or (rarely) an object with `url`. */
function firstOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = firstOutputUrl(item);
      if (url) return url;
    }
  }
  if (output && typeof output === "object" && "url" in output) {
    const url = (output as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

async function download(url: string, fallbackMime: string): Promise<GeneratedMedia> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Replicate download: HTTP ${res.status}`);
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? fallbackMime,
  };
}

const TERMINAL_FAIL = new Set(["failed", "canceled", "aborted"]);

/**
 * Images finish in seconds, so wait synchronously (Prefer: wait) and fall
 * back to short polling. Stays well inside the 60 s function budget.
 */
export async function replicateGenerateImage(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<GeneratedMedia> {
  let pred = await createPrediction(model, prompt, apiKey, 40);
  const deadline = Date.now() + 15_000;
  while (pred.status !== "succeeded" && !TERMINAL_FAIL.has(pred.status)) {
    if (Date.now() > deadline) throw new Error("Replicate image: timed out");
    await new Promise((r) => setTimeout(r, 1500));
    pred = await getPrediction(pred.id, apiKey);
  }
  if (pred.status !== "succeeded") {
    throw new Error(`Replicate image: ${pred.error ?? pred.status}`);
  }
  const url = firstOutputUrl(pred.output);
  if (!url) throw new Error("Replicate image: no output");
  return download(url, "image/png");
}

/** Video: start the prediction and return its id for the poller. */
export async function replicateStartVideo(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const pred = await createPrediction(model, prompt, apiKey);
  return pred.id;
}

export async function replicatePollVideo(
  predictionId: string,
  apiKey: string,
): Promise<VideoPollResult> {
  const pred = await getPrediction(predictionId, apiKey);
  if (pred.status === "starting" || pred.status === "processing") {
    return { status: "pending" };
  }
  if (pred.status !== "succeeded") {
    return { status: "error", error: pred.error ?? pred.status };
  }
  const url = firstOutputUrl(pred.output);
  if (!url) return { status: "error", error: "no output" };
  const media = await download(url, "video/mp4");
  return { status: "done", ...media };
}

export async function replicateValidateKey(apiKey: string): Promise<boolean> {
  const res = await fetch(`${BASE}/account`, { headers: headers(apiKey) });
  return res.ok;
}
