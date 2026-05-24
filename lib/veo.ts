import { GoogleGenAI } from "@google/genai";

// Veo 3 Fast: $0.10/sec at 720p. Each 8s video ≈ $0.80, so a final round
// with two videos costs ~$1.60 in addition to the Nano Banana backup
// images (~$0.08). Identifier may need bumping when the model graduates
// from preview — the @google/genai SDK accepts any string here.
const MODEL = "veo-3.0-fast-generate-001";

// Polling cadence + overall timeout for the long-running operation.
// Veo typically returns in 60–120s; we cap at 4 minutes so a stuck job
// doesn't hold a generating match indefinitely.
const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS = 240_000;

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export interface GeneratedVideoAsset {
  bytes: Buffer;
  mimeType: string;
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
 * Generate a video with Veo 3 Fast. Returns the raw bytes for the caller
 * to upload to Supabase Storage. Resolves once the long-running operation
 * is done and the video has been downloaded from Google's file store.
 *
 * Throws if the operation errors, gets filtered by Veo's safety policy,
 * or doesn't complete within POLL_TIMEOUT_MS.
 */
export async function generateVideo(
  prompt: string,
  opts: VideoOptions = {},
): Promise<GeneratedVideoAsset> {
  const ai = client();

  // Kick off the long-running operation.
  let operation = await ai.models.generateVideos({
    model: MODEL,
    source: { prompt },
    config: {
      durationSeconds: opts.durationSeconds ?? 8,
      aspectRatio: opts.aspectRatio ?? "16:9",
      resolution: opts.resolution ?? "720p",
      numberOfVideos: 1,
    },
  });

  // Poll until done. Veo returns done=true when the asset is ready.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!operation.done) {
    if (Date.now() > deadline) {
      throw new Error(
        `Veo timeout after ${POLL_TIMEOUT_MS / 1000}s (operation=${operation.name ?? "?"})`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.error) {
    throw new Error(
      `Veo error: ${JSON.stringify(operation.error).slice(0, 500)}`,
    );
  }

  const filtered = operation.response?.raiMediaFilteredCount ?? 0;
  if (filtered > 0) {
    const reason =
      operation.response?.raiMediaFilteredReasons?.[0] ?? "RAI filter";
    throw new Error(`Veo blocked by safety policy: ${reason}`);
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  const uri = video?.uri;
  const mimeType = video?.mimeType ?? "video/mp4";

  // The SDK can hand back either inline base64 bytes or a fetch-by-URI
  // pointer. Veo returns the URI form; we need to download with the
  // API key appended.
  if (video?.videoBytes) {
    return { bytes: Buffer.from(video.videoBytes, "base64"), mimeType };
  }
  if (!uri) throw new Error("Veo response had neither bytes nor URI");

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY!;
  const downloadUrl = uri.includes("?")
    ? `${uri}&key=${apiKey}`
    : `${uri}?key=${apiKey}`;
  const fetched = await fetch(downloadUrl);
  if (!fetched.ok) {
    throw new Error(
      `Veo file download failed (HTTP ${fetched.status} ${fetched.statusText})`,
    );
  }
  const ab = await fetched.arrayBuffer();
  return { bytes: Buffer.from(ab), mimeType };
}
