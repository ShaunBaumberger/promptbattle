import { createServiceRoleClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { LanguageSwitcher } from "@/components/language-switcher";
import { JoinFlow } from "./join/join-flow";
import { Landing } from "./home/landing";
import Link from "next/link";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { BrandMark } from "@/components/brand-mark";

export const metadata = { alternates: { canonical: "/" } };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const trimmed = code?.trim().toUpperCase();
  const { locale, dict } = await getServerDictionary();

  if (!trimmed) return <Landing dict={dict} locale={locale} />;

  const supabase = createServiceRoleClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, code, name, status")
    .eq("code", trimmed)
    .maybeSingle();

  if (!tournament) {
    return (
      <DarkShell>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <h1 className="font-display text-white text-2xl font-bold tracking-tight">
            {dict.landing.codeNotFoundTitle}
          </h1>
          <p className="text-white/60 max-w-sm text-base">
            {dict.landing.codeNotFoundText.split("{code}")[0]}
            <span className="text-white font-mono">{trimmed}</span>
            {dict.landing.codeNotFoundText.split("{code}")[1]}
          </p>
        </main>
      </DarkShell>
    );
  }

  if (tournament.status === "finished") {
    return (
      <DarkShell>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <h1 className="font-display text-white text-2xl font-bold tracking-tight">
            {dict.landing.finishedTitle}
          </h1>
          <p className="text-white/60 max-w-sm text-base">
            {interpolate(dict.landing.finishedText, { name: tournament.name })}
          </p>
        </main>
      </DarkShell>
    );
  }

  return (
    <DarkShell>
      <JoinFlow tournamentName={tournament.name} tournamentCode={tournament.code} />
    </DarkShell>
  );
}

/**
 * Dark, HIG-styled shell. Identical aesthetic to /play and /stage so the
 * player journey from QR scan → join → match never breaks visual continuity.
 * Hosts a language switcher in the top corner so players can pick their
 * language the moment they land (the choice persists via cookie).
 */
function DarkShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-hidden bg-background text-foreground">
      <BrandBackdrop />
      <Link href="/" className="absolute start-4 top-4 z-10 flex items-center gap-2" aria-label="Prompt Battle">
        <BrandMark className="size-7" />
        <span className="font-display hidden text-sm font-extrabold uppercase sm:inline">Prompt Battle</span>
      </Link>
      <div className="absolute end-4 top-4 z-10">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
