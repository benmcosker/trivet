import type { ReportReason } from "@/generated/prisma/enums";

import { adminEmails } from "./admin";
import { prisma } from "./db";
import { emailAvailable, getEmailSender } from "./email";
import { REPORT_REASONS, type ReportTarget } from "./moderation-copy";
import { visibleRecipes } from "./recipe-visibility";

export { REPORT_REASONS, type ReportTarget };

/**
 * Hiding another household, and reporting what it shared.
 *
 * Apple's guideline 1.2, for apps where people see each other's content: a
 * way to report objectionable content with a timely answer, and a way to
 * block an abusive user. Trivet's shared content is the shared library and
 * the reviews on it, and the people behind it are households, so a household
 * is what is hidden. See `HouseholdBlock` and `ContentReport` in the schema.
 */

/**
 * Hide another household's shared recipes and reviews from this one.
 * Returns false for a household that does not exist, or this one: nobody can
 * hide their own kitchen from themselves.
 */
export async function hideHousehold(
  householdId: string,
  hiddenId: string,
): Promise<boolean> {
  if (householdId === hiddenId) return false;
  const exists = await prisma.household.findUnique({
    where: { id: hiddenId },
    select: { id: true },
  });
  if (!exists) return false;

  await prisma.householdBlock.upsert({
    where: {
      blockerId_blockedId: { blockerId: householdId, blockedId: hiddenId },
    },
    create: { blockerId: householdId, blockedId: hiddenId },
    update: {},
  });
  return true;
}

/** Undo `hideHousehold`. Scoped to this household's own list. */
export async function showHousehold(
  householdId: string,
  hiddenId: string,
): Promise<void> {
  await prisma.householdBlock.deleteMany({
    where: { blockerId: householdId, blockedId: hiddenId },
  });
}

/** The households this one has hidden, for the Household page. */
export async function listHiddenHouseholds(
  householdId: string,
): Promise<{ id: string; name: string; hiddenAt: Date }[]> {
  const blocks = await prisma.householdBlock.findMany({
    where: { blockerId: householdId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, blocked: { select: { id: true, name: true } } },
  });
  return blocks.map((block) => ({
    id: block.blocked.id,
    name: block.blocked.name,
    hiddenAt: block.createdAt,
  }));
}

const MAX_NOTE = 1000;

export type ReportInput = ReportTarget & {
  reason: string;
  note?: string | null;
};

/**
 * Report a shared recipe or a review from another household.
 *
 * Only what the reporter can see, and only what another household wrote:
 * your own recipe is yours to edit or delete, not to report. The admins are
 * emailed at once, and the report waits on /admin until it is resolved.
 *
 * Returns false when there is nothing reportable at that id, which the caller
 * treats the same as a report that went through, so an id cannot be probed.
 */
export async function reportContent(
  reporter: { id: string; householdId: string },
  input: ReportInput,
): Promise<boolean> {
  const reason: ReportReason | undefined = REPORT_REASONS.find(
    (r) => r.value === input.reason,
  )?.value;
  if (!reason) throw new Error("Unknown reason");
  const note = input.note?.trim().slice(0, MAX_NOTE) || null;

  let described: { what: string; household: string; path: string } | null;
  if ("recipeId" in input) {
    const recipe = await prisma.recipe.findFirst({
      where: {
        AND: [
          { id: input.recipeId, householdId: { not: reporter.householdId } },
          visibleRecipes(reporter.householdId),
        ],
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        household: { select: { name: true } },
      },
    });
    described = recipe && {
      what: `the recipe "${recipe.title}"`,
      household: recipe.household.name,
      path: `/recipes/${recipe.publicId}`,
    };
    if (recipe) {
      await prisma.contentReport.create({
        data: { reason, note, recipeId: recipe.id, reporterId: reporter.id },
      });
    }
  } else {
    const review = await prisma.recipeReview.findFirst({
      where: {
        id: input.reviewId,
        recipe: visibleRecipes(reporter.householdId),
        user: { householdId: { not: reporter.householdId } },
      },
      select: {
        id: true,
        user: { select: { name: true, household: { select: { name: true } } } },
        recipe: { select: { publicId: true, title: true } },
      },
    });
    described = review && {
      what: `a review by ${review.user.name} on "${review.recipe.title}"`,
      household: review.user.household?.name ?? "no household",
      path: `/recipes/${review.recipe.publicId}`,
    };
    if (review) {
      await prisma.contentReport.create({
        data: { reason, note, reviewId: review.id, reporterId: reporter.id },
      });
    }
  }

  if (!described) return false;
  await tellAdmins(reason, note, described);
  return true;
}

