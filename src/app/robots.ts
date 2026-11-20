import type { MetadataRoute } from "next";

import { PUBLIC_PATHS, isProductionSite, siteUrl } from "@/lib/site";

/**
 * Served at /robots.txt.
 *
 * Production offers its public pages (the front page and the legal pages) and
 * asks crawlers to leave the rest alone: everything else is behind sign-in, so
 * a crawler only ever reaches the sign-in form there. Preview deployments ask
 * not to be crawled at all.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionSite()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: [...PUBLIC_PATHS],
      disallow: [
        "/api/",
        "/recipes",
        "/plan",
        "/pantry",
        "/upload",
        "/household",
        "/admin",
        "/consent",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
