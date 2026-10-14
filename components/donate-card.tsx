import Link from "next/link";
import { Heart } from "lucide-react";

export const DONATE_PATH = "/donate";

/** Small "support us" card linking to /donate. Render only when donations are enabled. */
export function DonateCard({ title, text, cta }: { title: string; text: string; cta: string }) {
  return (
    <div className="bg-pb-surface flex flex-col gap-4 rounded-2xl p-5 ring-1 ring-white/10 sm:flex-row sm:items-center sm:gap-5">
      <span className="bg-pb-magenta/15 text-pb-magenta flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Heart className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-bold">{title}</h2>
        <p className="mt-1 text-sm text-white/70">{text}</p>
      </div>
      <Link
        href={DONATE_PATH}
        className="bg-pb-magenta inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:brightness-110 active:scale-[0.98]"
      >
        <Heart className="size-4" aria-hidden />
        {cta}
      </Link>
    </div>
  );
}
