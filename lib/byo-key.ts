import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";

/**
 * Fetch + decrypt a tournament's BYO Gemini key. Null when no key is
 * stored or it can't be decrypted (e.g. SECRETS_ENCRYPTION_KEY rotated).
 * Callers must treat null on a byo_key=true tournament as "do not
 * generate" — falling back to the platform key would silently bill the
 * platform for a tournament that promised zero cost.
 */
export async function getByoGeminiKey(
  tournamentId: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("tournament_secrets")
    .select("byo_gemini_key_encrypted")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const encrypted = data?.byo_gemini_key_encrypted as string | null | undefined;
  if (!encrypted) return null;
  return decryptSecret(encrypted);
}
