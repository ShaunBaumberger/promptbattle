import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Heart } from "lucide-react";
import { getServerDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { donateProviderName, donateUrl } from "@/lib/donate";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "../home/landing";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getServerDictionary();
  return {
    title: dict.donate.title,
    description: dict.donate.text,
    alternates: { canonical: "/donate" },
  };
}

/**
 * Public donation page (promptbattle.io/donate). Explains where the money
 * goes, then hands off to the hosted donation page in DONATE_URL — card
 * data never touches this app.
 */
export default async function DonatePage() {
  const url = donateUrl();
  if (!url) notFound();
  const { dict } = await getServerDictionary();
  const t = dict.donate;

  return (
    <div className="bg-pb-canvas relative isolate flex min-h-full flex-1 flex-col text-white">
      <BrandBackdrop />
      <header className="mx-auto flex w-full max-w-xl items-center px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Prompt Battle">
          <BrandMark className="size-8" />
          <span className="font-display text-sm font-extrabold uppercase sm:text-lg">Prompt Battle</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 pt-6 pb-20">
        <div className="bg-pb-surface rounded-[32px] p-7 ring-1 ring-white/10 sm:p-10">
          <span className="bg-pb-magenta/15 text-pb-magenta flex size-14 items-center justify-center rounded-2xl">
            <Heart className="size-7" aria-hidden />
          </span>
          <h1 className="font-display mt-6 text-[clamp(1.6rem,6vw,2.4rem)] leading-[1.1] font-black tracking-tight uppercase">
            {t.title}
          </h1>
          <p className="mt-4 text-lg text-white/75">{t.text}</p>

          <h2 className="mt-8 font-semibold">{t.usesTitle}</h2>
          <ul className="mt-3 space-y-2.5">
            {[t.use1, t.use2, t.use3].map((u) => (
              <li key={u} className="flex gap-3">
                <Check className="text-pb-green mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="text-white/85">{u}</span>
              </li>
            ))}
          </ul>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="bg-pb-magenta mt-9 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white transition-transform hover:brightness-110 active:scale-[0.98]"
          >
            <Heart className="size-5" aria-hidden />
            {t.cta}
          </a>
          <p className="mt-4 text-center text-sm text-white/55">
            {interpolate(t.note, { provider: donateProviderName() ?? "" })}
          </p>
        </div>
      </main>

      <SiteFooter dict={dict} />
    </div>
  );
}
