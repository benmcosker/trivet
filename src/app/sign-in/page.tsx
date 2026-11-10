import Box from "@mui/material/Box";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { PaperNote } from "@/components/PaperNote";
import { getCurrentUser } from "@/lib/session";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/recipes");
  const { deleted } = await searchParams;

  return (
    <AppShell>
      {/* Where an account deletion lands, so it ends on a plain answer. */}
      {deleted === "1" ? (
        <Box sx={{ mb: 3 }}>
          <PaperNote label="Your account is deleted" tone="good">
            Everything in it is gone from Trivet. Thank you for cooking with us.
          </PaperNote>
        </Box>
      ) : null}
      <AuthForm mode="sign-in" />
    </AppShell>
  );
}
