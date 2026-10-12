"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { getByoProviders } from "@/lib/byo-key";
import { platformKey } from "@/lib/ai";
import {
  PROVIDER_LABELS,
  isCatalogModel,
  isValidModelId,
  normalizeModelRef,
  parseModelRef,
  type ModelKind,
} from "@/lib/ai/models";
import { effectivePlan, type Plan } from "@/lib/tiers";

/**
 * Save the image/video model for a tournament (setup phase, owner only).
 *   * free plan        → fixed model, nothing to choose
 *   * paid plan        → catalog models on providers the platform offers
 *                        (known prices keep the flat fee profitable)
 *   * own keys (BYO)   → any model id of a provider the host has a key for
 */
export async function updateModelsAction(
  tournamentId: string,
  imageRef: string,
  videoRef: string,
): Promise<{ ok: boolean; error?: string }> {
  const { dict } = await getServerDictionary();
  const user = await getUser();
  if (!user) return { ok: false, error: dict.admin.err.tournamentNotFound };

  const supabase = createServiceRoleClient();
  const { data: t } = await supabase
    .from("tournaments")
    .select("owner_id, status, plan, byo_key")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t || t.owner_id !== user.id) {
    return { ok: false, error: dict.admin.err.tournamentNotFound };
  }
  if (t.status !== "setup") {
    return { ok: false, error: dict.admin.err.upgradeSetupOnly };
  }

  const byo = t.byo_key === true;
  const plan = effectivePlan((t.plan as Plan) ?? "free", byo);
  if (plan === "free") return { ok: false, error: dict.admin.err.modelNotAllowed };

  const byoProviders = byo ? await getByoProviders(tournamentId) : [];

  const check = (ref: string, kind: ModelKind): string | null => {
    const norm = normalizeModelRef(ref);
    const { provider, model } = parseModelRef(norm);
    if (!isValidModelId(model)) return dict.admin.err.invalidModelId;
    if (byo) {
      if (!byoProviders.includes(provider)) {
        return interpolate(dict.admin.err.providerKeyMissing, {
          provider: PROVIDER_LABELS[provider],
        });
      }
      return null;
    }
    if (!isCatalogModel(norm, kind)) return dict.admin.err.modelNotAllowed;
    if (!platformKey(provider)) {
      return interpolate(dict.admin.err.platformProviderUnavailable, {
        provider: PROVIDER_LABELS[provider],
      });
    }
    return null;
  };

  const imgErr = check(imageRef, "image");
  if (imgErr) return { ok: false, error: imgErr };
  const vidErr = check(videoRef, "video");
  if (vidErr) return { ok: false, error: vidErr };

  const { error } = await supabase
    .from("tournaments")
    .update({
      image_model: normalizeModelRef(imageRef),
      video_model: normalizeModelRef(videoRef),
    })
    .eq("id", tournamentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}
