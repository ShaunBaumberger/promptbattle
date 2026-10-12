import { LEGAL_UPDATED, type LegalLang } from "@/lib/legal";

/** Rendered in the text's language, not the UI locale. */
export function LastUpdated({ lang }: { lang: LegalLang }) {
  const date = new Intl.DateTimeFormat(lang === "de" ? "de-CH" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(LEGAL_UPDATED));
  return (
    <p className="text-muted-foreground mt-10 text-sm">
      {lang === "de" ? `Stand: ${date}` : `Last updated: ${date}`}
    </p>
  );
}

/** Legal texts exist in German and English; everyone else reads English. */
export function legalLang(locale: string): LegalLang {
  return locale === "de" ? "de" : "en";
}
