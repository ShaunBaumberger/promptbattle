import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clapperboard,
  CodeXml,
  Cpu,
  GraduationCap,
  Heart,
  Languages,
  Mic,
  MonitorPlay,
  PartyPopper,
  Plus,
  QrCode,
  Sparkles,
  Timer,
  Trophy,
  Vote,
  WandSparkles,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/types";
import { interpolate } from "@/lib/i18n/interpolate";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FREE_GAMES_PER_WINDOW, limitsFor } from "@/lib/tiers";
import { REPO_URL } from "@/lib/site";
import { donationsEnabled } from "@/lib/donate";
import { BrandMark } from "@/components/brand-mark";
import { DONATE_PATH, DonateCard } from "@/components/donate-card";

const LOGIN = "/admin/login";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl text-center font-semibold transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const lg = "px-6 py-3.5 text-base";
const sm = "px-4 py-2.5 text-sm";
const green = "bg-pb-green text-black hover:brightness-110";
const btnGreen = `${btnBase} ${lg} ${green}`;
const btnViolet = `${btnBase} ${sm} sm:text-base bg-pb-violet text-white hover:bg-pb-violet-deep`;
const btnGhost = `${btnBase} ${lg} bg-pb-surface-2 text-white hover:bg-pb-surface-2/80`;

