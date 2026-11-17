import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/session";

/**
 * TEMPORARY. Delete `src/app/debug/` once Sentry is confirmed to receive
 * errors and logs from production.
 *
 * The page exists only with `SENTRY_TEST_ENABLED=1` set, and only for an
 * admin (`ADMIN_EMAILS`). Checked by the page and again by each action,
 * because a server action can be called without the page.
 */
export async function debugAllowed(): Promise<boolean> {
  if (process.env.SENTRY_TEST_ENABLED !== "1") return false;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}
