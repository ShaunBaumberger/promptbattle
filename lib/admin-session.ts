const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const ADMIN_COOKIE = "pb_admin_session";

function getSecret(): string {
  const secret = process.env.HOST_PASSWORD;
  if (!secret) throw new Error("HOST_PASSWORD env var is not set");
  return secret;
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `admin:${expiresAt}`;
  const sig = await hmacSha256Hex(getSecret(), payload);
  const b64 = btoa(payload).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  let payload: string;
  try {
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
    payload = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return false;
  }
  const [prefix, expiresAtStr] = payload.split(":");
  if (prefix !== "admin") return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacSha256Hex(getSecret(), payload);
  return constantTimeEqual(sig, expected);
}

export function verifyPassword(submitted: string): boolean {
  const expected = process.env.HOST_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(submitted, expected);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
