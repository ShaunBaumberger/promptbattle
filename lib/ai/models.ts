/**
 * AI model registry — client-safe (no keys, no SDKs). Shared by the
 * settings UI, the tier/cost logic, and the server-side provider layer.
 *
 * A model is addressed by a "model ref": `<provider>:<model id>`, e.g.
 *   google:gemini-3-pro-image-preview
 *   openai:sora-2
 *   replicate:black-forest-labs/flux-1.1-pro
 *   replicate:owner/model:<version-hash>      (community models)
 * Refs are stored in tournaments.image_model / video_model. Legacy values
 * without a provider prefix are Google model ids (pre-multi-provider), and
 * retired model ids are mapped to their successors (RETIRED_MODELS).
 *
 * Two ways a tournament can use a model:
 *   * Platform keys (free + paid plans): only CATALOG models — each has a
 *     known price, so the cost caps stay meaningful. A host paying a flat
 *     fee must not be able to pick a model that costs the platform more
 *     than the fee.
 *   * Bring-your-own keys: ANY model id of a provider the host stored a
 *     key for — the host pays the provider directly. Replicate alone
 *     covers thousands of open and commercial models.
 */

export type Provider = "google" | "openai" | "replicate";
export type ModelKind = "image" | "video";

export const PROVIDERS: Provider[] = ["google", "openai", "replicate"];

export const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google (Nano Banana · Gemini Omni)",
  openai: "OpenAI (GPT Image)",
  replicate: "Replicate (FLUX, Veo, Kling, Seedance, …)",
};

/** What each provider can generate. OpenAI retired Sora and its Videos API in Sept 2026. */
export const PROVIDER_KINDS: Record<Provider, ModelKind[]> = {
  google: ["image", "video"],
  openai: ["image"],
  replicate: ["image", "video"],
};

export function providerSupports(provider: Provider, kind: ModelKind): boolean {
  return PROVIDER_KINDS[provider].includes(kind);
}

/** Where hosts get an API key for each provider (BYO card hint). */
export const PROVIDER_KEY_URLS: Record<Provider, string> = {
  google: "aistudio.google.com/apikey",
  openai: "platform.openai.com/api-keys",
  replicate: "replicate.com/account/api-tokens",
};

export interface CatalogModel {
  ref: string;
  kind: ModelKind;
  label: string;
  /** Platform cost per generated output, US cents (image or 8 s clip). */
  costCents: number;
}

/**
 * Curated models available on platform keys (paid plan). Prices are the
 * providers' list prices at the settings used here (1K images / OpenAI
 * quality "medium"; one video clip), rounded up. Replicate isn't listed:
 * its per-model prices vary too much to promise a flat fee — it's
 * available with the host's own key.
 */
export const CATALOG: CatalogModel[] = [
  { ref: "google:gemini-nano-banana-2.1", kind: "image", label: "Google Nano Banana 2.1", costCents: 4 },
  { ref: "google:gemini-3.1-flash-lite-image", kind: "image", label: "Google Nano Banana 2 Lite (fastest)", costCents: 4 },
  { ref: "google:gemini-3-pro-image", kind: "image", label: "Google Nano Banana Pro", costCents: 14 },
  { ref: "openai:gpt-image-2.5-flare", kind: "image", label: "OpenAI GPT Image 2.5 Flare", costCents: 6 },
  // ~$0.10 per second of 720p video; budgeted for clips up to 10 s.
  { ref: "google:gemini-omni-1.1-flash", kind: "video", label: "Google Gemini Omni Flash", costCents: 100 },
];

/** Model ids suggested in the BYO model field (any id is accepted). */
export const SUGGESTIONS: Record<Provider, Record<ModelKind, string[]>> = {
  google: {
    image: [
      "gemini-nano-banana-2.1",
      "gemini-3-pro-image",
      "gemini-3.1-flash-lite-image",
      "gemini-3.1-flash-image",
    ],
    video: ["gemini-omni-1.1-flash"],
  },
  openai: {
    image: ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-2"],
    video: [],
  },
  replicate: {
    image: [
      "black-forest-labs/flux-2-pro",
      "black-forest-labs/flux-schnell",
      "google/nano-banana-2",
      "bytedance/seedream-5-lite",
      "ideogram-ai/ideogram-v3-turbo",
    ],
    video: [
      "google/veo-3.1-fast",
      "kwaivgi/kling-v3-video",
      "bytedance/seedance-2.0-fast",
      "minimax/hailuo-2.3",
      "wan-video/wan-2.5-t2v-fast",
    ],
  },
};

