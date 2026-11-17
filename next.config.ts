import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Sentry stamps each built file with its debug ID, not Turbopack.
   *
   * With Turbopack's own stamping on (the default under Sentry), the upload
   * step stamps the files a second time on top and leaves the source maps one
   * line short, so every server stack trace reported to Sentry pointed at
   * nothing: `js_invalid_sourcemap_location`, line 3 of a map that started on
   * line 2. Measured on a clean build: off, Sentry stamps once and rewrites
   * the map to match, and the positions line up.
   */
  turbopack: { debugIds: false },
  experimental: {
    /**
     * Keep a page you just left for half a minute, so going straight back to
     * it - the recipe page's Recipes link, mostly - reuses it instead of
     * fetching it again.
     *
     * Without this, going back to the library showed its loading outline
     * first, and a page that arrives through an outline gets no view
     * transition: the fade back from a recipe was lost (#166). Reused, the
     * library comes back at once and the `nav-back` transition runs.
     *
     * Anything you change yourself still shows: the server actions call
     * `revalidatePath`, which clears this. What can be up to 30 seconds old
     * is a change made somewhere else - another phone, or an AI assistant -
     * on a page you only just left. The wordmark always loads fresh.
     */
    staleTimes: { dynamic: 30 },
  },
  images: {
    /**
     * Dish photos live in Vercel Blob, on a per-store subdomain. Next refuses
     * to optimise a remote host it has not been told about, which is the point:
     * without this an open image endpoint would resize anything on the internet
     * at our expense.
     *
     * Locally there is nothing to allow - the disk driver serves from /public,
     * which is same-origin.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],

    /**
     * A dish photo is decoration. AVIF encodes smaller than WebP but costs
     * noticeably more CPU per transformation, and transformations are metered;
     * WebP is the better trade here and every browser this app will meet
     * supports it.
     */
    formats: ["image/webp"],

    /**
     * Transformations are billed, so cache them for a long time. A recipe photo
     * is immutable in practice - replacing one writes a new blob with a new
     * URL - so there is nothing to go stale.
     */
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },

  /**
   * The policy pages moved up from /legal/* to the root.
   *
   * They are the URLs a carrier is given when registering the messaging
   * campaign, and /privacy is the path a reviewer - or a crawler probing for
   * one - tries first. Kept as redirects rather than served at both paths:
   * "multiple or conflicting privacy policies" is itself a listed reason for
   * refusing a campaign, so there must be exactly one page, findable by either
   * name.
   *
   * Permanent, because these are the addresses of the documents now, and a
   * temporary redirect invites a crawler to keep asking for the old one.
   */
  async redirects() {
    return [
      { source: "/legal/privacy", destination: "/privacy", permanent: true },
      { source: "/legal/terms", destination: "/terms", permanent: true },
      { source: "/legal/sms", destination: "/sms", permanent: true },
      { source: "/legal", destination: "/privacy", permanent: true },
    ];
  },
};

/**
 * Sentry's build step: source maps, so an error points at a file and a line
 * rather than at minified code, and the `/monitoring` route the browser
 * reports through.
 *
 * The maps are uploaded only when `SENTRY_AUTH_TOKEN` is set (in Vercel, as a
 * sensitive variable), and deleted from the build afterwards either way, so
 * the site never serves its own source. Without the token the build is
 * exactly what it was.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: process.env.SENTRY_AUTH_TOKEN ? false : "disable-upload",
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  telemetry: false,
});
