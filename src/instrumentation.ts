import { checkEnv, formatMissingRequired } from "@/lib/env";

/**
 * Runs once when the server boots, before it handles a request.
 *
 * Missing required configuration fails here, loudly, rather than surfacing as
 * a 500 on whichever page a family member happened to open first. Optional
 * keys only log what they cost, since the features they gate degrade on
 * purpose.
 */
export async function register() {
  const { missingRequired, disabledFeatures } = checkEnv();

  if (missingRequired.length > 0) {
    throw new Error(formatMissingRequired(missingRequired));
  }

  for (const { feature, missing, consequence } of disabledFeatures) {
    console.warn(
      `[trivet] ${feature} is off (${missing} unset). ${consequence}`,
    );
  }
}
