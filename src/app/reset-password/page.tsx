import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Choose a new password" };

/**
 * Where Better Auth's `/reset-password/:token` redirect lands.
 *
 * The token is read here and handed down rather than read in the browser, so
 * the form is rendered knowing whether it has one - the difference between
 * asking for a password and explaining that the link is broken.
 *
 * Better Auth checks the token before redirecting here and, when it does not
 * hold up, sends `?error=INVALID_TOKEN` instead of `?token=`. Both arrive as a
 * page with no token, and they are not the same thing to have done: one is a
 * link that was cut in half by a mail client, the other is a link that was
 * already used or has aged out. Telling somebody to check for a truncated URL
 * when they simply took too long is how a working feature gets reported as
 * broken.
 *
 * Signed-in visitors are sent away for the same reason the sign-in page sends
 * them away: this is a way back in, and they are already in. Changing a
 * password you know is a different flow.
 */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  if (await getCurrentUser()) redirect("/recipes");

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const rejected = typeof params.error === "string";

  return (
    <AppShell>
      <ResetPasswordForm token={token} rejected={rejected} />
    </AppShell>
  );
}
