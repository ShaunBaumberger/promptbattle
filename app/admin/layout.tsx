import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Heart } from "lucide-react";
import { getUser } from "@/lib/supabase/auth";
import { getServerDictionary } from "@/lib/i18n/server";
import { donationsEnabled } from "@/lib/donate";
import { DONATE_PATH } from "@/components/donate-card";
import { FeedbackDialog } from "./feedback-dialog";

/** Host area chrome: brand bar over the indigo canvas. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  const { dict } = await getServerDictionary();
  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col">
      <BrandBackdrop />
      <div className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Prompt Battle">
            <BrandMark className="size-7" />
            <span className="font-display text-sm font-extrabold whitespace-nowrap uppercase">Prompt Battle</span>
            <span className="bg-pb-violet/20 text-pb-violet-soft rounded-full px-2 py-0.5 text-xs font-semibold">
              Host
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {user && donationsEnabled() && (
              <Link
                href={DONATE_PATH}
                className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-white/75 hover:bg-white/5 hover:text-white sm:inline-flex"
              >
                <Heart className="text-pb-magenta size-4" aria-hidden />
                {dict.donate.button}
              </Link>
            )}
            {user && <FeedbackDialog />}
            <LanguageSwitcher />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