/** The email that makes a report timely. A failure is logged, not thrown. */
async function tellAdmins(
  reason: ReportReason,
  note: string | null,
  described: { what: string; household: string; path: string },
): Promise<void> {
  const to = adminEmails();
  if (to.length === 0 || !emailAvailable()) {
    console.error("[report] no admin email configured; a report is on /admin");
    return;
  }
  const label = REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
  const text = [
    `Somebody reported ${described.what}, shared by ${described.household}.`,
    "",
    `Reason: ${label}`,
    note ? `Their note: ${note}` : null,
    "",
    `See it: https://trivetbox.com${described.path}`,
    "Deal with it: https://trivetbox.com/admin",
  ]
    .filter((line) => line !== null)
    .join("\n");

  for (const address of to) {
    const result = await getEmailSender().send({
      to: address,
      subject: "Trivet: shared content reported",
      text,
    });
    if (!result.ok) console.error("[report] email failed:", result.error);
  }
}

export type OpenReport = {
  id: string;
  reason: string;
  note: string | null;
  createdAt: Date;
  reporter: string | null;
  recipe: {
    id: string;
    publicId: string;
    title: string;
    household: string;
    isShared: boolean;
  } | null;
  review: {
    id: string;
    body: string | null;
    stars: number;
    author: string;
    recipeTitle: string;
    recipePublicId: string;
  } | null;
};

/** Reports not yet resolved, oldest first: the queue on /admin. */
export async function listOpenReports(): Promise<OpenReport[]> {
  const reports = await prisma.contentReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reason: true,
      note: true,
      createdAt: true,
      reporter: { select: { name: true } },
      recipe: {
        select: {
          id: true,
          publicId: true,
          title: true,
          isShared: true,
          household: { select: { name: true } },
        },
      },
      review: {
        select: {
          id: true,
          body: true,
          stars: true,
          user: { select: { name: true } },
          recipe: { select: { title: true, publicId: true } },
        },
      },
    },
  });

  return reports.map((report) => ({
    id: report.id,
    reason:
      REPORT_REASONS.find((r) => r.value === report.reason)?.label ??
      report.reason,
    note: report.note,
    createdAt: report.createdAt,
    reporter: report.reporter?.name ?? null,
    recipe: report.recipe && {
      id: report.recipe.id,
      publicId: report.recipe.publicId,
      title: report.recipe.title,
      household: report.recipe.household.name,
      isShared: report.recipe.isShared,
    },
    review: report.review && {
      id: report.review.id,
      body: report.review.body,
      stars: report.review.stars,
      author: report.review.user.name,
      recipeTitle: report.review.recipe.title,
      recipePublicId: report.review.recipe.publicId,
    },
  }));
}

/**
 * What an admin does with a report.
 *
 * - `unshare`: the recipe leaves the shared library; its household keeps it.
 * - `deleteReview`: the review goes (and the report with it, by cascade).
 * - `dismiss`: nothing was wrong.
 *
 * Every report on the same recipe or review is resolved together.
 */
export async function resolveReport(
  reportId: string,
  action: "unshare" | "deleteReview" | "dismiss",
): Promise<void> {
  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
    select: { recipeId: true, reviewId: true },
  });
  if (!report) return;

  if (action === "unshare" && report.recipeId) {
    await prisma.recipe.update({
      where: { id: report.recipeId },
      data: { isShared: false },
    });
  }
  if (action === "deleteReview" && report.reviewId) {
    await prisma.recipeReview.deleteMany({ where: { id: report.reviewId } });
    return;
  }

  await prisma.contentReport.updateMany({
    where: report.recipeId
      ? { recipeId: report.recipeId, resolvedAt: null }
      : { reviewId: report.reviewId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}
