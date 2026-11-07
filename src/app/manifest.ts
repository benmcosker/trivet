import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * What makes "Add to Home Screen" open Trivet as an app rather than a browser
 * tab, and the first of the pieces the offline shopping list needs
 * (OFFLINE-BROWSING-PLAN.md, Phase 0). The iPhone app in ios/ does not read
 * it; it wraps the site directly.
 *
 * Colours are the light scheme's paper and green from src/theme/theme.ts. A
 * manifest has no dark variant, and the paper is what shows while the first
 * page loads.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trivet",
    short_name: "Trivet",
    description:
      "Recipe box, weekly meal planner and grocery list for one household.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4ed",
    theme_color: "#2f6f4e",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "1024x1024" },
    ],
  };
}
