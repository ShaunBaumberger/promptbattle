"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";
import { getServerDictionary } from "@/lib/i18n/server";
import { encryptSecret, encryptionConfigured } from "@/lib/crypto";
import { validateProviderKey } from "@/lib/ai";
import {
  PROVIDER_DEFAULTS,
  isProvider,
  parseModelRef,
  type Provider,
} from "@/lib/ai/models";

export type ByoKeyActionState = { error?: string; ok?: boolean };

/**
 * Owner-only, setup-only guard shared by save/remove. Returns a localized
 * error or null when the caller may proceed.
 */
async function guard(tournamentId: string): Promise<{ error?: string } | null> {
  const { dict } = await getServerDictionary();
  const user = await getUser();
  if (!user) return { error: dict.admin.err.tournamentNotFound };

  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, owner_id, status")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament || tournament.owner_id !== user.id) {
    return { error: dict.admin.err.tournamentNotFound };
  }
  // Keys are locked once live — billing must not switch accounts mid-game
  // (and video polls are scoped to the key that started the job).
  if (tournament.status !== "setup") {
    return { error: dict.admin.err.upgradeSetupOnly };
  }
  return null;
}

async function readStoredKeys(tournamentId: string): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("tournament_secrets")
    .select("byo_keys")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return ((data?.byo_keys ?? {}) as Record<string, string>) ?? {};
}

/**
 * Store (encrypted) a host's own API key for one provider. The key is
 * validated live before saving, so typos fail here — not during match 1.
 * Never displayed again; only "a key is stored for <provider>" is shown.
 *
 * If the tournament's current model choices run on a provider the host
 * has no key for, they're switched to this provider's defaults so the
 * tournament is immediately startable.
 */
export async function setByoKeyAction(
  tournamentId: string,
  _prev: ByoKeyActionState,
  formData: FormData,
): Promise<ByoKeyActionState> {
  const { dict } = await getServerDictionary();
  const guardErr = await guard(tournamentId);
  if (guardErr) return guardErr;

  if (!encryptionConfigured()) {
    return { error: dict.admin.err.byoNotConfigured };
  }

  const provider = String(formData.get("provider") ?? "");
  if (!isProvider(provider)) return { error: dict.admin.err.byoInvalidKey };

  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (apiKey.length < 20 || /\s/.test(apiKey)) {
    return { error: dict.admin.err.byoInvalidKey };
  }
  if (!(await validateProviderKey(provider, apiKey))) {
    return { error: dict.admin.err.byoInvalidKey };
  }

  const stored = await readStoredKeys(tournamentId);
  stored[provider] = encryptSecret(apiKey);

  const supabase = createServiceRoleClient();
  const { error: secretErr } = await supabase.from("tournament_secrets").upsert({
    tournament_id: tournamentId,
    byo_keys: stored,
    updated_at: new Date().toISOString(),
  });
  if (secretErr) return { error: secretErr.message };

  // Point models at providers the host can actually run.
  const { data: t } = await supabase
    .from("tournaments")
    .select("image_model, video_model")
    .eq("id", tournamentId)
    .maybeSingle();
  const keyed = new Set(Object.keys(stored));
  const usable = (ref: string | null) =>
    !!ref && keyed.has(parseModelRef(ref).provider);

  const update: Record<string, unknown> = { byo_key: true };
  if (!usable((t?.image_model as string | null) ?? null)) {
    update.image_model = PROVIDER_DEFAULTS[provider].image;
  }
  if (!usable((t?.video_model as string | null) ?? null)) {
    update.video_model = PROVIDER_DEFAULTS[provider].video;
  }

  const { error: flagErr } = await supabase
    .from("tournaments")
    .update(update)
    .eq("id", tournamentId);
  if (flagErr) return { error: flagErr.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/**
 * Remove one provider's key. When no keys remain, the tournament leaves
 * BYO mode and its model choices reset to the plan defaults.
 */
export async function removeByoKeyAction(
  tournamentId: string,
  provider: Provider,
  _prev: ByoKeyActionState,
  _formData: FormData,
): Promise<ByoKeyActionState> {
  const guardErr = await guard(tournamentId);
  if (guardErr) return guardErr;
  // Bound args arrive from the client — never trust them.
  if (!isProvider(provider)) return { error: "Invalid provider." };

  const stored = await readStoredKeys(tournamentId);
  delete stored[provider];
  const remaining = Object.keys(stored).length;

  const supabase = createServiceRoleClient();
  if (remaining > 0) {
    await supabase
      .from("tournament_secrets")
      .update({ byo_keys: stored, updated_at: new Date().toISOString() })
      .eq("tournament_id", tournamentId);
  } else {
    await supabase.from("tournament_secrets").delete().eq("tournament_id", tournamentId);
  }

  let update: Record<string, unknown>;
  if (remaining === 0) {
    update = { byo_key: false, image_model: null, video_model: null };
  } else {
    // Re-point any model that ran on the removed provider to a provider
    // that still has a key.
    const fallback = Object.keys(stored).find(isProvider)!;
    const { data: t } = await supabase
      .from("tournaments")
      .select("image_model, video_model")
      .eq("id", tournamentId)
      .maybeSingle();
    const onRemoved = (ref: string | null) =>
      !!ref && parseModelRef(ref).provider === provider;
    update = { byo_key: true };
    if (onRemoved((t?.image_model as string | null) ?? null)) {
      update.image_model = PROVIDER_DEFAULTS[fallback].image;
    }
    if (onRemoved((t?.video_model as string | null) ?? null)) {
      update.video_model = PROVIDER_DEFAULTS[fallback].video;
    }
  }

  const { error } = await supabase
    .from("tournaments")
    .update(update)
    .eq("id", tournamentId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}
