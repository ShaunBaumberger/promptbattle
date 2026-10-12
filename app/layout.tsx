import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n/context";
import { localeDir } from "@/lib/i18n/config";
import { getServerLocale } from "@/lib/i18n/server";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "The live AI prompting game for team events, workshops and classrooms. Players battle on their phones to recreate images with AI, the room watches the reveal on the big screen and votes. Free for up to 8 players.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Prompt Battle — the live AI prompting game",
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "prompt battle",
    "AI game",
    "prompt engineering",
    "team event",
    "workshop",
    "AI training",
    "image generation",
    "classroom",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Prompt Battle — the live AI prompting game",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Prompt Battle — the live AI prompting game",
    description: DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider initialLocale={locale}>
          {children}
          <Toaster richColors position="top-center" />
        </I18nProvider>
      </body>
    </html>
  );
}
