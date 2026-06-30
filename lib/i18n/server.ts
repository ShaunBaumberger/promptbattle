import "server-only";

import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from "./config";
import { getDictionary } from "./dictionaries";

/**
 * Resolve the active locale for server components / server actions:
 *   1. the `pb_locale` cookie (what the user explicitly picked), else
 *   2. the first Accept-Language subtag we support (auto-detect), else
 *   3. the worldwide default.
 */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get("accept-language");
  if (accept) {
    for (const part of accept.split(",")) {
      const primary = part.split(";")[0]?.split("-")[0]?.trim().toLowerCase();
      if (isLocale(primary)) return primary;
    }
  }
  return DEFAULT_LOCALE;
}

/** Locale + its dictionary, for use in server components and server actions. */
export async function getServerDictionary() {
  const locale = await getServerLocale();
  return { locale, dict: getDictionary(locale) };
}
