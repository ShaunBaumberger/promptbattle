/**
 * Locale registry + helpers. The app is localized via a cookie-driven
 * dictionary (see lib/i18n/context.tsx), NOT Next's [lang]-segment routing —
 * that would break the code-based /stage/[code] + QR join URLs. Players pick a
 * language on their phone; the choice persists in the `pb_locale` cookie.
 *
 * Adding a language: add an entry here, create lib/i18n/dictionaries/<code>.ts
 * implementing the Dictionary interface, and register it in dictionaries.ts.
 * TypeScript will flag any missing keys.
 */

export const LOCALE_COOKIE = "pb_locale";

export interface LocaleMeta {
  /** BCP-47 primary subtag used as the cookie value + <html lang>. */
  code: string;
  /** Language name in its own script (shown in the switcher). */
  native: string;
  /** English name (for docs / accessibility). */
  english: string;
  /** Text direction. Arabic is rtl; everything else ltr. */
  dir: "ltr" | "rtl";
}

export const LOCALES = [
  { code: "en", native: "English", english: "English", dir: "ltr" },
  { code: "de", native: "Deutsch", english: "German", dir: "ltr" },
  { code: "fr", native: "Français", english: "French", dir: "ltr" },
  { code: "it", native: "Italiano", english: "Italian", dir: "ltr" },
  { code: "es", native: "Español", english: "Spanish", dir: "ltr" },
  { code: "pt", native: "Português", english: "Portuguese", dir: "ltr" },
  { code: "zh", native: "中文", english: "Chinese", dir: "ltr" },
  { code: "ja", native: "日本語", english: "Japanese", dir: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl" },
] as const satisfies readonly LocaleMeta[];

export type Locale = (typeof LOCALES)[number]["code"];

/** Worldwide default when no cookie + no Accept-Language match. */
export const DEFAULT_LOCALE: Locale = "en";

const CODES = LOCALES.map((l) => l.code) as Locale[];

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (CODES as string[]).includes(value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}
