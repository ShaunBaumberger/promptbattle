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
 * without a provider prefix are Google model ids (pre-multi-provider).
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
  google: "Google (Gemini · Veo)",
  openai: "OpenAI (GPT Image · Sora)",
  replicate: "Replicate (FLUX, Kling, Seedance, …)",
};

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
 * quality "medium"; 8-second 720p clips), rounded up.
 */
export const CATALOG: CatalogModel[] = [
  { ref: "google:gemini-2.5-flash-image", kind: "image", label: "Google Gemini 2.5 Flash Image", costCents: 4 },
  { ref: "google:gemini-3-pro-image-preview", kind: "image", label: "Google Nano Banana Pro", costCents: 14 },
  { ref: "openai:gpt-image-1", kind: "image", label: "OpenAI GPT Image 1", costCents: 5 },
  { ref: "replicate:black-forest-labs/flux-1.1-pro", kind: "image", label: "FLUX 1.1 Pro (Replicate)", costCents: 4 },
  { ref: "replicate:black-forest-labs/flux-schnell", kind: "image", label: "FLUX Schnell (Replicate)", costCents: 1 },
  { ref: "google:veo-3.0-fast-generate-001", kind: "video", label: "Google Veo 3 Fast", costCents: 80 },
  { ref: "openai:sora-2", kind: "video", label: "OpenAI Sora 2", costCents: 80 },
];

/** Model ids suggested in the BYO model field (any id is accepted). */
export const SUGGESTIONS: Record<Provider, Record<ModelKind, string[]>> = {
  google: {
    image: ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
    video: ["veo-3.0-fast-generate-001", "veo-3.0-generate-001"],
  },
  openai: {
    image: ["gpt-image-1", "gpt-image-1.5", "gpt-image-2"],
    video: ["sora-2", "sora-2-pro"],
  },
  replicate: {
    image: ["black-forest-labs/flux-1.1-pro", "black-forest-labs/flux-schnell"],
    video: [
      "google/veo-3-fast",
      "kwaivgi/kling-v2.1",
      "bytedance/seedance-1-pro",
      "minimax/video-01",
    ],
  },
};

/** Defaults applied when a host stores their first key for a provider. */
export const PROVIDER_DEFAULTS: Record<Provider, Record<ModelKind, string>> = {
  google: { image: "google:gemini-3-pro-image-preview", video: "google:veo-3.0-fast-generate-001" },
  openai: { image: "openai:gpt-image-1", video: "openai:sora-2" },
  replicate: { image: "replicate:black-forest-labs/flux-1.1-pro", video: "replicate:google/veo-3-fast" },
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

/** Normalize legacy ids into full refs. */
export function normalizeModelRef(ref: string): string {
  const { provider, model } = parseModelRef(ref.trim());
  return toModelRef(provider, model);
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
