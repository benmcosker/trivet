import type { MetadataRoute } from "next";

import { PUBLIC_PATHS, siteUrl } from "@/lib/site";

/** Served at /sitemap.xml: the pages anyone can read. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.3,
  }));
}
