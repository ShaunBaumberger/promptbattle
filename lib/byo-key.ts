import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { isProvider, type Provider } from "@/lib/ai/models";

export type ByoKeys = Partial<Record<Provider, string>>;

/**
 * Fetch + decrypt every BYO key stored for a tournament, by provider.
 * Keys that fail to decrypt (e.g. SECRETS_ENCRYPTION_KEY rotated) are
 * omitted — callers treat a missing key on a BYO tournament as "do not
 * generate", never as "use the platform key".
 */
export async function getByoKeys(tournamentId: string): Promise<ByoKeys> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("tournament_secrets")
    .select("byo_keys")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const stored = (data?.byo_keys ?? {}) as Record<string, unknown>;
  const keys: ByoKeys = {};
  for (const [provider, encrypted] of Object.entries(stored)) {
    if (!isProvider(provider) || typeof encrypted !== "string") continue;
    const plain = decryptSecret(encrypted);
    if (plain) keys[provider] = plain;
  }
  return keys;
}

/** Providers with a stored key (no decryption — for UI display). */
export async function getByoProviders(tournamentId: string): Promise<Provider[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("tournament_secrets")
    .select("byo_keys")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return Object.keys((data?.byo_keys ?? {}) as object).filter(isProvider);
}
