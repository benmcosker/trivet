"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import {
  hideHousehold,
  reportContent,
  resolveReport,
  showHousehold,
  type ReportTarget,
} from "@/lib/moderation";
import { requireHousehold, requireUser } from "@/lib/session";

/** Report a shared recipe or a review. Always answers the same way. */
export async function reportContentAction(
  target: ReportTarget,
  reason: string,
  note: string | null,
): Promise<void> {
  const user = await requireHousehold();
  await reportContent(
    { id: user.id, householdId: user.householdId },
    { ...target, reason, note },
  );
}

function revalidateLibrary() {
  revalidatePath("/recipes/[id]", "page");
  revalidatePath("/recipes");
  revalidatePath("/plan");
  revalidatePath("/household");
}

/** Hide another household's shared recipes and reviews from this one. */
export async function hideHouseholdAction(hiddenId: string): Promise<void> {
  const { householdId } = await requireHousehold();
  await hideHousehold(householdId, hiddenId);
  revalidateLibrary();
}

/** Undo a hide, from the Household page. */
export async function showHouseholdAction(hiddenId: string): Promise<void> {
  const { householdId } = await requireHousehold();
  await showHousehold(householdId, hiddenId);
  revalidateLibrary();
}

/** An admin's answer to a report, from /admin. */
export async function resolveReportAction(
  reportId: string,
  action: "unshare" | "deleteReview" | "dismiss",
): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.email)) throw new Error("Not allowed");
  await resolveReport(reportId, action);
  revalidateLibrary();
  revalidatePath("/admin");
}
