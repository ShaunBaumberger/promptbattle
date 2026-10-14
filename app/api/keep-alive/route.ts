import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Daily keep-alive, called by the Vercel cron in vercel.json.
 *
 * Supabase pauses free-plan projects after a week without activity — a
 * quiet week between events would take the site down. One tiny query a
 * day counts as activity. When CRON_SECRET is set, Vercel sends it as a
 * bearer token and every other caller is turned away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const { error } = await createServiceRoleClient()
    .from("tournaments")
    .select("id", { count: "exact", head: true });
  if (error) {
    console.error("[keep-alive] Supabase query failed:", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, at: new Date().toISOString() });
}
