"use client";

import { Globe } from "lucide-react";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";

/**
 * Compact language picker. Uses a native <select> so phones render their
 * built-in wheel/dropdown — the most reliable, accessible control on mobile.
 * The globe icon sits behind a transparent select that captures the taps.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, dict } = useI18n();
  const current = LOCALES.find((l) => l.code === locale);

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-white/80 backdrop-blur ${className}`}
    >
      <Globe className="size-4 shrink-0" aria-hidden />
      <span className="text-sm font-medium">{current?.native ?? locale}</span>
      <select
        aria-label={dict.lang.switchLabel}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </div>
  );
}
