import "server-only";

import { GoogleGenAI } from "@google/genai";
import { generateImage as googleGenerateImage } from "@/lib/gemini";
import {
  startVideoGeneration as googleStartVideo,
  pollVideoGeneration as googlePollVideo,
} from "@/lib/veo";
import { isProvider, parseModelRef, type Provider } from "./models";
import {
  openaiGenerateImage,
  openaiPollVideo,
  openaiStartVideo,
  openaiValidateKey,
} from "./openai";
import {
  replicateGenerateImage,
  replicatePollVideo,
  replicateStartVideo,
  replicateValidateKey,
} from "./replicate";
import type { GeneratedMedia, VideoPollResult } from "./types";

export type { GeneratedMedia, VideoPollResult } from "./types";

/**
 * Provider dispatch. Every call takes an explicit API key — the caller
 * decides whether that's the platform key (free/paid plans) or the host's
 * own key (BYO). There is deliberately no implicit fallback here: a BYO
 * tournament missing a key must fail, never silently bill the platform.
 */

const PLATFORM_KEY_ENV: Record<Provider, string> = {
  google: "GOOGLE_GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  replicate: "REPLICATE_API_TOKEN",
};

/** Platform key for a provider, or null when the platform doesn't offer it. */
export function platformKey(provider: Provider): string | null {
  return process.env[PLATFORM_KEY_ENV[provider]]?.trim() || null;
}

/** Providers the platform can run on its own keys (for the model picker). */
export function platformProviders(): Provider[] {
  return (Object.keys(PLATFORM_KEY_ENV) as Provider[]).filter((p) => platformKey(p));
}

export async function generateImageByRef(
  ref: string,
  prompt: string,
  apiKey: string,
): Promise<GeneratedMedia> {
  const { provider, model } = parseModelRef(ref);
  switch (provider) {
    case "google":
      return googleGenerateImage(prompt, { model, apiKey });
    case "openai":
      return openaiGenerateImage(model, prompt, apiKey);
    case "replicate":
      return replicateGenerateImage(model, prompt, apiKey);
  }
}

/**
 * Start a video job. Returns an operation ref `<provider>:<job id>` that
 * is stored on the match row so the poller knows which API to ask.
 */
export async function startVideoByRef(
  ref: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const { provider, model } = parseModelRef(ref);
  switch (provider) {
    case "google": {
      const { operationName } = await googleStartVideo(prompt, {
        model,
        apiKey,
        durationSeconds: 8,
        aspectRatio: "16:9",
        resolution: "720p",
      });
      return `google:${operationName}`;
    }
    case "openai":
      return `openai:${await openaiStartVideo(model, prompt, apiKey)}`;
    case "replicate":
      return `replicate:${await replicateStartVideo(model, prompt, apiKey)}`;
  }
}

/**
 * Split an operation ref. Pre-multi-provider rows hold bare Google
 * operation names ("models/…/operations/…") — those map to Google.
 */
export function parseOpRef(opRef: string): { provider: Provider; id: string } {
  const idx = opRef.indexOf(":");
  if (idx > 0) {
    const maybe = opRef.slice(0, idx);
    if (isProvider(maybe)) return { provider: maybe, id: opRef.slice(idx + 1) };
  }
  return { provider: "google", id: opRef };
}

export async function pollVideoByOpRef(
  opRef: string,
  apiKey: string,
): Promise<VideoPollResult> {
  const { provider, id } = parseOpRef(opRef);
  switch (provider) {
    case "google":
      return googlePollVideo(id, { apiKey });
    case "openai":
      return openaiPollVideo(id, apiKey);
    case "replicate":
      return replicatePollVideo(id, apiKey);
  }
}

/** Live check that a key works — run before storing a BYO key. */
export async function validateProviderKey(
  provider: Provider,
  apiKey: string,
): Promise<boolean> {
  try {
    switch (provider) {
      case "google": {
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.list({ config: { pageSize: 1 } });
        return true;
      }
      case "openai":
        return await openaiValidateKey(apiKey);
      case "replicate":
        return await replicateValidateKey(apiKey);
    }
  } catch {
    return false;
  }
}
