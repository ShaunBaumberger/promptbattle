import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

/**
 * OAuth + magic-link callback. Supabase redirects here with a `code` after
 * the user authenticates (Google/GitHub) or clicks an email link. We
 * exchange it for a session cookie and continue to the admin dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Remember the UI language so future auth emails arrive in it.
      const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
      if (isLocale(locale)) await supabase.auth.updateUser({ data: { locale } });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/login?error=auth`);
}

/** Only same-site paths: "@evil.com" or "//evil.com" would leave the site. */
function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}
