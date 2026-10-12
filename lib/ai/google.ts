import "server-only";

import { generateImage as legacyGenerateImage } from "@/lib/gemini";
import {
  startVideoGeneration as veoStart,
  pollVideoGeneration as veoPoll,
} from "@/lib/veo";
import type { GeneratedMedia, VideoPollResult } from "./types";

/**
 * Google provider. Current models (Nano Banana 2.1 / 2 Lite / Pro, Gemini
 * Omni Flash) run on the Interactions API:
 *   POST /v1beta/interactions                 create (sync, or background)
 *   GET  /v1beta/interactions/{id}            poll a background job
 * Generated media arrives as content items { type: "image"|"video",
 * data (base64) | uri, mime_type } inside the interaction's output steps.
 *
 * Older ids keep their original paths: image models that the Interactions
 * API rejects fall back to generateContent, and `veo-*` models use the
 * generateVideos long-running operation.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_SIZE = process.env.GEMINI_IMAGE_SIZE?.trim() || "1K";
/** Background interactions are stored as "interactions/<id>" op ids. */
const INTERACTION_PREFIX = "interactions/";

class GoogleHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call(path: string, apiKey: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {}
    throw new GoogleHttpError(res.status, `Google: ${msg}`);
  }
  return res.json();
}

interface MediaItem {
  type: string;
  data?: string;
  uri?: string;
  mime_type?: string;
}

/**
 * Find the last generated media item of a kind anywhere in an interaction.
 * Searching the whole tree keeps this working across the API's response
 * shapes (`outputs` in older SDK typings, `steps[].content` today).
 */
function findMedia(node: unknown, kind: "image" | "video"): MediaItem | null {
  let found: MediaItem | null = null;
  const visit = (n: unknown) => {
    if (Array.isArray(n)) {
      n.forEach(visit);
    } else if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>;
      if (obj.type === kind && (typeof obj.data === "string" || typeof obj.uri === "string")) {
        found = obj as unknown as MediaItem;
      }
      Object.values(obj).forEach(visit);
    }
  };
  visit(node);
  return found;
}

async function download(item: MediaItem, apiKey: string, fallbackMime: string): Promise<GeneratedMedia> {
  if (item.data) {
    return {
      bytes: Buffer.from(item.data, "base64"),
      mimeType: item.mime_type ?? fallbackMime,
    };
  }
  const res = await fetch(item.uri!, { headers: { "x-goog-api-key": apiKey } });
  if (!res.ok) throw new GoogleHttpError(res.status, `Google download: HTTP ${res.status}`);
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    mimeType: item.mime_type ?? res.headers.get("content-type") ?? fallbackMime,
  };
}

const isTransient = (err: unknown) =>
  !(err instanceof GoogleHttpError) || err.status === 429 || err.status >= 500;

export async function googleGenerateImage(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<GeneratedMedia> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const interaction = await call("interactions", apiKey, {
        method: "POST",
        body: JSON.stringify({
          model,
          input: prompt,
          response_format: { type: "image", image_size: IMAGE_SIZE },
        }),
      });
      const image = findMedia(interaction, "image");
      if (!image) throw new Error("Google returned no image (likely blocked by safety filters)");
      return await download(image, apiKey, "image/png");
    } catch (err) {
      // Models the Interactions API doesn't serve (older/custom ids) still
      // work through generateContent.
      if (err instanceof GoogleHttpError && (err.status === 400 || err.status === 404)) {
        return legacyGenerateImage(prompt, { model, apiKey });
      }
      lastErr = err;
      if (!isTransient(err)) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Google image generation failed");
}

/** Start a video job; returns an id for googlePollVideo. */
export async function googleStartVideo(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  if (model.startsWith("veo-")) {
    const { operationName } = await veoStart(prompt, {
      model,
      apiKey,
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
    });
    return operationName;
  }
  // Rendering takes longer than a serverless function may run, so the job
  // runs in the background and the client-driven poller collects it.
  const interaction = (await call("interactions", apiKey, {
    method: "POST",
    body: JSON.stringify({
      model,
      input: prompt,
      background: true,
      response_format: { type: "video", aspect_ratio: "16:9", resolution: "720p" },
    }),
  })) as { id?: string };
  if (!interaction.id) throw new Error("Google video: no interaction id returned");
  return `${INTERACTION_PREFIX}${interaction.id}`;
}

export async function googlePollVideo(id: string, apiKey: string): Promise<VideoPollResult> {
  if (!id.startsWith(INTERACTION_PREFIX)) return veoPoll(id, { apiKey });

  const interaction = (await call(
    `interactions/${encodeURIComponent(id.slice(INTERACTION_PREFIX.length))}`,
    apiKey,
  )) as { status?: string };

  if (interaction.status === "in_progress" || interaction.status === "queued") {
    return { status: "pending" };
  }
  if (interaction.status !== "completed") {
    return { status: "error", error: `Google video: ${interaction.status ?? "unknown status"}` };
  }
  const video = findMedia(interaction, "video");
  if (!video) return { status: "error", error: "Google video: no video in response (safety filter?)" };
  try {
    return { status: "done", ...(await download(video, apiKey, "video/mp4")) };
  } catch (err) {
    // A freshly finished file can briefly 404 before it's servable.
    if (err instanceof GoogleHttpError && err.status === 404) return { status: "pending" };
    return { status: "error", error: String(err) };
  }
}
