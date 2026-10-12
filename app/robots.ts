import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Game rooms and host tools are per-event and private.
      disallow: ["/admin", "/play/", "/stage/", "/auth/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