function formatPrice(cents: number, currency: string, locale: string): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat(locale === "de" ? "de-CH" : locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(whole ? 0 : 2)}`;
  }
}

/** Public marketing homepage (shown at / when no join code is present). */
export function Landing({ dict, locale }: { dict: Dictionary; locale: string }) {
  const t = dict.home;
  const currency = "chf";
  const freePlayers = limitsFor("free").maxPlayers;
  // Arabic and Devanagari carry marks above/below the line; the tight
  // display leading would make them collide.
  const tall = locale === "ar" || locale === "hi";

  return (
    <div className="bg-pb-canvas relative flex min-h-full flex-1 flex-col overflow-x-clip text-white">
      {/* Atmosphere: violet → magenta mesh behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(60%_50%_at_15%_10%,rgba(123,92,255,0.45),transparent_70%),radial-gradient(45%_40%_at_90%_25%,rgba(236,72,189,0.35),transparent_70%),radial-gradient(40%_35%_at_50%_80%,rgba(53,237,126,0.10),transparent_70%)]"
      />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Prompt Battle">
          <BrandMark className="size-8 shrink-0" />
          <span className="font-display truncate text-sm font-extrabold tracking-tight whitespace-nowrap uppercase sm:text-lg">
            Prompt Battle
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-white/80 md:flex">
          <a href="#how" className="hover:text-white">
            {t.navHow}
          </a>
          <a href="#pricing" className="hover:text-white">
            {t.navPricing}
          </a>
          <a href="#faq" className="hover:text-white">
            {t.navFaq}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <Link
            href={LOGIN}
            className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-white/85 hover:text-white lg:inline-flex"
          >
            {t.hostLogin}
          </Link>
          <Link href={LOGIN} className={`${btnBase} ${sm} ${green} whitespace-nowrap`}>
            {t.startFree}
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* ---------- Hero ---------- */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-16 lg:pb-28">
          <div>
            <span className="bg-pb-magenta inline-flex rounded-full px-3 py-1 text-sm font-semibold">
              {t.heroEyebrow}
            </span>
            <h1 className={`font-display mt-5 text-[clamp(1.9rem,8.4vw,4.5rem)] ${tall ? "leading-[1.3]" : "leading-[0.98]"} font-black tracking-tight break-words hyphens-auto uppercase lg:text-[clamp(2.4rem,5.4vw,4.5rem)]`}>
              {t.heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
              {t.heroLead}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={LOGIN} className={btnGreen}>
                {t.heroCta}
                <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
              </Link>
              <a href="#how" className={btnGhost}>
                {t.navHow}
              </a>
            </div>

            <form
              action="/"
              method="get"
              className="bg-pb-surface/80 mt-8 flex max-w-lg flex-col gap-3 rounded-2xl p-4 ring-1 ring-white/10 backdrop-blur sm:flex-row sm:items-center"
            >
              <label htmlFor="join-code" className="flex items-center gap-2 text-sm font-semibold text-white/85 sm:w-36 sm:shrink-0">
                <QrCode className="size-4 shrink-0" aria-hidden />
                {t.joinLabel}
              </label>
              <div className="flex min-w-0 flex-1 gap-2">
                <input
                  id="join-code"
                  name="code"
                  required
                  maxLength={8}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={t.joinPlaceholder}
                  className="bg-pb-canvas focus:ring-pb-violet min-w-0 flex-1 rounded-xl px-4 py-2.5 font-mono text-base tracking-widest uppercase ring-1 ring-white/15 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-white/35 focus:ring-2"
                />
                <button type="submit" className={btnViolet}>
                  {dict.join.joinButton}
                </button>
              </div>
            </form>
          </div>

          <VersusMock dict={dict} />
        </section>

        {/* ---------- Marquee ---------- */}
        <div className="bg-pb-violet overflow-hidden py-5" aria-hidden>
          <div dir="ltr" className="animate-marquee flex w-max motion-reduce:animate-none">
            {[0, 1].map((half) => (
              <div key={half} className="flex shrink-0">
                {Array.from({ length: 4 }).map((_, i) => (
                  <span
                    key={i}
                    className="font-display flex items-center gap-6 pe-6 text-2xl font-black whitespace-nowrap uppercase sm:text-4xl"
                  >
                    {t.marquee}
                    <Sparkles className="text-pb-green size-6 sm:size-8" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- How it works ---------- */}
        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-6 px-5 py-20 lg:py-28">
          <SectionTitle>{t.howTitle}</SectionTitle>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: QrCode, title: t.step1Title, text: t.step1Text },
              { icon: Timer, title: t.step2Title, text: t.step2Text },
              { icon: WandSparkles, title: t.step3Title, text: t.step3Text },
              { icon: Vote, title: t.step4Title, text: t.step4Text },
            ].map((step, i) => (
              <li
                key={i}
                className="from-pb-magenta to-pb-violet-deep relative flex flex-col overflow-hidden rounded-[28px] bg-gradient-to-br p-6"
              >
                <span className="font-display absolute end-5 top-3 text-6xl font-black text-white/20">
                  {i + 1}
                </span>
                <step.icon className="size-8" aria-hidden />
                <h3 className="mt-10 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-white/85">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Use cases ---------- */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-20 lg:pb-28">
          <SectionTitle>{t.forTitle}</SectionTitle>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[
              { icon: PartyPopper, title: t.for1Title, text: t.for1Text, tint: "text-pb-green" },
              { icon: Sparkles, title: t.for2Title, text: t.for2Text, tint: "text-pb-magenta" },
              { icon: GraduationCap, title: t.for3Title, text: t.for3Text, tint: "text-pb-violet" },
              { icon: Mic, title: t.for4Title, text: t.for4Text, tint: "text-pb-green" },
            ].map((c, i) => (
              <div key={i} className="bg-pb-surface rounded-[40px] p-8 sm:p-10">
                <c.icon className={`size-10 ${c.tint}`} aria-hidden />
                <h3 className="font-display mt-6 text-xl font-bold tracking-tight break-words hyphens-auto sm:text-2xl">{c.title}</h3>
                <p className="mt-3 text-lg text-white/75">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section className="bg-black py-20 lg:py-28">
          <div className="mx-auto w-full max-w-6xl px-5">
            <SectionTitle>{t.featuresTitle}</SectionTitle>
            <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Cpu, title: t.f1Title, text: t.f1Text },
                { icon: Trophy, title: t.f2Title, text: t.f2Text },
                { icon: Clapperboard, title: t.f3Title, text: t.f3Text },
                { icon: Languages, title: t.f4Title, text: t.f4Text },
                { icon: MonitorPlay, title: t.f5Title, text: t.f5Text },
                { icon: CodeXml, title: t.f6Title, text: t.f6Text },
              ].map((f, i) => (
                <div key={i}>
                  <span className="bg-pb-surface-2 inline-flex size-12 items-center justify-center rounded-2xl">
                    <f.icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-white/70">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-6 px-5 py-20 lg:py-28">
          <SectionTitle>{t.pricingTitle}</SectionTitle>
          <p className="mt-4 text-center text-lg text-white/70">{t.pricingLead}</p>
          <div className="mx-auto mt-12 grid max-w-4xl items-stretch gap-4 lg:grid-cols-2">
            <PriceCard
              featured
              name={t.freeName}
              price={formatPrice(0, currency, locale)}
              per={t.freePer}
              features={[
                interpolate(t.upToPlayers, { n: freePlayers }),
                t.freeF2,
                t.freeF3,
                interpolate(t.freeF4, { n: FREE_GAMES_PER_WINDOW }),
              ]}
              cta={<Link href={LOGIN} className={`${btnGreen} w-full`}>{t.startFree}</Link>}
            />
            <PriceCard
              name={t.byoName}
              price={formatPrice(0, currency, locale)}
              per={t.byoPer}
              features={[t.byoF1, t.byoF2, t.byoF3, t.byoF4]}
              cta={<Link href={LOGIN} className={`${btnGhost} w-full`}>{t.byoCta}</Link>}
            />
          </div>
          {donationsEnabled() && (
            <div className="mx-auto mt-6 max-w-4xl lg:mt-12">
              <DonateCard title={dict.donate.title} text={dict.donate.text} cta={dict.donate.button} />
            </div>
          )}
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-6 px-5 pb-20 lg:pb-28">
          <SectionTitle>{t.faqTitle}</SectionTitle>
          <div className="mt-12 space-y-3">
            {[
              [t.q1, t.a1],
              [t.q2, t.a2],
              [t.q3, t.a3],
              [t.q4, t.a4],
              [t.q5, t.a5],
              [t.q6, t.a6],
              [t.q7, interpolate(t.a7, { n: FREE_GAMES_PER_WINDOW })],
            ].map(([q, a], i) => (
              <details key={i} className="group bg-pb-surface rounded-2xl p-6 open:ring-1 open:ring-white/15">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <Plus className="size-5 shrink-0 transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="mt-3 text-white/75">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- CTA band ---------- */}
        <section className="px-5 pb-20 lg:pb-28">
          <div className="from-pb-violet to-pb-violet-deep mx-auto max-w-6xl rounded-[40px] bg-gradient-to-br px-6 py-14 text-center sm:px-12">
            <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-none font-black tracking-tight uppercase">
              {t.ctaTitle}
            </h2>
            <p className="mt-4 text-lg text-white/85">{t.ctaText}</p>
            <Link href={LOGIN} className={`${btnGreen} mt-8`}>
              {t.heroCta}
              <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter dict={dict} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-center text-[clamp(1.6rem,6.4vw,3.25rem)] leading-[1.1] font-black tracking-tight break-words hyphens-auto uppercase">
      {children}
    </h2>
  );
}

function PriceCard({
  name,
  price,
  per,
  features,
  cta,
  featured = false,
  badge,
}: {
  name: string;
  price: string;
  per: string;
  features: string[];
  cta: React.ReactNode;
  featured?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-[32px] p-8 ${
        featured ? "from-pb-violet to-pb-violet-deep bg-gradient-to-br lg:-my-4 lg:py-12" : "bg-pb-surface"
      }`}
    >
      {badge && (
        <span className="bg-pb-magenta absolute -top-3 start-8 rounded-full px-3 py-1 text-sm font-semibold">
          {badge}
        </span>
      )}
      <h3 className="text-xl font-bold">{name}</h3>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-5xl font-black tracking-tight">{price}</span>
        <span className={featured ? "text-white/85" : "text-white/60"}>{per}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-3">
        {features.map((f, i) => (
          <li key={i} className="flex gap-3">
            <Check className={`mt-0.5 size-5 shrink-0 ${featured ? "text-white" : "text-pb-green"}`} aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  );
}

/** Decorative stage preview: two AI results side by side with live votes. */
function VersusMock({ dict }: { dict: Dictionary }) {
  const t = dict.home;
  return (
    <div className="bg-pb-surface relative rounded-[40px] p-4 shadow-[0_3px_68px_rgba(123,92,255,0.35)] ring-1 ring-white/10 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{dict.rounds.QF}</span>
        <span className="bg-pb-canvas flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm">
          <Timer className="text-pb-green size-4" />
          0:42
        </span>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-3 sm:gap-4">
        <MockResult
          name="Mia"
          prompt={t.mockPromptA}
          votes={58}
          ring="ring-pb-green"
          bar="bg-pb-green"
          art="bg-[radial-gradient(circle_at_70%_30%,#ffe08a_0_13%,transparent_14%),linear-gradient(180deg,#ff9a5a_0%,#ff5e7e_48%,#6b3cff_100%)]"
        />
        <MockResult
          name="Leo"
          prompt={t.mockPromptB}
          votes={42}
          ring="ring-pb-magenta"
          bar="bg-pb-magenta"
          art="bg-[radial-gradient(circle_at_28%_38%,#ffd27a_0_15%,transparent_16%),linear-gradient(180deg,#ffb347_0%,#ff7a3d_50%,#3a1c71_100%)]"
        />
        <span className="font-display bg-pb-violet ring-pb-surface absolute top-[30%] left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full text-lg font-black ring-[6px] sm:size-16 sm:text-xl">
          VS
        </span>
      </div>
    </div>
  );
}

function MockResult({
  name,
  prompt,
  votes,
  ring,
  bar,
  art,
}: {
  name: string;
  prompt: string;
  votes: number;
  ring: string;
  bar: string;
  art: string;
}) {
  return (
    <div>
      <div className={`relative aspect-square overflow-hidden rounded-3xl ring-4 ${ring} ${art}`}>
        {/* hills */}
        <div className="absolute -inset-x-6 bottom-[-30%] h-1/2 rounded-[50%] bg-[#24124f]/80" />
        {/* a bicycle, more or less */}
        <div className="absolute bottom-[16%] left-[22%] size-[24%] rounded-full border-[5px] border-black/75" />
        <div className="absolute bottom-[16%] left-[52%] size-[24%] rounded-full border-[5px] border-black/75" />
        <div className="absolute bottom-[34%] left-[36%] h-[5px] w-[28%] -rotate-12 rounded bg-black/75" />
        <div className="absolute bottom-[38%] left-[40%] size-[16%] rounded-[45%_55%_40%_60%] bg-white/90" />
      </div>
      <p className="mt-3 text-sm font-bold">{name}</p>
      <p className="mt-1 line-clamp-2 font-mono text-xs text-white/60">“{prompt}”</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="bg-pb-canvas h-2 flex-1 overflow-hidden rounded-full">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${votes}%` }} />
        </div>
        <span className="font-mono text-xs text-white/70">{votes}%</span>
      </div>
    </div>
  );
}

export function SiteFooter({ dict }: { dict: Dictionary }) {
  return (
    <footer className="bg-pb-canvas relative z-10 border-t border-white/10 px-5 pt-14 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <span className="font-display text-lg font-extrabold uppercase">Prompt Battle</span>
            </div>
            <p className="mt-3 text-white/65">{dict.home.footerTagline}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-white/75">
            <Link href="/legal/imprint" className="hover:text-white">
              {dict.legal.imprint}
            </Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">
              {dict.legal.sourceCode} (GitHub)
            </a>
            <Link href="/legal/privacy" className="hover:text-white">
              {dict.legal.privacy}
            </Link>
            <Link href={LOGIN} className="hover:text-white">
              {dict.home.hostLogin}
            </Link>
            <Link href="/legal/terms" className="hover:text-white">
              {dict.legal.terms}
            </Link>
            {donationsEnabled() && (
              <Link href={DONATE_PATH} className="inline-flex items-center gap-1.5 hover:text-white">
                <Heart className="text-pb-magenta size-3.5" aria-hidden />
                {dict.donate.button}
              </Link>
            )}
          </nav>
        </div>
        <p
          aria-hidden
          className="font-display text-center text-[clamp(1.75rem,7.2vw,6.5rem)] leading-none font-black tracking-tight whitespace-nowrap text-white/[0.07] uppercase select-none"
        >
          Prompt Battle
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-white/55">
          <span>
            © {new Date().getFullYear()} Prompt Battle · {dict.home.madeIn}
          </span>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
