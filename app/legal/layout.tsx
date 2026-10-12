import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";
import { getOperator } from "@/lib/legal";
import { REPO_URL, SITE_NAME } from "@/lib/site";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getServerDictionary();
  const operator = getOperator();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
        ← {SITE_NAME}
      </Link>

      {locale !== "de" && locale !== "en" && (
        <p className="text-muted-foreground mt-4 text-sm">{dict.legal.onlyDeEn}</p>
      )}
      {!operator.configured && (
        <p className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Operator details are placeholders — set LEGAL_NAME, LEGAL_ADDRESS and LEGAL_EMAIL.
        </p>
      )}

      <article className="mt-6 text-[15px] leading-relaxed [&_a]:underline [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>

      <nav className="text-muted-foreground mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm">
        <Link href="/legal/imprint" className="hover:text-foreground">
          {dict.legal.imprint}
        </Link>
        <Link href="/legal/privacy" className="hover:text-foreground">
          {dict.legal.privacy}
        </Link>
        <Link href="/legal/terms" className="hover:text-foreground">
          {dict.legal.terms}
        </Link>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
          {dict.legal.sourceCode}
        </a>
      </nav>
    </div>
  );
}
