import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";

// Veo 3 Fast: $0.10/sec at 720p. Each 8s video ≈ $0.80, so a video-task
// match (two videos) costs ~$1.60 in addition to the Nano Banana backup
// images (~$0.27). Identifier may need bumping when the model graduates
// from preview — the @google/genai SDK accepts any string here.
const MODEL = "veo-3.0-fast-generate-001";

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export interface VideoOptions {
  /** 4–8 seconds. Veo 3 Fast caps at 8. */
  durationSeconds?: number;
  /** "16:9" (landscape, stage projector) or "9:16" (portrait). */
  aspectRatio?: string;
  /** "720p" ($0.10/s) or "1080p" ($0.12/s). */
  resolution?: string;
}

/**
 * Kick off a Veo video generation. Returns the LRO name so a separate
 * poller can resume the operation across many short server-function
 * invocations (instead of one long-blocking call that risks hitting
 * Vercel's per-function timeout).
 */
export async function startVideoGeneration(
  prompt: string,
  opts: VideoOptions = {},
): Promise<{ operationName: string }> {
  if (!prompt) throw new Error("startVideoGeneration: empty prompt");
  const ai = client();
  const operation = await ai.models.generateVideos({
    model: MODEL,
    source: { prompt },
    config: {
      durationSeconds: opts.durationSeconds ?? 8,
      aspectRatio: opts.aspectRatio ?? "16:9",
      resolution: opts.resolution ?? "720p",
      numberOfVideos: 1,
    },
  });
  if (!operation.name) {
    throw new Error("Veo returned no operation name");
  }
  return { operationName: operation.name };
}

export type VideoPollResult =
  | { status: "pending" }
  | { status: "error"; error: string }
  | { status: "done"; bytes: Buffer; mimeType: string };

/**
 * Poll a previously-started Veo job exactly once. Returns:
 *   * `pending` — still rendering, poll again later
 *   * `done`    — render finished, bytes are downloaded and ready to upload
 *   * `error`   — Veo failed or was blocked by RAI safety policy
 *
 * Cheap (1–3s typical) so safe to call on a 10s interval until done.
 */
export async function pollVideoGeneration(
  operationName: string,
): Promise<VideoPollResult> {
  const ai = client();

  // ⚠️ The SDK calls `operation._fromAPIResponse(...)` on whatever we pass
  // in as `parameters.operation`. A plain object like `{ name }` doesn't
  // have that method and throws TypeError on every poll — videos stay
  // "pending" forever, swallowed by the client-side `.catch`. We MUST
  // construct a real GenerateVideosOperation instance so the prototype
  // method is reachable. Only the `name` field is used to build the
  // request URL; the rest of the fields are populated by the response.
  const handle = new GenerateVideosOperation();
  handle.name = operationName;
  const operation = await ai.operations.getVideosOperation({
    operation: handle,
  });

  if (!operation.done) return { status: "pending" };

  if (operation.error) {
    return {
      status: "error",
      error: JSON.stringify(operation.error).slice(0, 500),
    };
  }

  const filtered = operation.response?.raiMediaFilteredCount ?? 0;
  if (filtered > 0) {
    const reason =
      operation.response?.raiMediaFilteredReasons?.[0] ?? "RAI filter";
    return { status: "error", error: `Safety policy: ${reason}` };
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  const mimeType = video?.mimeType ?? "video/mp4";

  // Veo usually returns a URI to fetch, occasionally inline base64.
  if (video?.videoBytes) {
    return {
      status: "done",
      bytes: Buffer.from(video.videoBytes, "base64"),
      mimeType,
    };
  }
  const uri = video?.uri;
  if (!uri) {
    return { status: "error", error: "no bytes or URI in response" };
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY!;
  const downloadUrl = uri.includes("?")
    ? `${uri}&key=${apiKey}`
    : `${uri}?key=${apiKey}`;
  const fetched = await fetch(downloadUrl);
  if (!fetched.ok) {
    return {
      status: "error",
      error: `download failed HTTP ${fetched.status}`,
    };
  }
  const ab = await fetched.arrayBuffer();
  return { status: "done", bytes: Buffer.from(ab), mimeType };
}
