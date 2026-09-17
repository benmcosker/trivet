/**
 * What the app needs to run, and what each missing piece costs.
 *
 * Checked at server startup (src/instrumentation.ts) rather than at module
 * import, so a build - which has no runtime secrets - is not held to runtime
 * requirements.
 */

export type EnvReport = {
  missingRequired: string[];
  disabledFeatures: { feature: string; missing: string; consequence: string }[];
};

/** Without these the app cannot serve a single authenticated request. */
const REQUIRED = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;

/**
 * Without these one feature degrades, and the UI already says so. They are not
 * startup failures: a household with no Anthropic key should still be able to
 * plan meals and type recipes in by hand.
 *
 * INSTACART_API_KEY is deliberately absent, and should stay absent. The
 * provider is complete and switches itself on the day a key exists, but no key
 * can be obtained while Instacart is refusing new developer applications - so
 * warning about it on every boot is a permanent alarm about a closed door,
 * which is how people learn to read past startup warnings. Nothing is
 * actionable, so nothing is said.
 */
const OPTIONAL = [
  {
    feature: "PDF recipe extraction",
    missing: "ANTHROPIC_API_KEY",
    consequence: "Uploads return a clear error; recipes can still be typed in.",
  },
  {
    feature: "Texting the shopping list",
    missing: "TWILIO_ACCOUNT_SID",
    consequence:
      "The button is hidden; the list can still be copied as text. Needs " +
      "TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER alongside it, and US numbers " +
      "need A2P 10DLC registration or carriers filter the messages silently.",
  },
  {
    feature: "Password resets",
    missing: "TWILIO_EMAIL_API_KEY",
    consequence:
      "The forgotten-password page says so rather than taking an address and " +
      "sending nothing. Needs EMAIL_FROM alongside it, at a domain " +
      "authenticated under Twilio's Email section.",
  },
  {
    feature: "Cloud file storage",
    missing: "BLOB_READ_WRITE_TOKEN",
    consequence:
      "Uploads are written to ./public/uploads, which is not durable on " +
      "serverless hosting - files vanish between deploys.",
  },
] as const;

/** Takes a plain map rather than NodeJS.ProcessEnv so tests can pass literals. */
export function checkEnv(
  env: Record<string, string | undefined> = process.env,
): EnvReport {
  return {
    missingRequired: REQUIRED.filter((key) => !env[key]?.trim()),
    disabledFeatures: OPTIONAL.filter((o) => !env[o.missing]?.trim()).map(
      (o) => ({ ...o }),
    ),
  };
}

/** A single message naming everything that is wrong, rather than one per boot. */
export function formatMissingRequired(missing: string[]): string {
  return [
    `Trivet cannot start: ${missing.length} required environment ` +
      `variable${missing.length === 1 ? "" : "s"} missing.`,
    ...missing.map((key) => `  - ${key}`),
    "",
    "See .env.example, and README.md for where each value comes from.",
  ].join("\n");
}
