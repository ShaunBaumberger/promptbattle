import { GoogleGenAI, Modality } from "@google/genai";

// Image model + size are env-configurable so self-hosters can trade cost
// for quality without editing code (bring-your-own-key + bring-your-own-
// model). Defaults match what we run in production: Nano Banana Pro —
// Google's higher-fidelity model (~$0.134 per 1K image, noticeably better
// prompt adherence than gemini-2.5-flash-image at $0.039, ~15–25s slower).
// See .env.local.example for the menu of supported models and pricing.
const MODEL =
  process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3-pro-image-preview";
const IMAGE_SIZE = process.env.GEMINI_IMAGE_SIZE?.trim() || "1K"; // "1K" | "2K" | "4K"

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Generate one image from a text prompt. Retries up to `maxRetries + 1` total
 * attempts on transient failures (network, 5xx, missing image part). Throws
 * the final error if all attempts fail.
 */
export async function generateImage(
  prompt: string,
  { maxRetries = 2, signal }: { maxRetries?: number; signal?: AbortSignal } = {},
): Promise<GeneratedImage> {
  const ai = client();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          // Gemini image models return text + inline image parts; both
          // modalities must be requested or the response comes back empty.
          responseModalities: [Modality.IMAGE, Modality.TEXT],
          imageConfig: { imageSize: IMAGE_SIZE },
        },
      });

      if (signal?.aborted) throw new Error("aborted");

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData?.data);
      const data = imagePart?.inlineData?.data;
      const mimeType = imagePart?.inlineData?.mimeType ?? "image/png";

      if (!data) {
        // Surface enough context to debug safety blocks, model misuse, etc.
        const diag = {
          finishReason: candidate?.finishReason,
          safetyRatings: candidate?.safetyRatings,
          partKinds: parts.map((p) =>
            p.inlineData ? "inlineData" : p.text ? "text" : "other",
          ),
          promptFeedback: response.promptFeedback,
        };
        console.error("Gemini returned no image data:", JSON.stringify(diag));
        throw new Error(
          `Gemini returned no image data (finishReason=${candidate?.finishReason ?? "unknown"})`,
        );
      }

      return { bytes: Buffer.from(data, "base64"), mimeType };
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Image generation failed after retries");
}