/**
 * Defaults applied when a host stores their first key for a provider.
 * null = the provider can't generate that kind.
 */
export const PROVIDER_DEFAULTS: Record<Provider, Record<ModelKind, string | null>> = {
  google: { image: "google:gemini-nano-banana-2.1", video: "google:gemini-omni-1.1-flash" },
  openai: { image: "openai:gpt-image-2.5-flare", video: null },
  replicate: { image: "replicate:black-forest-labs/flux-2-pro", video: "replicate:google/veo-3.1-fast" },
};

/**
 * Retired model ids → their successors, so tournaments, env overrides and
 * old rows keep working after a provider shuts a model down. Per the
 * providers' deprecation pages (checked 2026-10-12).
 */
const RETIRED_MODELS: Record<string, string> = {
  "google:gemini-2.5-flash-image": "google:gemini-nano-banana-2.1",
  "google:gemini-2.5-flash-image-preview": "google:gemini-nano-banana-2.1",
  "google:gemini-3.1-flash-image-preview": "google:gemini-nano-banana-2.1",
  "google:gemini-3-pro-image-preview": "google:gemini-3-pro-image",
  "google:veo-2.0-generate-001": "google:gemini-omni-1.1-flash",
  "google:veo-3.0-generate-001": "google:gemini-omni-1.1-flash",
  "google:veo-3.0-fast-generate-001": "google:gemini-omni-1.1-flash",
  "google:veo-3.1-generate-preview": "google:gemini-omni-1.1-flash",
  "google:veo-3.1-fast-generate-preview": "google:gemini-omni-1.1-flash",
  "google:veo-3.1-lite-generate-preview": "google:gemini-omni-1.1-flash",
  "google:gemini-omni-flash-preview": "google:gemini-omni-1.1-flash",
  "openai:gpt-image-1": "openai:gpt-image-2.5-flare",
  "openai:gpt-image-1-mini": "openai:gpt-image-2.5-flare",
  "openai:gpt-image-1.5": "openai:gpt-image-2.5-flare",
  // Sora has no OpenAI successor — fall back to Google's video model.
  "openai:sora-2": "google:gemini-omni-1.1-flash",
  "openai:sora-2-pro": "google:gemini-omni-1.1-flash",
};

/** Conservative fallback for anything not in the catalog. */
const UNKNOWN_COST_CENTS: Record<ModelKind, number> = { image: 20, video: 160 };

const MODEL_ID_RE = /^[A-Za-z0-9._\-/:]{1,160}$/;

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as string[]).includes(value);
}

export interface ParsedModelRef {
  provider: Provider;
  model: string;
}

/** Parse a model ref; legacy prefix-less ids are treated as Google. */
export function parseModelRef(ref: string): ParsedModelRef {
  const idx = ref.indexOf(":");
  if (idx > 0) {
    const maybe = ref.slice(0, idx);
    if (isProvider(maybe)) return { provider: maybe, model: ref.slice(idx + 1) };
  }
  return { provider: "google", model: ref };
}

export function toModelRef(provider: Provider, model: string): string {
  return `${provider}:${model.trim()}`;
}

/** Normalize legacy ids into full refs and retired models into their successors. */
export function normalizeModelRef(ref: string): string {
  const { provider, model } = parseModelRef(ref.trim());
  const full = toModelRef(provider, model);
  return RETIRED_MODELS[full] ?? full;
}

export function isValidModelId(model: string): boolean {
  return MODEL_ID_RE.test(model.trim());
}

export function catalogEntry(ref: string): CatalogModel | undefined {
  const norm = normalizeModelRef(ref);
  return CATALOG.find((m) => m.ref === norm);
}

export function isCatalogModel(ref: string, kind: ModelKind): boolean {
  return catalogEntry(ref)?.kind === kind;
}

export function modelCostCents(ref: string, kind: ModelKind): number {
  return catalogEntry(ref)?.costCents ?? UNKNOWN_COST_CENTS[kind];
}

/** Human label for a ref: catalog label, else "provider · model id". */
export function modelLabel(ref: string): string {
  const entry = catalogEntry(ref);
  if (entry) return entry.label;
  const { provider, model } = parseModelRef(ref);
  return `${provider} · ${model}`;
}
