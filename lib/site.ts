/**
 * Public identity of this deployment. Self-hosters override the URL via
 * NEXT_PUBLIC_SITE_URL so canonical links, the sitemap and social cards
 * point at their own domain.
 */
export const SITE_NAME = "Prompt Battle";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://promptbattle.io").replace(
  /\/+$/,
  "",
);
export const REPO_URL = "https://github.com/ShaunBaumberger/promptbattle";
