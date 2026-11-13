import Box from "@mui/material/Box";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { PaperNote } from "@/components/PaperNote";
import { getCurrentUser } from "@/lib/session";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { deleted, sig } = await searchParams;
  // Signed in already goes to the library - except mid-way through an AI
  // assistant's sign-in (a signed `sig` in the address), which has to carry on.
  if (!sig && (await getCurrentUser())) redirect("/recipes");

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
