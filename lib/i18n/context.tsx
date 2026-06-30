"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, DEFAULT_LOCALE, type Locale } from "./config";
import { dictionaries } from "./dictionaries";
import type { Dictionary } from "./types";

interface I18nValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Wraps the app (in the root layout). All locale dictionaries are bundled, so
 * switching language is instant (no network, no reload) for client-rendered
 * text. Switching also writes the cookie and calls router.refresh() so
 * server-rendered text (the landing page, join errors) re-renders in the new
 * language and <html lang>/dir update on the next server pass.
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dict: dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE],
      setLocale,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the active dictionary + locale controls. Client components only. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

export { interpolate } from "./interpolate";
