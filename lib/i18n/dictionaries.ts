import { DEFAULT_LOCALE, type Locale } from "./config";
import type { Dictionary } from "./types";

import { en } from "./dictionaries/en";
import { de } from "./dictionaries/de";
import { fr } from "./dictionaries/fr";
import { it } from "./dictionaries/it";
import { es } from "./dictionaries/es";
import { pt } from "./dictionaries/pt";
import { zh } from "./dictionaries/zh";
import { ja } from "./dictionaries/ja";
import { hi } from "./dictionaries/hi";
import { ar } from "./dictionaries/ar";

export type { Dictionary } from "./types";

export const dictionaries: Record<Locale, Dictionary> = {
  en,
  de,
  fr,
  it,
  es,
  pt,
  zh,
  ja,
  hi,
  ar,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
