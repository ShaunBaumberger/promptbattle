"use server";

import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";
import { getServerDictionary } from "@/lib/i18n/server";
import { encryptSecret, encryptionConfigured } from "@/lib/crypto";

export type ByoKeyActionState = { error?: string; ok?: boolean };

/**
 * Owner-only, setup-only guard shared by save/remove. Returns the
 * localized error or null when the caller may proceed.
 */
async function guard(
  tournamentId: string,
): Promise<{ error?: string } | null> {
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
  // Key changes are locked once live — generation mid-game must not
  // switch billing accounts (and Veo polls are key-scoped).
  if (tournament.status !== "setup") {
    return { error: dict.admin.err.upgradeSetupOnly };
  }
  return null;
}

/**
 * Store (encrypted) a host's own Gemini key for this tournament. The key
 * is validated live against the Gemini API before saving, so typos fail
 * here — not silently during the event. Once saved it is never displayed
 * again; the tournaments.byo_key flag is the only public trace.
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

  const apiKey = String(formData.get("api_key") ?? "").trim();
  // Loose sanity check only — the live call below is the real validation.
  if (apiKey.length < 20 || /\s/.test(apiKey)) {
    return { error: dict.admin.err.byoInvalidKey };
  }

  // Live validation: cheapest authenticated call there is. A wrong or
  // disabled key throws here instead of during the reveal of match 1.
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.list({ config: { pageSize: 1 } });
  } catch {
    return { error: dict.admin.err.byoInvalidKey };
  }

  const supabase = createServiceRoleClient();
  const { error: secretErr } = await supabase.from("tournament_secrets").upsert({
    tournament_id: tournamentId,
    byo_gemini_key_encrypted: encryptSecret(apiKey),
    updated_at: new Date().toISOString(),
  });
  if (secretErr) return { error: secretErr.message };

  const { error: flagErr } = await supabase
    .from("tournaments")
    .update({ byo_key: true })
    .eq("id", tournamentId);
  if (flagErr) return { error: flagErr.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}

/** Remove the stored key; the tournament falls back to its paid plan. */
export async function removeByoKeyAction(
  tournamentId: string,
  _prev: ByoKeyActionState,
  _formData: FormData,
): Promise<ByoKeyActionState> {
  const guardErr = await guard(tournamentId);
  if (guardErr) return guardErr;

  const supabase = createServiceRoleClient();
  await supabase
    .from("tournament_secrets")
    .delete()
    .eq("tournament_id", tournamentId);
  const { error } = await supabase
    .from("tournaments")
    .update({ byo_key: false })
    .eq("id", tournamentId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/${tournamentId}`);
  return { ok: true };
}
