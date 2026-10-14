import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for stored secrets (BYO AI provider keys). The data
 * key comes from SECRETS_ENCRYPTION_KEY — 32 random bytes, base64:
 *
 *   openssl rand -base64 32
 *
 * Losing/rotating that env var makes previously stored secrets
 * undecryptable — hosts simply re-enter their key (we never show stored
 * keys back, so nothing else breaks). Format: `v1.<iv>.<tag>.<ciphertext>`
 * (all base64), versioned for future migrations.
 */

function dataKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
    );
  }
  return buf;
}

/** True when the encryption env var is present and well-formed. */
export function encryptionConfigured(): boolean {
  try {
    dataKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Returns null on any failure (wrong key, tampered data, bad format). */
export function decryptSecret(stored: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = stored.split(".");
    if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      dataKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
