import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/LinkButton";
import { getCurrentUser } from "@/lib/session";
import { SITE_NAME, isTrivetApp } from "@/lib/site";

export const metadata: Metadata = {
  title: "Not found · Trivet",
};

/**
 * The 404: an address that matches nothing, or a page that called
 * `notFound()`, most often a recipe that is gone or not visible to this
 * household.
 *
 * It must not say which. `recipes/[id]/page.tsx` answers "no such recipe" and
 * "not shared with you" with the same 404 so a guessed id learns nothing, and
 * words like "deleted" or "no longer shared" here would undo that.
 *
 * Laid out as the front page's hero without its picture, so it sits on the
 * same left edge as the wordmark. "404" is only the small overline: a big
 * numeral is every other site's 404. The iPhone app has no address bar or
 * Back button, so there is always a way onward: into the app when signed in,
 * to Sign in otherwise.
 */
export default async function NotFound() {
  const signedIn = Boolean(await getCurrentUser());
  // "What Trivet is" goes to `/`, which sends the app straight to Sign in -
  // so inside the app it would be a second Sign in button.
  const inApp = isTrivetApp((await headers()).get("user-agent"));

  return (
    <AppShell>
      <Typography
        variant="overline"
        component="p"
        sx={{ color: "secondary.main", mb: { xs: 1, md: 2 } }}
      >
        Error 404
      </Typography>
      <Typography variant="h1" sx={{ mb: 3, textWrap: "balance" }}>
        Nothing here.
      </Typography>
      <Typography
        sx={{
          mb: signedIn ? 4 : 2,
          maxWidth: "48ch",
          fontSize: { md: "1.25rem" },
        }}
      >
        The link may be out of date, or the address mistyped.
      </Typography>
      {/* For a signed-out reader, and the web filters, a line saying what
          this site is. */}
      {signedIn ? null : (
        <Typography
          sx={{
            mb: 4,
            maxWidth: "48ch",
            fontSize: { md: "1.25rem" },
            color: "text.muted",
          }}
        >
          {SITE_NAME} is a recipe box, meal planner and grocery list for
          households.
        </Typography>
      )}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ gap: 2, alignItems: { xs: "flex-start", sm: "center" } }}
      >
        {signedIn ? (
          <>
            <LinkButton
              href="/recipes"
              variant="contained"
              color="ink"
              size="large"
            >
              Your recipes
            </LinkButton>
            <LinkButton href="/plan" size="large" sx={{ px: 0 }}>
              This week
            </LinkButton>
          </>
        ) : (
          <>
            <LinkButton
              href="/sign-in"
              variant="contained"
              color="ink"
              size="large"
            >
              Sign in
            </LinkButton>
            {inApp ? null : (
              <LinkButton href="/" size="large" sx={{ px: 0 }}>
                What Trivet is
              </LinkButton>
            )}
          </>
        )}
      </Stack>
    </AppShell>
  );
}
