/**
 * The parts of moderation the browser needs: what can be reported, and why.
 * Kept apart from `moderation.ts`, which talks to the database.
 */

/** Must match the `ReportReason` enum in prisma/schema.prisma. */
export const REPORT_REASONS = [
  { value: "OFFENSIVE", label: "Offensive or abusive" },
  { value: "NOT_A_RECIPE", label: "Not a recipe, or spam" },
  { value: "COPYRIGHT", label: "Copied without permission" },
  { value: "OTHER", label: "Something else" },
] as const;

export type ReportTarget = { recipeId: string } | { reviewId: string };
